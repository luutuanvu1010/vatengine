// Tải HỒ SƠ GỐC của MỘT hóa đơn từ GDT — bản XML có chữ ký số do người bán phát
// hành, GDT gói sẵn trong ZIP. Nhận token (đã đăng nhập ở U1) — KHÔNG tự đăng nhập,
// KHÔNG chạm DB/tenant_id (lưu vào R2 + bảng theo dõi là việc của tầng trên).
// Xem .claude/rules/gdt-adapter.md và docs/plans/U37-HO-SO-KHOI-DONG-*.md.
//
// Bằng chứng cho đường dẫn/tham số/xác thực: khối chú thích của EXPORT_XML_ENDPOINTS
// trong endpoints.ts (hai tầng — bundle JS của cổng GDT + probe thật 2026-07-28).
//
// Adapter CỐ Ý trả NGUYÊN byte ZIP, không giải nén: tách 5 file bên trong và quyết
// định lưu file nào là việc của tầng đồng bộ (U37a gói 2), không phải của lớp cô lập
// HTTP. Giữ adapter mỏng đúng ADR-0001.

import type { InvoiceDetailRef } from "./detail";
import { BASE, EXPORT_XML_ENDPOINTS } from "./endpoints";
import { GdtError } from "./errors";
import { type RetryOptions, fetchWithRetry } from "./http";
import type { GdtTransport } from "./transport";

/**
 * Thông điệp GDT trả khi hóa đơn không có hồ sơ gốc — ĐÃ KIỂM CHỨNG nguyên văn
 * (U37 §4.7): `{"message":"Không tồn tại hồ sơ gốc của hóa đơn.", …}` kèm **HTTP 500**.
 * Khớp lỏng (không dấu chấm cuối, không phân biệt hoa thường) để một thay đổi nhỏ về
 * dấu câu phía GDT không làm ta quay lại retry vô ích.
 */
const MAU_THIEU_HO_SO_GOC = /không tồn tại hồ sơ gốc/i;

/** Chữ ký ZIP chuẩn: "PK\x03\x04" ở đầu file. */
function laZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Phản hồi lỗi này có phải ca "hóa đơn không có hồ sơ gốc" không? Luôn đọc trên bản
 * sao để không tiêu thân của response gốc. Thân không phải JSON → `false` (coi là lỗi
 * hạ tầng tạm thời, vẫn đáng retry).
 */
async function docThongDiepThieuHoSoGoc(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { message?: unknown };
    const message = typeof body?.message === "string" ? body.message : "";
    return MAU_THIEU_HO_SO_GOC.test(message) ? message : null;
  } catch {
    return null;
  }
}

/**
 * Tải hồ sơ gốc của một hóa đơn, trả NGUYÊN byte ZIP.
 *
 * Phân loại lỗi:
 * - **401** → `SESSION_EXPIRED`, không retry (caller xử lý hết phiên).
 * - **500 + "Không tồn tại hồ sơ gốc"** → `NO_SOURCE_DOCUMENT`, **không retry**. Đây
 *   là lỗi vĩnh viễn đội lốt 5xx; theo lệ thường mỗi hóa đơn như vậy sẽ tốn
 *   `maxAttempts` request vô ích tới máy chủ thuế (U37 §4.7 hệ quả 3).
 * - 5xx/timeout khác → `fetchWithRetry` retry backoff; hết lượt ném `HTTP_ERROR`.
 * - HTTP lỗi còn lại → `HTTP_ERROR` mang `httpStatus` để tầng gọi phân loại.
 * - 200 nhưng không phải ZIP → ném `HTTP_ERROR` (nghi GDT đổi định dạng) thay vì trả
 *   byte rác cho tầng lưu trữ.
 */
export async function getInvoiceOriginalZip(
  transport: GdtTransport,
  token: string,
  ref: InvoiceDetailRef,
  opts?: RetryOptions,
): Promise<Uint8Array> {
  const endpoint = EXPORT_XML_ENDPOINTS[ref.source ?? "normal"];
  const query = new URLSearchParams({
    nbmst: String(ref.nbmst),
    khhdon: String(ref.khhdon),
    khmshdon: String(ref.khmshdon),
    shdon: String(ref.shdon),
  });

  const res = await fetchWithRetry(
    transport,
    `${BASE}${endpoint}?${query.toString()}`,
    { method: "GET", headers: { authorization: `Bearer ${token}` } },
    {
      ...opts,
      isPermanentError: async (r) => (await docThongDiepThieuHoSoGoc(r)) !== null,
    },
  );

  if (res.status === 401) {
    throw new GdtError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "SESSION_EXPIRED");
  }

  if (!res.ok) {
    const thieuHoSoGoc = await docThongDiepThieuHoSoGoc(res);
    if (thieuHoSoGoc !== null) {
      throw new GdtError(thieuHoSoGoc, "NO_SOURCE_DOCUMENT", res.status);
    }
    throw new GdtError(
      `Tải hồ sơ gốc hóa đơn ${endpoint} lỗi (HTTP ${res.status}).`,
      "HTTP_ERROR",
      res.status,
    );
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!laZip(bytes)) {
    throw new GdtError(
      `Phản hồi từ ${endpoint} không phải ZIP (HTTP ${res.status}, ${bytes.length} byte). Nghi GDT đổi định dạng — xem .claude/rules/gdt-adapter.md.`,
      "HTTP_ERROR",
      res.status,
    );
  }
  return bytes;
}

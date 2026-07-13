// Lấy chi tiết dòng hàng của MỘT hóa đơn từ GDT + ánh xạ mảng dòng hàng thô sang
// InvoiceLine chuẩn hóa. Nhận token (đã đăng nhập ở U1) — KHÔNG tự đăng nhập,
// KHÔNG chạm DB/tenant_id (lưu DongHangHoa + hoadon_id + tenant_id là U4/U5).
// Xem .claude/rules/gdt-adapter.md và KIEN_TRUC_VA_KE_HOACH.md mục 7.1.
//
// ĐÃ KIỂM CHỨNG (2026-07-13, probe detail thật từ Chrome đăng nhập thật — HĐ mua
// vào thường, dòng thuế suất 8%): GET /api/query/invoices/detail?nbmst&khhdon&
// shdon&khmshdon (CHỈ 4 tham số, KHÔNG có tdlap) trả 200; mảng dòng hàng ở khóa
// `hdhhdvu`; mỗi dòng có stt/ten/dvtinh/sluong/dgia/thtien + THUẾ SUẤT ở HAI trường:
// `ltsuat` (chuỗi hiển thị, vd "8%") và `tsuat` (số thập phân, vd 0.08); tiền thuế
// dòng ở `tthue` (có thể null). Bằng chứng: docs/CHECKLIST-NGHIEM-THU.md (U3) +
// ADR-0001 Amendment #6. Không ghi lại token/giá trị hóa đơn.

import { missingContractKeys } from "./contract";
import { BASE, DETAIL_ENDPOINTS } from "./endpoints";
import { GdtError } from "./errors";
import { type RetryOptions, fetchWithRetry } from "./http";
import type { InvoiceRow } from "./query";
import type { GdtTransport } from "./transport";

/**
 * Định danh một hóa đơn để lấy chi tiết. Detail chỉ dùng 4 trường
 * `(nbmst, khhdon, khmshdon, shdon)` — KHÔNG kèm `tdlap` (ĐÃ KIỂM CHỨNG). `source`
 * chọn họ endpoint (thường/máy tính tiền), khớp `_source` của `InvoiceRow` (U2).
 */
export interface InvoiceDetailRef {
  nbmst: string | number;
  khhdon: string | number;
  khmshdon: string | number;
  shdon: string | number;
  /** 'normal' (mặc định) | 'sco' (máy tính tiền). */
  source?: "normal" | "sco";
}

/** Body chi tiết thô từ GDT — giữ NGUYÊN toàn bộ trường (nền cho `raw_json` ở U4). */
export type InvoiceDetail = Record<string, unknown>;

/**
 * Một dòng hàng chuẩn hóa. Giữ `raw` để không mất trường lạ. Thuế suất giữ NGUYÊN
 * cả hai dạng GDT trả: `ltsuat` (chuỗi hiển thị "8%"/có thể mã "KCT"/"KKKNT"…) và
 * `tsuat` (số thập phân). KHÔNG ép kiểu ở tầng adapter — chuẩn hóa/đối chiếu là
 * quyết định U4/U5 (ép số sẽ mất mã chữ và lẫn "0%" với "KCT").
 */
export interface InvoiceLine {
  stt?: number;
  ten?: string;
  dvtinh?: string;
  sluong?: number;
  dgia?: number;
  thtien?: number;
  /** Thuế suất dạng hiển thị (chuỗi), vd "8%". Giữ nguyên giá trị gốc. */
  ltsuat?: unknown;
  /** Thuế suất dạng số thập phân, vd 0.08. Giữ nguyên giá trị gốc. */
  tsuat?: unknown;
  /** Tiền thuế của riêng dòng (có thể null). Giữ nguyên giá trị gốc. */
  tthue?: unknown;
  /**
   * Bản ghi dòng hàng THÔ (giữ đủ trường, nền cho `raw_json` ở U4). Cảnh báo bảo
   * mật: chứa dữ liệu hóa đơn nhạy cảm — tầng gọi KHÔNG log ở mức INFO trở lên
   * (.claude/rules/security.md).
   */
  raw: Record<string, unknown>;
}

// Khóa mảng dòng hàng trong body detail — ĐÃ KIỂM CHỨNG (2026-07-13).
const LINE_ARRAY_KEY = "hdhhdvu";

/**
 * Rút `InvoiceDetailRef` từ một `InvoiceRow` (U2). Bỏ `tdlap` vì detail không dùng;
 * mang `_source` sang `source` để chọn đúng họ endpoint.
 */
export function toDetailRef(row: InvoiceRow): InvoiceDetailRef {
  return {
    nbmst: row.nbmst as string | number,
    khhdon: row.khhdon as string | number,
    khmshdon: row.khmshdon as string | number,
    shdon: row.shdon as string | number,
    source: row._source,
  };
}

/**
 * Gọi endpoint detail cho MỘT hóa đơn, trả body thô (giữ nguyên mọi trường).
 * 401 → dừng ngay (SESSION_EXPIRED), không retry credential cũ. Lỗi tạm 5xx/timeout
 * đã được `fetchWithRetry` retry backoff; lỗi HTTP còn lại ném GdtError (không nuốt).
 * Kiểm hợp đồng MỀM `invoice_detail` (thiếu `hdhhdvu` chỉ cảnh báo, KHÔNG mở circuit
 * breaker) — đồng nhất `invoice_envelope`, xem .claude/rules/gdt-adapter.md.
 */
export async function getInvoiceDetail(
  transport: GdtTransport,
  token: string,
  ref: InvoiceDetailRef,
  opts?: RetryOptions,
): Promise<InvoiceDetail> {
  const endpoint = DETAIL_ENDPOINTS[ref.source ?? "normal"];
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
    opts,
  );

  if (res.status === 401) {
    throw new GdtError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "SESSION_EXPIRED");
  }
  if (!res.ok) {
    throw new GdtError(`Lấy chi tiết hóa đơn ${endpoint} lỗi (HTTP ${res.status}).`);
  }

  let data: InvoiceDetail;
  try {
    data = (await res.json()) as InvoiceDetail;
  } catch {
    throw new GdtError(`Phản hồi chi tiết không hợp lệ từ ${endpoint} (HTTP ${res.status}).`);
  }

  const missing = missingContractKeys(data, "invoice_detail");
  if (missing.length > 0) {
    console.warn(
      `Chi tiết hóa đơn từ ${endpoint} thiếu ${JSON.stringify(missing)} so với hợp đồng kỳ vọng (invoice_detail). Coi mảng dòng hàng rỗng, KHÔNG mở circuit breaker — xem .claude/rules/gdt-adapter.md.`,
    );
  }

  return data;
}

/**
 * Ánh xạ body detail thô → danh sách `InvoiceLine`. Thuần (không I/O). Thiếu/không
 * phải mảng `hdhhdvu` → trả `[]` + cảnh báo mềm (không throw). Giữ `raw` từng dòng
 * và giữ nguyên biểu diễn thuế suất (không ép kiểu).
 */
export function mapDetailLines(detail: InvoiceDetail): InvoiceLine[] {
  const rawLines = detail?.[LINE_ARRAY_KEY];
  if (!Array.isArray(rawLines)) {
    console.warn(
      `Body chi tiết thiếu mảng dòng hàng '${LINE_ARRAY_KEY}'. Trả rỗng, KHÔNG mở circuit breaker — xem .claude/rules/gdt-adapter.md.`,
    );
    return [];
  }

  return rawLines.map((entry) => {
    const line = (entry ?? {}) as Record<string, unknown>;
    return {
      stt: line.stt as number | undefined,
      ten: line.ten as string | undefined,
      dvtinh: line.dvtinh as string | undefined,
      sluong: line.sluong as number | undefined,
      dgia: line.dgia as number | undefined,
      thtien: line.thtien as number | undefined,
      ltsuat: line.ltsuat,
      tsuat: line.tsuat,
      tthue: line.tthue,
      raw: line,
    };
  });
}

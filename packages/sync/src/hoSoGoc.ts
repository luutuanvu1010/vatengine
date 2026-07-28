// U37a — HỒ SƠ GỐC hóa đơn: contract message hàng đợi + bộ tách gói ZIP của GDT.
//
// Adapter (`getInvoiceOriginalZip`) CỐ Ý trả nguyên byte ZIP và không giải nén — hiểu
// cấu trúc gói là việc của tầng đồng bộ, không phải của lớp cô lập HTTP (ADR-0001).
// Đây là chỗ làm việc đó.
//
// HÌNH DẠNG GÓI — ĐO THẬT 2026-07-28 (scripts/probe-export-xml-u37.mjs, U37 §4.7):
// ZIP 317.636 byte gồm ĐÚNG 5 file —
//   invoice.xml          10.338 B  bản gốc có chữ ký số `<HDon><DLHDon><TTChung>…`
//   invoice.html         32.186 B  bản thể hiện do CHÍNH GDT dựng sẵn
//   details.js          109.897 B  jQuery 1.8.2       ─┐
//   viewinvoice-bg.jpg  152.675 B  ảnh nền tờ hóa đơn  ├─ GIỐNG HỆT NHAU ở mọi hóa đơn
//   sign-check.jpg       11.928 B  dấu "Signature Valid" ┘  (~86% dung lượng gói)
//
// Vì sao tách riêng 3 file tĩnh: lưu chúng theo TỪNG hóa đơn thì 33.945 hóa đơn tốn
// ~10,5 GB thay vì ~1,4 GB. `invoice.html` tham chiếu chúng bằng TÊN PHẲNG, không tiền
// tố, và không nhúng base64 — nên chỉ cần MỘT bộ đặt cùng thư mục là bản thể hiện chạy
// đúng, KHÔNG phải sửa một ký tự nào trong HTML.
import { unzipSync } from "fflate";

/** Tên hai tệp thuộc riêng từng hóa đơn. Hằng để test canh được khi GDT đổi. */
export const TEN_TEP_XML = "invoice.xml";
export const TEN_TEP_HTML = "invoice.html";

/**
 * Ba tệp tĩnh dùng chung. ALLOWLIST cố định — KHÔNG phải "mọi tệp còn lại": nếu GDT
 * thêm tệp mới, ta không âm thầm nhân bản nó vào kho dùng chung mà chưa ai xem xét.
 */
export const TEP_TINH_DUNG_CHUNG = ["details.js", "viewinvoice-bg.jpg", "sign-check.jpg"] as const;

export interface HoSoGocDaTach {
  /** Bản gốc có chữ ký số — thứ có giá trị pháp lý. */
  xml: Uint8Array;
  /** Bản thể hiện GDT dựng sẵn (xem bằng mắt). */
  html: Uint8Array;
  /** Tài nguyên tĩnh có mặt trong gói này (giữ MỘT bộ cho cả kho). */
  taiNguyenChung: Record<string, Uint8Array>;
}

/**
 * Tách gói ZIP của GDT. FAIL-LOUD: thiếu `invoice.xml` hoặc `invoice.html` là dấu hiệu
 * GDT đổi định dạng ⇒ ném, KHÔNG trả rỗng im lặng để rồi lưu một kho hồ sơ gốc trống
 * ruột mà không ai biết (.claude/rules/gdt-adapter.md — không nuốt lỗi).
 *
 * Ngược lại, THIẾU một tài nguyên tĩnh thì KHÔNG ném: bản thể hiện vẫn mở được, chỉ
 * xấu đi — không đáng chặn cả đường lưu trữ.
 */
export function tachHoSoGoc(zip: Uint8Array): HoSoGocDaTach {
  const tep = unzipSync(zip);

  const xml = tep[TEN_TEP_XML];
  if (!xml) {
    throw new Error(
      `Gói hồ sơ gốc thiếu ${TEN_TEP_XML} — nghi GDT đổi định dạng gói. Có: ${Object.keys(tep).join(", ")}`,
    );
  }
  const html = tep[TEN_TEP_HTML];
  if (!html) {
    throw new Error(
      `Gói hồ sơ gốc thiếu ${TEN_TEP_HTML} — nghi GDT đổi định dạng gói. Có: ${Object.keys(tep).join(", ")}`,
    );
  }

  const taiNguyenChung: Record<string, Uint8Array> = {};
  for (const ten of TEP_TINH_DUNG_CHUNG) {
    const noiDung = tep[ten];
    if (noiDung) taiNguyenChung[ten] = noiDung;
  }

  return { xml, html, taiNguyenChung };
}

/**
 * Payload MỘT message tải hồ sơ gốc: một hóa đơn / message, đi CÙNG queue `vat-sync`
 * với header/detail/audit/delta. Phân biệt bằng `kind:"hoso"`.
 *
 * `ref` trùng khít `DetailSyncMessage["ref"]` vì `export-xml` dùng ĐÚNG 4 tham số định
 * danh như `/invoices/detail` (đã kiểm chứng, U37 §4.5). `tenantId` TƯỜNG MINH — job
 * nền không có request context (.claude/rules/multi-tenant.md).
 */
export interface HoSoGocMessage {
  kind: "hoso";
  tenantId: string;
  taikhoanId: string;
  /** `hoa_don.id` đích — khóa upsert vào `tep_hoa_don_goc`. */
  hoaDonId: string;
  ref: {
    nbmst: string;
    khhdon: string;
    khmshdon: string;
    shdon: string;
    source: "normal" | "sco";
  };
  /** Đẩy lùi (backpressure) — cùng ngữ nghĩa `SyncJobMessage.bpAttempt`. */
  bpAttempt?: number;
}

/** Phân nhánh consumer: chỉ tin `kind === "hoso"`. */
export function isHoSoGocMessage(body: unknown): body is HoSoGocMessage {
  return typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "hoso";
}

/** Dựng message từ danh sách hóa đơn cần tải — một nguồn sự thật cho mọi producer. */
export function buildHoSoGocMessages(
  account: { tenantId: string; taikhoanId: string },
  candidates: Array<{ hoaDonId: string; ref: HoSoGocMessage["ref"] }>,
): HoSoGocMessage[] {
  return candidates.map((c) => ({
    kind: "hoso",
    tenantId: account.tenantId,
    taikhoanId: account.taikhoanId,
    hoaDonId: c.hoaDonId,
    ref: c.ref,
  }));
}

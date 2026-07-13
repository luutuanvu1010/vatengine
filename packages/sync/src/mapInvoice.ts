// Ánh xạ một dòng hóa đơn thô của adapter (`InvoiceRow`, U2) → giá trị chèn bảng
// `hoa_don` (U4). Thuần, không I/O. KHÔNG chép `normalize_row()` di sản: định dạng
// giá trị đã kiểm chứng bằng probe thật (ADR-0001 Amendment #7):
//   - `tdlap`: ISO-8601 UTC KHÔNG mili giây (`YYYY-MM-DDTHH:mm:ssZ`); là một phần
//     khóa tự nhiên → parse ISO-8601 chuẩn (`new Date`), LƯU NGUYÊN thời khắc UTC,
//     KHÔNG tự cộng/trừ múi giờ (giờ VN chỉ là chuyện hiển thị ở tầng truy vấn).
//   - `ncnhat`: ISO-8601 UTC CÓ mili giây.
//   - tiền (`tgt*`): JSON number (có thể dạng khoa học) → lưu chuỗi cho cột `numeric`.
//   - `ttxly`/`tthai`: JSON integer.
import type { hoaDon } from "@vat/db";
import type { InvoiceRow } from "@vat/gdt-client";

type NewHoaDon = typeof hoaDon.$inferInsert;

/** Ép về chuỗi cho cột NOT NULL (khóa tự nhiên); null/undefined → chuỗi rỗng. */
function str(v: unknown): string {
  return String(v ?? "");
}

/** Chuỗi hoặc null cho cột text tùy chọn. */
function strOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}

/** Số tiền JSON number → chuỗi cho cột `numeric` (tránh sai số float); giữ chuỗi nếu đã là chuỗi. */
function numStr(v: unknown): string | null {
  return v == null ? null : String(v);
}

/** Số nguyên trạng thái (`ttxly`/`tthai`) hoặc null. */
function intOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Parse ISO-8601 → Date; giá trị không hợp lệ → null (caller quyết định fail-loud). */
function toDate(v: unknown): Date | null {
  if (v == null) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapInvoiceRowToHoaDon(row: InvoiceRow, tenantId: string): NewHoaDon {
  const tdlap = toDate(row.tdlap);
  if (!tdlap) {
    // FAIL-LOUD: tdlap thuộc khóa tự nhiên/UNIQUE — parse sai/thiếu sẽ hỏng idempotent.
    throw new Error(
      "Hóa đơn thiếu hoặc sai định dạng 'tdlap' (khóa tự nhiên, kỳ vọng ISO-8601) — không thể đồng bộ idempotent.",
    );
  }
  return {
    tenantId,
    nbmst: str(row.nbmst),
    nbten: strOrNull(row.nbten),
    nmmst: strOrNull(row.nmmst),
    nmten: strOrNull(row.nmten),
    khmshdon: str(row.khmshdon),
    khhdon: str(row.khhdon),
    shdon: str(row.shdon),
    tdlap,
    ncnhat: toDate(row.ncnhat),
    tgtcthue: numStr(row.tgtcthue),
    tgtthue: numStr(row.tgtthue),
    tgtttbso: numStr(row.tgtttbso),
    ttcktmai: numStr(row.ttcktmai),
    dvtte: strOrNull(row.dvtte),
    tgia: numStr(row.tgia),
    ttxly: intOrNull(row.ttxly),
    tthai: intOrNull(row.tthai),
    chieu: row._direction,
    nguon: row._source,
    rawJson: row,
  };
}

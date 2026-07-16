// Mẫu cột kết xuất chuẩn DUY NHẤT (U7) — port từ MVP `backend/gdt_client.py::EXPORT_COLUMNS`.
// Nguồn sự thật cho CẢ csv lẫn xlsx (không nhân đôi danh sách cột). ttxly/tthai xuất MÃ số
// (chốt #3: KHÔNG nhãn tiếng Việt — U6 đã hoãn nhãn, tránh nguồn sự thật thứ hai).
import type { HoaDonRow } from "@vat/query";
import type { InvoiceLineLike } from "./invoiceDoc";

export type ColumnKind = "text" | "date" | "money" | "int";

export interface ExportColumn {
  key: keyof HoaDonRow;
  label: string;
  kind: ColumnKind;
}

export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: "tdlap", label: "Ngày lập", kind: "date" },
  { key: "khmshdon", label: "Ký hiệu mẫu số", kind: "text" },
  { key: "khhdon", label: "Ký hiệu HĐ", kind: "text" },
  { key: "shdon", label: "Số HĐ", kind: "text" },
  { key: "nbmst", label: "MST người bán", kind: "text" },
  { key: "nbten", label: "Tên người bán", kind: "text" },
  { key: "nmmst", label: "MST người mua", kind: "text" },
  { key: "nmten", label: "Tên người mua", kind: "text" },
  { key: "tgtcthue", label: "Tiền chưa thuế", kind: "money" },
  { key: "tgtthue", label: "Tiền thuế", kind: "money" },
  { key: "tgtttbso", label: "Tổng thanh toán", kind: "money" },
  { key: "dvtte", label: "Tiền tệ", kind: "text" },
  { key: "ttxly", label: "Trạng thái xử lý (mã)", kind: "int" },
  { key: "tthai", label: "Trạng thái HĐ (mã)", kind: "int" },
  { key: "chieu", label: "Chiều", kind: "text" },
  { key: "nguon", label: "Nguồn", kind: "text" },
];

// Ô đã chuẩn hóa. `num` giữ giá trị dạng CHUỖI để KHÔNG bao giờ ép qua float (mục 7.1):
// tiền `numeric` Postgres có thể vượt 2^53 → csv giữ nguyên, xlsx nhét thẳng vào <v>.
export type ExportCell = { t: "str"; v: string } | { t: "num"; v: string } | { t: "blank" };

const BLANK: ExportCell = { t: "blank" };

/** Định dạng Date → chuỗi UTC ổn định "YYYY-MM-DD HH:mm:ss" (không phụ thuộc múi giờ chạy). */
export function formatDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

// Cột RENDER tổng quát: encoder (csv/xlsx) chỉ cần `header` (nhãn) + `money` (có áp numFmt
// "#,##0" cho ô số không) + hàm `cell` sinh ExportCell từ một hóa đơn. Đây là lớp chung cho
// CẢ mẫu native (U7) LẪN profile ánh xạ kế toán (U11) → một encoder duy nhất, không nhân
// đôi logic mã hóa (tránh nguồn sự thật thứ hai).
export interface RenderColumn<T = HoaDonRow> {
  header: string;
  money: boolean;
  cell: (row: T) => ExportCell;
}

/** Cột render cho mẫu native (U7): EXPORT_COLUMNS → RenderColumn. Nhãn = label, tiền =
 * kind 'money', ô = cellFor. Giữ nguyên hành vi U7 (wrapper csv/xlsx dùng list này). */
export function nativeRenderColumns(): RenderColumn[] {
  return EXPORT_COLUMNS.map((col) => ({
    header: col.label,
    money: col.kind === "money",
    cell: (row: HoaDonRow) => cellFor(col, row),
  }));
}

// ------------------------- Dòng hàng chi tiết (U23-B) ------------------------- //

// Một dòng hàng để kết xuất = trường của dong_hang_hoa (InvoiceLineLike) + khóa `shdon`
// liên kết về hóa đơn. NGUỒN CỘT DUY NHẤT cho cả xlsx (sheet "Chi tiết dòng hàng") lẫn
// csv (khối cùng tên) — không nhân đôi danh sách cột.
export type LineDetailRow = InvoiceLineLike & { shdon: string };

/** Tên sheet/khối dòng hàng — dùng chung xlsx (tên sheet 2) + csv (nhãn khối). */
export const LINE_DETAIL_SECTION = "Chi tiết dòng hàng";

const strCell = (v: string | null | undefined): ExportCell =>
  v === null || v === undefined ? BLANK : { t: "str", v };
// Số/tiền giữ CHUỖI nguyên bản (String không ép float) — >2^53 vẫn chính xác (mục 7.1).
const numCell = (v: string | number | null | undefined): ExportCell =>
  v === null || v === undefined ? BLANK : { t: "num", v: String(v) };

/** Cột render cho khối/sheet dòng hàng: shdon · stt · ten · dvtinh · sluong · dgia · thtien
 * · tsuat. `dgia`/`thtien` áp numFmt tiền; `sluong`/`tsuat` là số thô (không #,##0). */
export function lineDetailRenderColumns(): RenderColumn<LineDetailRow>[] {
  return [
    { header: "Số HĐ", money: false, cell: (r) => strCell(r.shdon) },
    { header: "STT", money: false, cell: (r) => numCell(r.stt) },
    { header: "Tên hàng hóa/dịch vụ", money: false, cell: (r) => strCell(r.ten) },
    { header: "ĐVT", money: false, cell: (r) => strCell(r.dvtinh) },
    { header: "Số lượng", money: false, cell: (r) => numCell(r.sluong) },
    { header: "Đơn giá", money: true, cell: (r) => numCell(r.dgia) },
    { header: "Thành tiền", money: true, cell: (r) => numCell(r.thtien) },
    { header: "Thuế suất", money: false, cell: (r) => numCell(r.tsuat) },
  ];
}

/** Chuẩn hóa một ô theo cột + hàng. null/undefined → trống (không giá trị giả). */
export function cellFor(col: ExportColumn, row: HoaDonRow): ExportCell {
  const raw = row[col.key];
  if (raw === null || raw === undefined) return BLANK;
  switch (col.kind) {
    case "date":
      return { t: "str", v: formatDate(raw instanceof Date ? raw : new Date(String(raw))) };
    case "money":
    case "int":
      return { t: "num", v: String(raw) };
    default:
      return { t: "str", v: String(raw) };
  }
}

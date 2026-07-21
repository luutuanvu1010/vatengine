// Mẫu cột kết xuất chuẩn DUY NHẤT (U7) — port từ MVP `backend/gdt_client.py::EXPORT_COLUMNS`.
// Nguồn sự thật cho CẢ csv lẫn xlsx (không nhân đôi danh sách cột). ttxly/tthai xuất MÃ số
// (chốt #3: KHÔNG nhãn tiếng Việt — U6 đã hoãn nhãn, tránh nguồn sự thật thứ hai).
import type { HangHoaTomTat } from "@vat/query";
import type { InvoiceLineLike } from "./invoiceDoc";
import type { ExportRow } from "./rows";

// `int`  — số nguyên thô, không numFmt (mã trạng thái). Tên giữ nguyên từ U7.
// `num`  — số CÓ THỂ THẬP PHÂN, không numFmt (U29). Tách khỏi `money` vì "#,##0" làm
//          tròn khi hiển thị: số lượng xăng dầu 62.925 lít sẽ hiện thành 63 ⇒ SAI.
//          Ô không bật cờ `money` sẽ không mang s="2", rơi vào numFmt General của
//          Excel — General hiện đủ phần thập phân (xlsx.ts:107 khai styles).
// (Nợ kỹ thuật: `int` là tên hẹp cho "số thô"; gộp `int`+`num` để sau — xem BACKLOG.)
// `list` — liệt kê mọi mặt hàng kèm số lượng CỦA CHÍNH NÓ, mỗi mặt hàng một dòng trong
// cùng một ô (nghiệm thu 2026-07-20, phương án b). Thay cho cặp cũ "Tên hàng (dòng đầu)"
// + "Tổng số lượng" đứng cạnh nhau — cặp đó đọc lướt thành "mặt hàng đầu có <tổng> đơn
// vị", tức SAI thông tin trên hóa đơn nhiều mặt hàng.
export type ColumnKind = "text" | "date" | "money" | "int" | "num" | "list";

export interface ExportColumn {
  key: keyof ExportRow;
  label: string;
  kind: ColumnKind;
}

// U29: cột phụ (ncnhat, hangHoa, soDongHang, ttcktmai) chèn theo trật tự
// NGHIỆP VỤ, không nối đuôi — thời điểm rẻ nhất để sắp lại là lúc còn ít khách hàng.
// `tgia` bị LOẠI (M3): production chưa có hóa đơn dvtte≠VND nào để kiểm chứng.
export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: "tdlap", label: "Ngày lập", kind: "date" },
  { key: "ncnhat", label: "Ngày cập nhật", kind: "date" },
  { key: "khmshdon", label: "Ký hiệu mẫu số", kind: "text" },
  { key: "khhdon", label: "Ký hiệu HĐ", kind: "text" },
  { key: "shdon", label: "Số HĐ", kind: "text" },
  { key: "nbmst", label: "MST người bán", kind: "text" },
  { key: "nbten", label: "Tên người bán", kind: "text" },
  { key: "nmmst", label: "MST người mua", kind: "text" },
  { key: "nmten", label: "Tên người mua", kind: "text" },
  { key: "hangHoa", label: "Hàng hóa, dịch vụ (số lượng)", kind: "list" },
  { key: "soDongHang", label: "Số dòng hàng", kind: "num" },
  { key: "tgtcthue", label: "Tiền chưa thuế", kind: "money" },
  { key: "ttcktmai", label: "Chiết khấu", kind: "money" },
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

/** Một mặt hàng → "Tên — <số lượng> <đơn vị>". Thiếu số lượng thì chỉ còn tên; thiếu đơn
 * vị thì bỏ đơn vị. KHÔNG bịa "0" khi hóa đơn không khai số lượng. */
// KHÔNG kèm đơn vị (quyết định chủ dự án 2026-07-21): "1 vé"/"2 vé" đọc thừa, chỉ cần
// "1"/"2". Đơn vị KHÔNG mất — vẫn còn ở cột ĐVT riêng của sheet 2 "Chi tiết dòng hàng".
function moTaHangHoa(h: HangHoaTomTat): string {
  const ten = (h.ten ?? "").trim();
  if (!ten) return "";
  if (h.sluong === null || h.sluong === undefined) return ten;
  return `${ten} — ${h.sluong}`;
}

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
export interface RenderColumn<T = ExportRow> {
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
    cell: (row: ExportRow) => cellFor(col, row),
  }));
}

// ------------------------- Dòng hàng chi tiết (U23-B) ------------------------- //

// Ngữ cảnh hóa đơn gắn vào MỖI dòng hàng (quyết định chủ dự án 2026-07-21): sheet "Chi
// tiết dòng hàng" thành sheet PHẲNG — mỗi mặt hàng một dòng, KÈM đủ thông tin hóa đơn để
// lọc/pivot/cộng thẳng trong Excel, không phải tra chéo với sheet 1.
export interface LineInvoiceContext {
  tdlap: Date;
  khhdon: string;
  shdon: string;
  nbmst: string;
  nbten: string | null;
  nmmst: string | null;
  nmten: string | null;
  chieu: string;
  nguon: string;
}

/** Trích ngữ cảnh hóa đơn cho dòng hàng — NGUỒN DUY NHẤT, dùng chung ở cả xlsx lẫn csv
 * (chép sang nơi thứ hai là mời gọi lệch). */
export function lineInvoiceContext(inv: ExportRow): LineInvoiceContext {
  return {
    tdlap: inv.tdlap,
    khhdon: inv.khhdon,
    shdon: inv.shdon,
    nbmst: inv.nbmst,
    nbten: inv.nbten,
    nmmst: inv.nmmst,
    nmten: inv.nmten,
    chieu: inv.chieu,
    nguon: inv.nguon,
  };
}

// Một dòng hàng để kết xuất = trường của dong_hang_hoa (InvoiceLineLike) + ngữ cảnh hóa
// đơn. NGUỒN CỘT DUY NHẤT cho cả xlsx (sheet "Chi tiết dòng hàng") lẫn csv (khối cùng tên)
// — không nhân đôi danh sách cột.
export type LineDetailRow = InvoiceLineLike & LineInvoiceContext;

/** Tên sheet/khối dòng hàng — dùng chung xlsx (tên sheet 2) + csv (nhãn khối). */
export const LINE_DETAIL_SECTION = "Chi tiết dòng hàng";

const strCell = (v: string | null | undefined): ExportCell =>
  v === null || v === undefined ? BLANK : { t: "str", v };
// Số/tiền giữ CHUỖI nguyên bản (String không ép float) — >2^53 vẫn chính xác (mục 7.1).
const numCell = (v: string | number | null | undefined): ExportCell =>
  v === null || v === undefined ? BLANK : { t: "num", v: String(v) };

/** Cột render cho khối/sheet dòng hàng: shdon · stt · ten · dvtinh · sluong · dgia · thtien
 * · ltsuat · tsuat · tsuatTien. `dgia`/`thtien`/`tsuatTien` áp numFmt tiền; `sluong`/`tsuat`
 * là số thô (không #,##0).
 *
 * U29 — "Mã thuế suất" (`ltsuat`) là cột CHỮ, đặt ngay trước cột số. Bằng chứng production
 * 2026-07-20: `KCT` (không chịu thuế) và `KKKNT` (không kê khai khấu trừ) đều có
 * `tsuat = 0`, y hệt thuế suất 0% thật ⇒ nếu chỉ xuất cột số thì BA nghiệp vụ khác nhau
 * gộp thành một chữ số `0`, không phân biệt nổi. `ltsuat` là thứ duy nhất tách được. */
export function lineDetailRenderColumns(): RenderColumn<LineDetailRow>[] {
  return [
    // Ngữ cảnh hóa đơn (2026-07-21) — đứng TRƯỚC, để mỗi dòng tự đủ thông tin lọc/pivot.
    { header: "Ngày lập", money: false, cell: (r) => ({ t: "str", v: formatDate(r.tdlap) }) },
    { header: "Ký hiệu HĐ", money: false, cell: (r) => strCell(r.khhdon) },
    { header: "Số HĐ", money: false, cell: (r) => strCell(r.shdon) },
    { header: "MST người bán", money: false, cell: (r) => strCell(r.nbmst) },
    { header: "Tên người bán", money: false, cell: (r) => strCell(r.nbten) },
    { header: "MST người mua", money: false, cell: (r) => strCell(r.nmmst) },
    { header: "Tên người mua", money: false, cell: (r) => strCell(r.nmten) },
    { header: "Chiều", money: false, cell: (r) => strCell(r.chieu) },
    { header: "Nguồn", money: false, cell: (r) => strCell(r.nguon) },
    // Chi tiết dòng hàng.
    { header: "STT", money: false, cell: (r) => numCell(r.stt) },
    { header: "Tên hàng hóa/dịch vụ", money: false, cell: (r) => strCell(r.ten) },
    { header: "ĐVT", money: false, cell: (r) => strCell(r.dvtinh) },
    { header: "Số lượng", money: false, cell: (r) => numCell(r.sluong) },
    { header: "Đơn giá", money: true, cell: (r) => numCell(r.dgia) },
    { header: "Thành tiền", money: true, cell: (r) => numCell(r.thtien) },
    { header: "Mã thuế suất", money: false, cell: (r) => strCell(r.ltsuat) },
    { header: "Thuế suất", money: false, cell: (r) => numCell(r.tsuat) },
    { header: "Tiền thuế dòng", money: true, cell: (r) => numCell(r.tsuatTien) },
  ];
}

/** Chuẩn hóa một ô theo cột + hàng. null/undefined → trống (không giá trị giả). */
export function cellFor(col: ExportColumn, row: ExportRow): ExportCell {
  const raw = row[col.key];
  // `list` xử lý TRƯỚC nhánh null: giá trị là MẢNG, và mảng rỗng phải thành ô trống chứ
  // không phải chuỗi "" — cùng ý nghĩa "chưa đồng bộ dòng hàng" như các cột khác.
  if (col.kind === "list") {
    const ds = Array.isArray(raw) ? (raw as HangHoaTomTat[]) : [];
    const dong = ds.map(moTaHangHoa).filter((x) => x.length > 0);
    return dong.length === 0 ? BLANK : { t: "str", v: dong.join("\n") };
  }
  if (raw === null || raw === undefined) return BLANK;
  switch (col.kind) {
    case "date":
      return { t: "str", v: formatDate(raw instanceof Date ? raw : new Date(String(raw))) };
    case "money":
    case "int":
    // `num` PHẢI nằm ở đây. Quên case → rơi xuống `default` và số bị xuất thành CHUỖI —
    // lỗi im lặng, tsc không bắt được (U29 §M1).
    case "num":
      return { t: "num", v: String(raw) };
    default:
      return { t: "str", v: String(raw) };
  }
}

// Mẫu cột kết xuất chuẩn DUY NHẤT (U7) — port từ MVP `backend/gdt_client.py::EXPORT_COLUMNS`.
// Nguồn sự thật cho CẢ csv lẫn xlsx (không nhân đôi danh sách cột). ttxly/tthai xuất MÃ số
// (chốt #3: KHÔNG nhãn tiếng Việt — U6 đã hoãn nhãn, tránh nguồn sự thật thứ hai).
//
// U-K1: EXPORT_COLUMNS DẪN XUẤT từ Registry miền hoá đơn (@vat/domain) — không còn khai tay
// ở đây (.claude/rules/ui.md "một nguồn sự thật cho trường hoá đơn"). Danh sách/nhãn/thứ tự
// GIỮ NGUYÊN hành vi cũ; chỉ đổi NGUỒN của nó.
import {
  type FlatExportCol,
  INVOICE_FIELDS,
  type InvoiceField,
  type InvoiceFieldKind,
  chonCotXuat,
  fieldsForExport,
} from "@vat/domain";
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

// U-K1: `kieu` (Registry) → `kind` (ExportColumn cũ). Registry gộp int/num/date/money vào
// kieu chung 'ngay'/'tien'/'ma' — ánh xạ tường minh ở đây để KHÔNG mất phân biệt mà encoder
// csv/xlsx cần (numFmt tiền vs mã số thô). `enum` chưa dùng ở U-K1 (chưa field nào khai).
const KIEU_TO_KIND: Record<InvoiceFieldKind, ColumnKind> = {
  text: "text",
  ngay: "date",
  tien: "money",
  ma: "int",
  list: "list",
  enum: "text",
};

/** `EXPORT_COLUMNS` dẫn xuất từ Registry — U-K1 §Thiết kế Registry: phải tái tạo CHÍNH XÁC
 * danh sách cũ (key/nhãn/kind/thứ tự). Sửa lệch Registry ⇒ test golden của EXPORT_COLUMNS đỏ. */
export function deriveExportColumns(fields: readonly InvoiceField[]): ExportColumn[] {
  return fields
    .filter((f) => f.tren.fileXuat === true)
    .map((f) => ({
      key: f.key as keyof ExportRow,
      label: f.nhan,
      kind: KIEU_TO_KIND[f.kieu],
    }));
}

// U29: cột phụ (ncnhat, hangHoa, soDongHang, ttcktmai) chèn theo trật tự
// NGHIỆP VỤ, không nối đuôi — thời điểm rẻ nhất để sắp lại là lúc còn ít khách hàng.
// `tgia` bị LOẠI (M3): production chưa có hóa đơn dvtte≠VND nào để kiểm chứng.
export const EXPORT_COLUMNS: readonly ExportColumn[] = deriveExportColumns(fieldsForExport());

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
  /** Bề rộng cột gợi ý cho xlsx (ký tự). Bỏ trống → encoder tự chọn mặc định. */
  width?: number;
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

// ------------------------- Sheet PHẲNG: mỗi mặt hàng một dòng ------------------------- //

// Quyết định chủ dự án 2026-07-21 (làm gọn): file xuất chỉ còn MỘT sheet phẳng — mỗi mặt
// hàng một dòng, KÈM đủ thông tin hóa đơn (lặp lại vì cùng hóa đơn). Bỏ sheet "tổng quan"
// và cột "Số dòng hàng". Người dùng lọc/pivot/cộng theo TỪNG mặt hàng ngay trên một sheet.
//
// Ngữ cảnh hóa đơn gắn vào mỗi dòng. Gồm cả TIỀN CẤP HÓA ĐƠN — các cột này LẶP LẠI ở mọi
// dòng của cùng hóa đơn, nên nhãn ghi rõ "(cả HĐ)" để người dùng KHÔNG quét cộng nhầm
// (một HĐ 3 mặt hàng mà cộng "Tổng thanh toán" sẽ ra gấp 3).
export interface LineInvoiceContext {
  tdlap: Date;
  ncnhat: Date | null;
  khmshdon: string;
  khhdon: string;
  shdon: string;
  nbmst: string;
  nbten: string | null;
  nmmst: string | null;
  nmten: string | null;
  chieu: string;
  nguon: string;
  dvtte: string | null;
  ttxly: number | null;
  tthai: number | null;
  // Tiền cấp hóa đơn (lặp mỗi dòng — nhãn "(cả HĐ)").
  tgtcthue: string | null;
  ttcktmai: string | null;
  tgtthue: string | null;
  tgtttbso: string | null;
}

/** Trích ngữ cảnh hóa đơn cho dòng hàng — NGUỒN DUY NHẤT, dùng chung ở cả xlsx lẫn csv
 * (chép sang nơi thứ hai là mời gọi lệch). */
export function lineInvoiceContext(inv: ExportRow): LineInvoiceContext {
  return {
    tdlap: inv.tdlap,
    ncnhat: inv.ncnhat,
    khmshdon: inv.khmshdon,
    khhdon: inv.khhdon,
    shdon: inv.shdon,
    nbmst: inv.nbmst,
    nbten: inv.nbten,
    nmmst: inv.nmmst,
    nmten: inv.nmten,
    chieu: inv.chieu,
    nguon: inv.nguon,
    dvtte: inv.dvtte,
    ttxly: inv.ttxly,
    tthai: inv.tthai,
    tgtcthue: inv.tgtcthue,
    ttcktmai: inv.ttcktmai,
    tgtthue: inv.tgtthue,
    tgtttbso: inv.tgtttbso,
  };
}

/** Ô dòng hàng có thể RỖNG: hóa đơn chưa đồng bộ chi tiết vẫn phải xuất hiện MỘT dòng
 * (không được biến mất khỏi file) — khi đó mọi trường dòng hàng là null. */
export type LineOrEmpty = {
  [K in keyof InvoiceLineLike]: InvoiceLineLike[K] | null;
};

// Một dòng của sheet phẳng = ngữ cảnh hóa đơn + (một mặt hàng HOẶC rỗng nếu HĐ chưa có dòng)
// + `sttFile` (số chạy TOÀN FILE 1..N do encoder bơm trước khi mã hóa từng dòng).
// NGUỒN CỘT DUY NHẤT cho cả xlsx lẫn csv — không nhân đôi danh sách cột.
export type LineDetailRow = LineOrEmpty & LineInvoiceContext & { sttFile?: number };

/** Tên sheet phẳng — dùng chung xlsx (tên sheet) + csv (nhãn khối). */
export const LINE_DETAIL_SECTION = "Hóa đơn & hàng hóa";

/** Dòng hàng RỖNG — mọi trường null. Dùng cho hóa đơn chưa đồng bộ dòng hàng: vẫn xuất
 * một dòng (giữ hóa đơn trong file) với phần chi tiết dòng để trống. */
export const EMPTY_LINE: LineOrEmpty = {
  stt: null,
  ten: null,
  dvtinh: null,
  sluong: null,
  dgia: null,
  thtien: null,
  ltsuat: null,
  tsuat: null,
  tsuatTien: null,
};

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
const dateCell = (d: Date | null): ExportCell => (d ? { t: "str", v: formatDate(d) } : BLANK);

// Cộng hai chuỗi số thập phân CHÍNH XÁC (BigInt, KHÔNG parseFloat — tiền numeric có thể
// >2^53). Giữ dấu + phần thập phân; cắt số 0 thừa cuối. Dùng cho "Tổng tiền (sau thuế)".
function tachThapPhan(s: string): { val: bigint; scale: number } {
  const neg = s.startsWith("-");
  const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
  const digits = `${i}${f}`.replace(/^0+(?=\d)/, "") || "0";
  return { val: BigInt(digits) * (neg ? -1n : 1n), scale: f.length };
}
function dinhDangThapPhan(v: bigint, scale: number): string {
  if (scale === 0) return v.toString();
  const neg = v < 0n;
  const s = (neg ? -v : v).toString().padStart(scale + 1, "0");
  const phanNguyen = s.slice(0, s.length - scale);
  const phanThap = s.slice(s.length - scale).replace(/0+$/, "");
  return `${neg ? "-" : ""}${phanNguyen}${phanThap ? `.${phanThap}` : ""}`;
}
export function congThapPhan(a: string, b: string): string {
  const pa = tachThapPhan(a);
  const pb = tachThapPhan(b);
  const scale = Math.max(pa.scale, pb.scale);
  const na = pa.val * 10n ** BigInt(scale - pa.scale);
  const nb = pb.val * 10n ** BigInt(scale - pb.scale);
  return dinhDangThapPhan(na + nb, scale);
}

/** "Tổng tiền (sau thuế)" mức DÒNG = thtien + tsuatTien. Thiếu một vế → trống (không bịa số). */
function tongSauThue(r: LineDetailRow): ExportCell {
  if (r.thtien === null || r.thtien === undefined) return BLANK;
  if (r.tsuatTien === null || r.tsuatTien === undefined) return BLANK;
  return { t: "num", v: congThapPhan(String(r.thtien), String(r.tsuatTien)) };
}

// Nhãn VN cho `chieu` lấy TỪ Registry (@vat/domain) — file xuất hiện "Mua vào"/"Bán ra" thay
// mã gốc "purchase"/"sold" (chủ dự án 2026-07-23). Một nguồn: khớp nhãn bộ lọc/bảng. Giá trị
// lạ (chưa map) → giữ nguyên, không nuốt.
const CHIEU_NHAN: Record<string, string> = Object.fromEntries(
  (INVOICE_FIELDS.find((f) => f.key === "chieu")?.enum ?? []).map(([v, nhan]) => [v, nhan]),
);

// Ánh xạ key catalog (@vat/domain FLAT_EXPORT_COLUMNS) → hàm sinh ô. `sttFile` đọc số encoder
// bơm vào; `sttDong` = `stt` gốc GDT; `tongSauThue` là cột TÍNH. Còn lại đọc thẳng trường
// cùng tên trên LineDetailRow. Đây là chỗ DUY NHẤT gắn logic ô cho từng cột.
const O_THEO_KEY: Record<string, (r: LineDetailRow) => ExportCell> = {
  sttFile: (r) => numCell(r.sttFile),
  tdlap: (r) => dateCell(r.tdlap),
  ncnhat: (r) => dateCell(r.ncnhat),
  khmshdon: (r) => strCell(r.khmshdon),
  khhdon: (r) => strCell(r.khhdon),
  shdon: (r) => strCell(r.shdon),
  chieu: (r) => strCell(CHIEU_NHAN[r.chieu] ?? r.chieu),
  nguon: (r) => strCell(r.nguon),
  nbten: (r) => strCell(r.nbten),
  nbmst: (r) => strCell(r.nbmst),
  nmten: (r) => strCell(r.nmten),
  nmmst: (r) => strCell(r.nmmst),
  sttDong: (r) => numCell(r.stt),
  ten: (r) => strCell(r.ten),
  dvtinh: (r) => strCell(r.dvtinh),
  sluong: (r) => numCell(r.sluong),
  dgia: (r) => numCell(r.dgia),
  thtien: (r) => numCell(r.thtien),
  ltsuat: (r) => strCell(r.ltsuat),
  tsuat: (r) => numCell(r.tsuat),
  tsuatTien: (r) => numCell(r.tsuatTien),
  tongSauThue,
  dvtte: (r) => strCell(r.dvtte),
  ttxly: (r) => numCell(r.ttxly),
  tthai: (r) => numCell(r.tthai),
  tgtcthue: (r) => numCell(r.tgtcthue),
  ttcktmai: (r) => numCell(r.ttcktmai),
  tgtthue: (r) => numCell(r.tgtthue),
  tgtttbso: (r) => numCell(r.tgtttbso),
};

// Bề rộng cột (ký tự) cho file "dễ nhìn" — tên công ty/hàng hóa rộng, mã/số hẹp, ngày/tiền vừa.
function beRong(c: FlatExportCol): number {
  if (c.key === "nbten" || c.key === "nmten" || c.key === "ten") return 34;
  if (c.key === "sttFile" || c.key === "sttDong") return 8;
  if (c.kieu === "tien") return 16;
  if (c.kieu === "ngay") return 20;
  if (c.nhom === "nguoi") return 16; // MST bán/mua
  return Math.min(Math.max(c.nhan.length + 3, 12), 24);
}

/** Cột render sheet phẳng — DẪN XUẤT từ catalog `@vat/domain`. `cols` = key người dùng chọn
 * (bỏ key lạ, sắp theo thứ tự catalog); rỗng/thiếu → 16 cột mặc định. `money` (numFmt tiền)
 * suy từ `kieu === "tien"`; `width` cho xlsx dễ nhìn. */
export function flatRenderColumns(cols?: readonly string[] | null): RenderColumn<LineDetailRow>[] {
  return chonCotXuat(cols).map((c: FlatExportCol) => {
    const cell = O_THEO_KEY[c.key];
    // Catalog thêm cột mà quên gắn ô ⇒ hỏng to (cột trống im lặng). Fail-loud.
    if (!cell) throw new Error(`Thiếu hàm sinh ô cho cột xuất: ${c.key}`);
    return { header: c.nhan, money: c.kieu === "tien", cell, width: beRong(c) };
  });
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

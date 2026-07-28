// Bộ lọc + phân trang cho tra cứu hóa đơn (U6). Validate bằng Zod (ngăn xếp ADR-0001).
// `buildWhere` LUÔN kèm ràng buộc `tenant_id` tường minh (lớp 1 — multi-tenant.md);
// RLS `withTenant` là lớp 2. Khoảng `tdlap` fail-loud khi ngày phi thực tế (không đoán).
import { hoaDon } from "@vat/db";
import { TTHAI, sortableKeys } from "@vat/domain";
import { type SQL, and, asc, desc, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { z } from "zod";

export const INVOICE_DIRECTIONS = ["purchase", "sold"] as const;
export const INVOICE_SOURCES = ["normal", "sco"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải định dạng YYYY-MM-DD");

// U31 — trần độ dài mọi ô lọc văn bản. Rộng rãi so với dữ liệu thật (tên doanh nghiệp
// dài nhất cũng dưới 200 ký tự) nhưng chặn được chuỗi tìm phi lý.
const MAX_LOC_CHARS = 200;

// Zod chỉ kiểm ĐỊNH DẠNG. Bộ lọc; key lạ (limit/offset) bị bỏ qua (không strict) để
// route parse chung một object query cho cả filter lẫn page.
export const invoiceFilterSchema = z.object({
  chieu: z.enum(INVOICE_DIRECTIONS).optional(),
  nguon: z.enum(INVOICE_SOURCES).optional(),
  tuNgay: isoDate.optional(),
  denNgay: isoDate.optional(),
  ttxly: z.coerce.number().int().optional(),
  tthai: z.coerce.number().int().optional(),
  /** U39 — chỉ lấy hóa đơn ĐÃ BỊ một hóa đơn khác sửa: mã 4 (bị thay thế) + mã 5 (bị điều
   * chỉnh). Đây là nhóm kế toán cần soi trước khi kê khai.
   *
   * Vì sao cần cờ riêng thay vì `tthai=4`: cần HAI mã cùng lúc, mà `tthai` là một số. Và
   * việc "mã nào nghĩa là bị sửa" phải khai một nơi (`@vat/domain`), không rải 4/5 vào
   * query string của client. */
  biSua: z.coerce.boolean().optional(),
  nbmst: z.string().min(1).optional(),
  nmmst: z.string().min(1).optional(),
  // U31 — lọc theo cột. Văn bản là "chứa", không phân biệt hoa thường (xem buildWhere).
  // KHÔNG dùng .min(1): ô nhập rỗng vẫn hợp lệ, chỉ là không sinh mệnh đề lọc — bắt lỗi
  // ở đây sẽ làm UI báo đỏ khi người dùng xóa hết chữ trong ô, vô lý.
  // `.max()` là trần PHÒNG THỦ, không phải luật nghiệp vụ: `ilike '%…%'` quét tuần tự nên
  // chuỗi tìm dài bất thường là bề mặt DoS rẻ tiền. Chặn tường minh ở đây thay vì dựa ngầm
  // vào giới hạn độ dài URL của hạ tầng — thứ CHƯA KIỂM CHỨNG trong repo này.
  shdon: z.string().max(MAX_LOC_CHARS).optional(),
  nbten: z.string().max(MAX_LOC_CHARS).optional(),
  nmten: z.string().max(MAX_LOC_CHARS).optional(),
  dvtte: z.string().max(MAX_LOC_CHARS).optional(),
  // Khoảng tổng thanh toán — giữ CHUỖI (numeric Postgres có thể vượt 2^53, ép số là mất
  // chính xác). Chỉ kiểm dạng số, so sánh để Postgres làm.
  ttbsoTu: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .optional(),
  ttbsoDen: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .optional(),
});
export type InvoiceFilter = z.infer<typeof invoiceFilterSchema>;

// ------------------------- Chọn dòng để xuất (U30) ------------------------- //

/** Trần số hóa đơn chọn tay trong một lần xuất.
 * ⚠️ Đây là trần SẢN PHẨM (chặn hành vi phi thực tế: chọn tay >1000 dòng thì nên dùng
 * bộ lọc), KHÔNG phải trần KỸ THUẬT đã đo. Giới hạn thật của Workers/Hyperdrive với câu
 * `IN (...)` dài CHƯA KIỂM CHỨNG — nếu sau này chạm trần thấp hơn thì hạ số này xuống,
 * đừng coi 1000 là con số đã kiểm chứng. (Quyết định chủ dự án 2026-07-20, U30 §7-M1.) */
export const MAX_EXPORT_IDS = 1000;

// Body của POST /exports. `ids` là input KHÔNG TIN CẬY → ép đúng dạng uuid để không nhét
// được chuỗi tùy ý vào mệnh đề IN. Mảng RỖNG bị từ chối: client muốn "xuất theo bộ lọc"
// thì bỏ hẳn `ids`, không gửi [] mơ hồ.
export const exportSelectionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_EXPORT_IDS).optional(),
  // Cột người dùng chọn cho file xuất phẳng (key catalog @vat/domain). KHÔNG tin input:
  // chỉ ép dạng chuỗi + trần số phần tử; ALLOWLIST theo catalog nằm ở @vat/export
  // (`chonCotXuat` bỏ key lạ) — Zod chỉ chặn dạng, không thay allowlist.
  cols: z.array(z.string().max(40)).max(64).optional(),
});

/** Bộ lọc U6 + danh sách ID chọn tay (U30). `ids` chỉ THU HẸP tập — xem buildWhere. */
export type InvoiceSelection = InvoiceFilter & { ids?: string[] };

// ---------------------- Sắp xếp theo cột (U31) ---------------------- //

// ⚠️ ALLOWLIST — tên cột sắp xếp đến từ CLIENT và đi thẳng vào ORDER BY. Nội suy chuỗi
// đó vào SQL là injection trực tiếp. Bảng tra cứu này là hàng rào duy nhất: khóa do ta
// định nghĩa, giá trị là tham chiếu cột Drizzle (không phải chuỗi). KHÔNG BAO GIỜ dựng
// tên cột từ input.
//
// U-K2 — DANH SÁCH KHÓA nay dẫn xuất từ Registry miền hoá đơn (`sortableKeys()`), không
// khai tay hai nơi. Registry *sinh ra* allowlist chứ KHÔNG thay nó: bảng tra dưới đây vẫn
// là hàng rào (khóa → cột Drizzle), và Zod `sortSchema` vẫn validate input không tin cậy.
// Cố ý KHÔNG cho sắp theo `tenantId`/`rawJson`/`createdAt` — nội bộ, không phải nghiệp vụ;
// chúng không mang `sapDuoc` trong Registry nên không lọt vào đây.
const SORT_COLUMNS = {
  tdlap: hoaDon.tdlap,
  shdon: hoaDon.shdon,
  nbten: hoaDon.nbten,
  nmten: hoaDon.nmten,
  tgtcthue: hoaDon.tgtcthue,
  tgtthue: hoaDon.tgtthue,
  tgtttbso: hoaDon.tgtttbso,
  dvtte: hoaDon.dvtte,
  ttxly: hoaDon.ttxly,
  tthai: hoaDon.tthai,
  chieu: hoaDon.chieu,
  nguon: hoaDon.nguon,
} as const;

// Kiểu vẫn là UNION 12 literal (không nới thành `string`): bảng tra là nguồn KIỂU, Registry
// là nguồn DANH SÁCH. Khẳng định dưới đây buộc hai bên trùng khớp ngay lúc nạp module.
export type SortBy = keyof typeof SORT_COLUMNS;

/** Khóa sắp xếp → cột Drizzle. Ném khi thiếu ánh xạ: khai `sapDuoc` trong Registry cho một
 * trường chưa có cột ở đây là LỖI CẤU HÌNH, phải nổ ngay chứ không được âm thầm rơi về cột
 * mặc định (sắp sai cột là lỗi im lặng — người dùng tưởng đã sắp, thực ra chưa). */
export function cotSapXep(key: string): (typeof SORT_COLUMNS)[SortBy] {
  const cot = (SORT_COLUMNS as Record<string, (typeof SORT_COLUMNS)[SortBy] | undefined>)[key];
  if (!cot) {
    throw new Error(`filters: khóa sắp xếp '${key}' thiếu ánh xạ cột Drizzle (allowlist)`);
  }
  return cot;
}

/** CỔNG CHỐNG TRÔI (U-K2): allowlist ORDER BY phải bằng ĐÚNG tập `sapDuoc` của Registry.
 * Tách thành hàm thuần để test được CẢ nhánh lệch — cổng chỉ đáng tin khi đã chứng minh nó
 * biết kêu. Thêm/bớt một bên mà quên bên kia ⇒ ném ngay lúc nạp module (mọi route + test đỏ
 * tức thì), thay vì lệch âm thầm giữa "cột bảng mời sắp" và "cột server chịu sắp". */
export function kiemAllowlistKhopRegistry(khoaRegistry: string[], khoaAllowlist: string[]): void {
  const a = [...khoaRegistry].sort().join(",");
  const b = [...khoaAllowlist].sort().join(",");
  if (a !== b) {
    throw new Error(`filters: allowlist ORDER BY lệch Registry — Registry=[${a}] allowlist=[${b}]`);
  }
}

kiemAllowlistKhopRegistry(sortableKeys(), Object.keys(SORT_COLUMNS));

/** Danh sách cột sắp xếp hợp lệ — export để test duyệt HẾT, không lấy mẫu vài cột.
 * DẪN XUẤT từ Registry (thứ tự khai báo nghiệp vụ), đã được cổng trên chứng minh là trùng
 * khớp bảng tra. */
export const SORT_BY_VALUES = sortableKeys() as [SortBy, ...SortBy[]];

export const sortSchema = z.object({
  sortBy: z.enum(SORT_BY_VALUES).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type InvoiceSort = z.infer<typeof sortSchema>;

/** Dựng mệnh đề ORDER BY. LUÔN kèm tie-breaker `id` ở cuối.
 *
 * Vì sao tie-breaker là BẮT BUỘC (không phải cho đẹp): `tdlap` từ GDT chỉ tới giây nên có
 * cả lô hóa đơn trùng giá trị; sắp theo `nbten` còn trùng nhiều hơn nữa. Thiếu khóa phụ
 * xác định, phân trang limit/offset sẽ **bỏ hoặc lặp bản ghi** giữa hai trang — sai âm
 * thầm, người dùng không thể phát hiện. (Ghi chú gốc: listInvoices.ts trước U31.) */
export function buildOrderBy(sort: InvoiceSort): SQL[] {
  const dir = sort.sortDir === "asc" ? asc : desc;
  const chinh = sort.sortBy ? cotSapXep(sort.sortBy) : hoaDon.tdlap;
  // Khi sắp theo cột phụ, vẫn giữ tdlap làm mốc thứ hai để thứ tự dễ đoán với người dùng.
  const phu = sort.sortBy && sort.sortBy !== "tdlap" ? [dir(hoaDon.tdlap)] : [];
  return [dir(chinh), ...phu, desc(hoaDon.id)] as SQL[];
}

// Phân trang: chặn `limit` ở trần 200 để không kéo tập lớn (giới hạn Workers).
export const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Page = z.infer<typeof pageSchema>;

// Portal/GDT dùng giờ VN (UTC+7, không DST). `tdlap` lưu là KHOẢNH KHẮC UTC của ngày VN:
// hoá đơn VN ngày D được lưu `(D-1)T17:00:00Z` (bằng chứng prod 2026-07-20: VN 18/07 →
// 17/07T17:00Z). Vì vậy biên lọc PHẢI dựng theo giờ VN — nếu dựng bằng UTC (`Z`) thì cửa
// sổ dịch 7h, dư ngày cuối + thiếu ngày đầu (chọn [1,2] trả nhầm [2,3]).
const VN_TZ_OFFSET = "+07:00";

/** `YYYY-MM-DD` (ngày theo giờ VN) → thời khắc UTC đầu/cuối ngày ĐÓ Ở GIỜ VN. Ngày phi
 * thực tế → ném (fail-loud): lọc theo ngày sai âm thầm còn tệ hơn báo lỗi. */
export function dayBoundaryVn(isoYmd: string, end: boolean): Date {
  // Kiểm ngày CÓ THẬT bằng probe UTC — `new Date` CUỘN âm thầm ngày tràn-tháng
  // (2026-02-30 → 03-02; 29/02 năm không nhuận → 01/03) thay vì NaN → đối chiếu Y-M-D.
  const [y, m, day] = isoYmd.split("-").map(Number);
  const probe = new Date(`${isoYmd}T00:00:00.000Z`);
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() + 1 !== m ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Ngày lọc không có thật (định dạng đúng nhưng ngày phi thực tế): ${isoYmd}`);
  }
  // Biên theo GIỜ VN: đầu ngày 00:00 VN, cuối ngày 23:59:59.999 VN → offset +07:00 cho
  // ra đúng khoảnh khắc UTC để so với `tdlap` (cũng là khoảnh khắc UTC của ngày VN).
  return new Date(`${isoYmd}${end ? "T23:59:59.999" : "T00:00:00.000"}${VN_TZ_OFFSET}`);
}

// U31 — dựng mẫu `%chuỗi%` cho ilike. PHẢI escape `%`, `_` và `\` của chuỗi người dùng:
// không escape thì tìm "50%" biến `%` thành ký tự đại diện ⇒ khớp MỌI bản ghi, sai âm
// thầm (người dùng tưởng lọc rồi). Giá trị vẫn đi qua tham số bind, không nối vào SQL.
function chuoiChua(s: string): string {
  return `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/** Dựng điều kiện WHERE Drizzle từ bộ lọc, LUÔN gắn `tenant_id` tường minh.
 *
 * U30 — `filter.ids` (chọn tay từ client) là điều kiện GIAO thêm, đứng sau `tenant_id`.
 * Bất biến an toàn: ids chỉ THU HẸP tập, KHÔNG BAO GIỜ mở rộng. Tenant A gửi id của
 * tenant B ⇒ giao với `tenant_id` của chính A ⇒ tập rỗng, không phải rò dữ liệu. */
export function buildWhere(tenantId: string, filter: InvoiceSelection): SQL {
  const conds: SQL[] = [eq(hoaDon.tenantId, tenantId)];
  if (filter.ids?.length) conds.push(inArray(hoaDon.id, filter.ids));
  if (filter.chieu) conds.push(eq(hoaDon.chieu, filter.chieu));
  if (filter.nguon) conds.push(eq(hoaDon.nguon, filter.nguon));
  if (filter.nbmst) conds.push(eq(hoaDon.nbmst, filter.nbmst));
  if (filter.nmmst) conds.push(eq(hoaDon.nmmst, filter.nmmst));
  // U31 — lọc cột dạng "chứa". Chuỗi rỗng KHÔNG sinh mệnh đề (ô nhập vừa bị xóa hết chữ
  // không có nghĩa là "lọc theo rỗng").
  if (filter.shdon) conds.push(ilike(hoaDon.shdon, chuoiChua(filter.shdon)));
  if (filter.nbten) conds.push(ilike(hoaDon.nbten, chuoiChua(filter.nbten)));
  if (filter.nmten) conds.push(ilike(hoaDon.nmten, chuoiChua(filter.nmten)));
  if (filter.dvtte) conds.push(eq(hoaDon.dvtte, filter.dvtte));
  if (filter.ttbsoTu) conds.push(gte(hoaDon.tgtttbso, filter.ttbsoTu));
  if (filter.ttbsoDen) conds.push(lte(hoaDon.tgtttbso, filter.ttbsoDen));
  if (filter.ttxly !== undefined) conds.push(eq(hoaDon.ttxly, filter.ttxly));
  if (filter.tthai !== undefined) conds.push(eq(hoaDon.tthai, filter.tthai));
  // `biSua=false` KHÔNG được đảo thành "chỉ hóa đơn lành" — nó chỉ nghĩa là không lọc.
  if (filter.biSua) {
    conds.push(inArray(hoaDon.tthai, [TTHAI.BI_THAY_THE, TTHAI.BI_DIEU_CHINH]));
  }
  if (filter.tuNgay) conds.push(gte(hoaDon.tdlap, dayBoundaryVn(filter.tuNgay, false)));
  if (filter.denNgay) conds.push(lte(hoaDon.tdlap, dayBoundaryVn(filter.denNgay, true)));
  const where = and(...conds);
  // Luôn có ít nhất điều kiện tenant → không kỳ vọng undefined; chốt kiểu an toàn.
  if (!where) throw new Error("buildWhere: điều kiện rỗng (không kỳ vọng)");
  return where;
}

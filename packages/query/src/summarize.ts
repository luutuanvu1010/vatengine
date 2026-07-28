// Tổng hợp hóa đơn (U6): count + sum tiền, gom theo chiều (đầu vào/đầu ra) + tổng
// chung. Tiền giữ dạng CHUỖI (cột numeric Postgres) — Postgres cộng chính xác, KHÔNG
// ép float (mục 7.1: tránh sai số dấu phẩy động). Generic trên PgDatabase (mẫu @vat/sync).
//
// U36 (QĐ-3) — hóa đơn `tthai=4` (BỊ THAY THẾ) bị LOẠI khỏi mọi phép cộng TIỀN: bản gốc đã
// mất hiệu lực, hóa đơn thay thế gánh toàn bộ giá trị. Trước U36 hệ thống cộng cả hai nên
// đếm trùng — đo trên production 2026-07-28: doanh thu bán ra dôi 274.535.000đ, thuế đầu ra
// dôi 20.335.925đ. Bằng chứng mã: docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md §3/§7.
// `tthai=5` (bị điều chỉnh) CỐ Ý được GIỮ — bản gốc còn hiệu lực, hóa đơn điều chỉnh chỉ
// ghi phần tăng/giảm; loại nhầm sẽ làm sai sổ theo chiều ngược lại.
import { hoaDon } from "@vat/db";
import { TTHAI, TTHAI_DA_KIEM_CHUNG, TTHAI_LOAI_KHOI_TONG } from "@vat/domain";
import { type SQL, count, sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { AnyPgColumn, PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type InvoiceFilter, buildWhere } from "./filters";

export interface MoneyTotals {
  /** Số hóa đơn KHỚP BỘ LỌC — QĐ-7: KHÔNG trừ mã 4.
   *
   * Trừ mã 4 ở đây sẽ làm một kỳ chỉ chứa hóa đơn bị thay thế cho `count = 0`, và
   * `InvoicesPage` coi `count === 0` là "kỳ rỗng" ⇒ TỰ GỌI ĐỒNG BỘ lên Tổng cục Thuế.
   * GDT đã phạt 429 nguồn của ta ngày 2026-07-27. Muốn biết "bao nhiêu hóa đơn được cộng
   * vào tiền" thì đọc `countTinhTong`, đừng động vào `count`. */
  count: number;
  /** Số hóa đơn ĐƯỢC cộng vào tổng tiền. */
  countTinhTong: number;
  /** Số hóa đơn bị loại khỏi tổng tiền (hiện chỉ mã 4). `count = countTinhTong + soLoaiKhoiTong`. */
  soLoaiKhoiTong: number;
  /** Tổng chưa thuế — ĐÃ loại mã 4. QĐ-10: giữ nullable (không COALESCE) để giao diện vẫn
   * hiện "—" cho kỳ không có gì, y như trước U36. */
  tongTcthue: string | null;
  tongTthue: string | null; // tổng tiền thuế — đã loại mã 4
  tongTtbso: string | null; // tổng thanh toán — đã loại mã 4
}

/** Khối "thay đổi" CHỈ có ở cấp CHIỀU, cố ý không có ở `total`: cộng số của mua vào với bán
 * ra là trộn hai nghiệp vụ ngược nhau (xem QĐ-12 — thuế phải nộp là phép TRỪ giữa hai chiều,
 * việc ghép do tầng trình bày làm, không phải tầng truy vấn). */
export interface ChieuSummary extends MoneyTotals {
  chieu: string; // 'purchase' | 'sold'
  soDuocDieuChinh: number; // tthai=5 — bản gốc bị điều chỉnh, VẪN tính vào tổng
  soHdThayThe: number; // tthai=2 — hóa đơn thay thế lập trong kỳ
  soHdDieuChinh: number; // tthai=3 — hóa đơn điều chỉnh lập trong kỳ
  soMaLa: number; // tthai ngoài tập đã kiểm chứng — QĐ-6, phải cảnh báo
  /** Σ tiền của hóa đơn ĐÃ BỊ LOẠI khỏi tổng (mã 4). Số DƯƠNG (QĐ-8) — giao diện tự thêm
   * dấu trừ. Luôn có giá trị (coalesce 0) vì luôn được hiển thị dạng số.
   *
   * U39: đủ BỘ BA (trước thuế · thuế · tổng sau thuế) — trước đây thiếu `tcthue`. */
  tcthueDaLoai: string;
  thueDaLoai: string;
  ttbsoDaLoai: string;
  /** Σ tiền của hóa đơn BỊ ĐIỀU CHỈNH (mã 5) — để RIÊNG, cố ý không gộp với mã 4: mã 4
   * KHÔNG tính vào tổng còn mã 5 VẪN tính, gộp lại là trộn hai ý nghĩa trái ngược. */
  tcthueBiDieuChinh: string;
  thueBiDieuChinh: string;
  ttbsoBiDieuChinh: string;
  /** Σ tiền của hóa đơn thay thế/điều chỉnh lập TRONG KỲ — quy mô cần rà soát, ĐÃ nằm trong
   * tổng. Không phải "mức thay đổi ròng": cặp gốc↔mới có thể vắt qua kỳ (§2.1). */
  thueThayTheDieuChinh: string;
  ttbsoThayTheDieuChinh: string;
}

export interface InvoiceSummary {
  byChieu: ChieuSummary[];
  total: MoneyTotals;
}

const dsMa = (ds: readonly number[]): SQL =>
  sql.join(
    ds.map((v) => sql`${v}`),
    sql`, `,
  );

/** Điều kiện "hóa đơn này ĐƯỢC cộng TIỀN". Nhận danh sách mã loại trừ làm THAM SỐ để nhánh
 * bảo vệ dưới đây kiểm được thật, không chỉ nằm đó cho đẹp.
 *
 * Bẫy 1 — `NOT IN` + NULL: `null not in (4)` cho UNKNOWN, tức hóa đơn thiếu `tthai` sẽ bị
 * loại oan. Phải nêu `is null` tường minh.
 * Bẫy 4 — danh sách RỖNG: `not in ()` là LỖI CÚ PHÁP SQL, không phải "không loại gì" —
 * làm hỏng toàn bộ endpoint chứ không im lặng sai. */
export function dieuKienTinhTong(loaiKhoiTong: readonly number[]): SQL {
  if (loaiKhoiTong.length === 0) return sql`true`;
  return sql`(${hoaDon.tthai} is null or ${hoaDon.tthai} not in (${dsMa(loaiKhoiTong)}))`;
}

/** Điều kiện "mã ngoài tập đã kiểm chứng" (QĐ-6). `tthai` NULL KHÔNG phải "mã lạ" — thiếu mã
 * khác với mang mã chưa biết nghĩa; gộp hai thứ lại sẽ báo động giả cho dữ liệu sco bình
 * thường (rất nhiều hóa đơn máy tính tiền không mang `tthai`). */
export function dieuKienMaLa(daKiemChung: readonly number[]): SQL {
  if (daKiemChung.length === 0) return sql`${hoaDon.tthai} is not null`;
  return sql`(${hoaDon.tthai} is not null and ${hoaDon.tthai} not in (${dsMa(daKiemChung)}))`;
}

const dungTinh: SQL = dieuKienTinhTong(TTHAI_LOAI_KHOI_TONG);
/** Hóa đơn BỊ ĐIỀU CHỈNH (mã 5) — bản gốc còn hiệu lực nên VẪN nằm trong tổng tiền; ta chỉ
 * cộng riêng để giao diện nêu được quy mô cần rà soát trước khi kê khai. */
const laBiDieuChinh: SQL = sql`${hoaDon.tthai} = ${TTHAI.BI_DIEU_CHINH}`;
const laMaLa: SQL = dieuKienMaLa(TTHAI_DA_KIEM_CHUNG);

// Bẫy 3 — `count(col)` đếm bản ghi NON-NULL của cột, không phải số dòng ⇒ luôn `count(*)`.
const demLoc = (dk: SQL) => sql`count(*) filter (where ${dk})`.mapWith(Number);
const demMa = (ma: number) => demLoc(sql`${hoaDon.tthai} = ${ma}`);

// Bẫy 2 — `sum()` trên tập RỖNG trả NULL và NULL lan ra cả biểu thức. Trường tiền MỚI luôn
// được hiển thị dạng số nên phải `coalesce(…, 0)`; còn `tongT*` cũ giữ nullable theo QĐ-10.
const tongLoc = (col: AnyPgColumn, dk: SQL) =>
  sql`sum(${col}) filter (where ${dk})`.mapWith(String) as SQL<string | null>;
const tongLocCo0 = (col: AnyPgColumn, dk: SQL) =>
  sql`coalesce(sum(${col}) filter (where ${dk}), 0)`.mapWith(String) as SQL<string>;

export async function summarizeInvoices<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  filter: InvoiceFilter,
): Promise<InvoiceSummary> {
  const where = buildWhere(tenantId, filter);

  // Bẫy 5 — đặt loại trừ vào WHERE sẽ làm cả một `chieu` BIẾN MẤT khỏi `group by` khi chiều
  // đó toàn hóa đơn mã 4; người dùng mất luôn dòng thông báo giải thích. Loại trừ nằm trong
  // AGGREGATE (`filter`), WHERE giữ nguyên bộ lọc người dùng.
  const moneyCols = {
    count: count(),
    countTinhTong: demLoc(dungTinh),
    soLoaiKhoiTong: demLoc(sql`not ${dungTinh}`),
    tongTcthue: tongLoc(hoaDon.tgtcthue, dungTinh),
    tongTthue: tongLoc(hoaDon.tgtthue, dungTinh),
    tongTtbso: tongLoc(hoaDon.tgtttbso, dungTinh),
  };

  const changeCols = {
    soDuocDieuChinh: demMa(TTHAI.BI_DIEU_CHINH),
    soHdThayThe: demMa(TTHAI.THAY_THE),
    soHdDieuChinh: demMa(TTHAI.DIEU_CHINH),
    soMaLa: demLoc(laMaLa),
    tcthueDaLoai: tongLocCo0(hoaDon.tgtcthue, sql`not ${dungTinh}`),
    thueDaLoai: tongLocCo0(hoaDon.tgtthue, sql`not ${dungTinh}`),
    ttbsoDaLoai: tongLocCo0(hoaDon.tgtttbso, sql`not ${dungTinh}`),
    tcthueBiDieuChinh: tongLocCo0(hoaDon.tgtcthue, laBiDieuChinh),
    thueBiDieuChinh: tongLocCo0(hoaDon.tgtthue, laBiDieuChinh),
    ttbsoBiDieuChinh: tongLocCo0(hoaDon.tgtttbso, laBiDieuChinh),
    thueThayTheDieuChinh: tongLocCo0(
      hoaDon.tgtthue,
      sql`${hoaDon.tthai} in (${dsMa([TTHAI.THAY_THE, TTHAI.DIEU_CHINH])})`,
    ),
    ttbsoThayTheDieuChinh: tongLocCo0(
      hoaDon.tgtttbso,
      sql`${hoaDon.tthai} in (${dsMa([TTHAI.THAY_THE, TTHAI.DIEU_CHINH])})`,
    ),
  };

  const grouped = await db
    .select({ chieu: hoaDon.chieu, ...moneyCols, ...changeCols })
    .from(hoaDon)
    .where(where)
    .groupBy(hoaDon.chieu);

  // Tổng chung tính bằng SQL riêng (Postgres cộng numeric chính xác) — KHÔNG cộng chuỗi
  // tiền ở JS để tránh mất chính xác trên số lớn.
  const totals = await db.select(moneyCols).from(hoaDon).where(where);
  const t = totals[0];

  return {
    byChieu: grouped.map((g) => ({
      chieu: g.chieu,
      count: Number(g.count),
      countTinhTong: g.countTinhTong,
      soLoaiKhoiTong: g.soLoaiKhoiTong,
      tongTcthue: g.tongTcthue,
      tongTthue: g.tongTthue,
      tongTtbso: g.tongTtbso,
      soDuocDieuChinh: g.soDuocDieuChinh,
      soHdThayThe: g.soHdThayThe,
      soHdDieuChinh: g.soHdDieuChinh,
      soMaLa: g.soMaLa,
      tcthueDaLoai: g.tcthueDaLoai,
      thueDaLoai: g.thueDaLoai,
      ttbsoDaLoai: g.ttbsoDaLoai,
      tcthueBiDieuChinh: g.tcthueBiDieuChinh,
      thueBiDieuChinh: g.thueBiDieuChinh,
      ttbsoBiDieuChinh: g.ttbsoBiDieuChinh,
      thueThayTheDieuChinh: g.thueThayTheDieuChinh,
      ttbsoThayTheDieuChinh: g.ttbsoThayTheDieuChinh,
    })),
    total: {
      count: Number(t?.count ?? 0),
      countTinhTong: t?.countTinhTong ?? 0,
      soLoaiKhoiTong: t?.soLoaiKhoiTong ?? 0,
      tongTcthue: t?.tongTcthue ?? null,
      tongTthue: t?.tongTthue ?? null,
      tongTtbso: t?.tongTtbso ?? null,
    },
  };
}

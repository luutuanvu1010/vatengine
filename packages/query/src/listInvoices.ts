// Tra cứu danh sách hóa đơn header của một tenant (U6). Generic trên `PgDatabase`
// (mẫu @vat/sync) để chạy PGlite trong test và pg/Hyperdrive khi chạy; `PgTransaction`
// (từ withTenant) cũng thỏa vì kế thừa `PgDatabase`. Chỉ ĐỌC — không gọi GDT.
//
// Quyết định chủ dự án 2026-07-17 (thay U23-A "dòng hàng chỉ ở màn chi tiết"): mỗi
// hàng danh sách mang thêm TÓM TẮT dòng hàng (tenHangDau/soDongHang/tongSoLuong) để
// bảng hiện được Tên hàng hóa + Số lượng. 3 subquery scalar / hàng trên trang ≤50 —
// lọc tenant TƯỜNG MINH trong subquery (multi-tenant.md, cạnh RLS).
import { dongHangHoa, hoaDon } from "@vat/db";
import { type SQL, count, desc, getTableColumns, sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type InvoiceFilter, type Page, buildWhere } from "./filters";

export type HoaDonRow = typeof hoaDon.$inferSelect;

/** Hàng danh sách = header + tóm tắt dòng hàng (null/0 khi chưa đồng bộ chi tiết). */
export type InvoiceListRow = HoaDonRow & {
  /** Tên hàng hóa dòng ĐẦU (stt nhỏ nhất); null khi chưa có dòng hàng. */
  tenHangDau: string | null;
  soDongHang: number;
  /** Tổng `sluong` (numeric → chuỗi qua JSON); null khi chưa có dòng hàng. */
  tongSoLuong: string | null;
};

export interface InvoiceListResult {
  rows: InvoiceListRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function listInvoices<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  filter: InvoiceFilter,
  page: Page,
): Promise<InvoiceListResult> {
  const where: SQL = buildWhere(tenantId, filter);
  // Đếm tổng khớp bộ lọc (độc lập phân trang) để client biết tổng số trang.
  const totals = await db.select({ value: count() }).from(hoaDon).where(where);
  const total = Number(totals[0]?.value ?? 0);
  const rows = await db
    .select({
      ...getTableColumns(hoaDon),
      // LƯU Ý drizzle: `${hoaDon.id}` trong subquery render thành `"id"` TRẦN (không
      // gắn bảng) → tự khớp d.id, sai âm thầm. Tham chiếu bảng ngoài phải viết tường
      // minh `hoa_don.id` (FROM ngoài không alias).
      tenHangDau: sql<string | null>`(select d.ten from ${dongHangHoa} d
        where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId}
        order by d.stt asc nulls last, d.id asc limit 1)`,
      soDongHang: sql<number>`(select count(*)::int from ${dongHangHoa} d
        where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId})`,
      tongSoLuong: sql<string | null>`(select sum(d.sluong) from ${dongHangHoa} d
        where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId})`,
    })
    .from(hoaDon)
    // Khóa phụ `id` để sắp XÁC ĐỊNH: `tdlap` GDT chỉ tới giây → lô hóa đơn trùng
    // tdlap; thiếu tie-breaker thì phân trang limit/offset có thể bỏ/lặp bản ghi.
    .where(where)
    .orderBy(desc(hoaDon.tdlap), desc(hoaDon.id))
    .limit(page.limit)
    .offset(page.offset);
  return { rows, total, limit: page.limit, offset: page.offset };
}

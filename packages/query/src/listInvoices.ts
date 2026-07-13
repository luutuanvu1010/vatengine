// Tra cứu danh sách hóa đơn header của một tenant (U6). Generic trên `PgDatabase`
// (mẫu @vat/sync) để chạy PGlite trong test và pg/Hyperdrive khi chạy; `PgTransaction`
// (từ withTenant) cũng thỏa vì kế thừa `PgDatabase`. Chỉ ĐỌC — không gọi GDT.
import { hoaDon } from "@vat/db";
import { type SQL, count, desc } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type InvoiceFilter, type Page, buildWhere } from "./filters";

export type HoaDonRow = typeof hoaDon.$inferSelect;

export interface InvoiceListResult {
  rows: HoaDonRow[];
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
    .select()
    .from(hoaDon)
    // Khóa phụ `id` để sắp XÁC ĐỊNH: `tdlap` GDT chỉ tới giây → lô hóa đơn trùng
    // tdlap; thiếu tie-breaker thì phân trang limit/offset có thể bỏ/lặp bản ghi.
    .where(where)
    .orderBy(desc(hoaDon.tdlap), desc(hoaDon.id))
    .limit(page.limit)
    .offset(page.offset);
  return { rows, total, limit: page.limit, offset: page.offset };
}

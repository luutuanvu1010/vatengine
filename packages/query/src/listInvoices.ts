// Tra cứu danh sách hóa đơn header của một tenant (U6). Generic trên `PgDatabase`
// (mẫu @vat/sync) để chạy PGlite trong test và pg/Hyperdrive khi chạy; `PgTransaction`
// (từ withTenant) cũng thỏa vì kế thừa `PgDatabase`. Chỉ ĐỌC — không gọi GDT.
//
// Quyết định chủ dự án 2026-07-17 (thay U23-A "dòng hàng chỉ ở màn chi tiết"): mỗi
// hàng danh sách mang thêm TÓM TẮT dòng hàng (tenHangDau/soDongHang/tongSoLuong) để
// bảng hiện được Tên hàng hóa + Số lượng. 3 subquery scalar / hàng trên trang ≤50 —
// lọc tenant TƯỜNG MINH trong subquery (multi-tenant.md, cạnh RLS).
import { hoaDon } from "@vat/db";
import { type SQL, count, getTableColumns } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  type InvoiceFilter,
  type InvoiceSort,
  type Page,
  buildOrderBy,
  buildWhere,
} from "./filters";
import { type LineSummary, lineSummarySelect } from "./lineSummary";

export type HoaDonRow = typeof hoaDon.$inferSelect;

/** Hàng danh sách = header + tóm tắt dòng hàng (null/0 khi chưa đồng bộ chi tiết). */
export type InvoiceListRow = HoaDonRow & LineSummary;

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
  // U31 — sắp xếp theo cột. Mặc định giữ nguyên hành vi trước U31 (tdlap desc, id desc)
  // để không phá client cũ; buildOrderBy luôn kèm tie-breaker `id`.
  sort: InvoiceSort = { sortDir: "desc" },
): Promise<InvoiceListResult> {
  const where: SQL = buildWhere(tenantId, filter);
  // Đếm tổng khớp bộ lọc (độc lập phân trang) để client biết tổng số trang.
  const totals = await db.select({ value: count() }).from(hoaDon).where(where);
  const total = Number(totals[0]?.value ?? 0);
  const rows = await db
    .select({
      ...getTableColumns(hoaDon),
      // 3 sub-select tóm tắt — nguồn DUY NHẤT ở ./lineSummary (dùng chung với
      // iterateInvoices của @vat/export, U29). Bẫy `hoa_don.id` ghi ở đó.
      ...lineSummarySelect(tenantId),
    })
    .from(hoaDon)
    // Thứ tự do buildOrderBy dựng (U31) — LUÔN kèm tie-breaker `id`: `tdlap` GDT chỉ tới
    // giây nên có lô hóa đơn trùng; thiếu khóa phụ thì limit/offset bỏ hoặc lặp bản ghi.
    .where(where)
    .orderBy(...buildOrderBy(sort))
    .limit(page.limit)
    .offset(page.offset);
  return { rows, total, limit: page.limit, offset: page.offset };
}

// Nạp hóa đơn để kết xuất (U7) theo LÔ keyset (tdlap desc, id desc) — dùng lại buildWhere
// của @vat/query (lọc `tenant_id` tường minh + bộ lọc U6). Keyset thay vì limit/offset để
// duyệt tập lớn ổn định (không bỏ/lặp khi trùng tdlap) và KHÔNG gom cả tập vào RAM cùng
// lúc (mục 11 + tiêu chí "file lớn"). Generic trên PgDatabase (PGlite test / pg khi chạy);
// PgTransaction (từ withTenant) cũng thỏa vì kế thừa PgDatabase. Chỉ ĐỌC — không gọi GDT.
import { hoaDon } from "@vat/db";
import { type InvoiceSelection, type LineSummary, buildWhere, lineSummarySelect } from "@vat/query";
import { type SQL, and, desc, eq, getTableColumns, lt, or } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/** Hàng kết xuất = header hóa đơn + tóm tắt dòng hàng (U29). Giống hệt `InvoiceListRow`
 * của @vat/query vì cùng dùng `lineSummarySelect` — chủ ý, để bảng và file không lệch. */
export type ExportRow = typeof hoaDon.$inferSelect & LineSummary;

export const DEFAULT_PAGE_SIZE = 500;

export async function* iterateInvoices<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  filter: InvoiceSelection,
  pageSize: number = DEFAULT_PAGE_SIZE,
): AsyncGenerator<ExportRow[]> {
  const base: SQL = buildWhere(tenantId, filter);
  let cursor: { tdlap: Date; id: string } | null = null;

  for (;;) {
    // Con trỏ keyset: các hàng SAU (tdlap,id) hiện tại theo thứ tự desc,desc.
    const where: SQL = cursor
      ? (and(
          base,
          or(
            lt(hoaDon.tdlap, cursor.tdlap),
            and(eq(hoaDon.tdlap, cursor.tdlap), lt(hoaDon.id, cursor.id)),
          ),
        ) as SQL)
      : base;

    const rows = await db
      .select({
        ...getTableColumns(hoaDon),
        // Nguồn DUY NHẤT, dùng chung với listInvoices (U29 §3.1). Điều kiện áp dụng:
        // FROM hoa_don không alias — thỏa ngay dưới đây.
        ...lineSummarySelect(tenantId),
      })
      .from(hoaDon)
      .where(where)
      .orderBy(desc(hoaDon.tdlap), desc(hoaDon.id))
      .limit(pageSize);

    if (rows.length === 0) return;
    yield rows;
    if (rows.length < pageSize) return;

    const last = rows[rows.length - 1];
    if (!last) return;
    cursor = { tdlap: last.tdlap, id: last.id };
  }
}

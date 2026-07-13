// Tổng hợp hóa đơn (U6): count + sum tiền, gom theo chiều (đầu vào/đầu ra) + tổng
// chung. Tiền giữ dạng CHUỖI (cột numeric Postgres) — Postgres cộng chính xác, KHÔNG
// ép float (mục 7.1: tránh sai số dấu phẩy động). Generic trên PgDatabase (mẫu @vat/sync).
import { hoaDon } from "@vat/db";
import { count, sum } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type InvoiceFilter, buildWhere } from "./filters";

export interface MoneyTotals {
  count: number;
  tongTcthue: string | null; // tổng chưa thuế
  tongTthue: string | null; // tổng tiền thuế
  tongTtbso: string | null; // tổng thanh toán
}
export interface ChieuSummary extends MoneyTotals {
  chieu: string; // 'purchase' | 'sold'
}
export interface InvoiceSummary {
  byChieu: ChieuSummary[];
  total: MoneyTotals;
}

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
  const moneyCols = {
    count: count(),
    tongTcthue: sum(hoaDon.tgtcthue),
    tongTthue: sum(hoaDon.tgtthue),
    tongTtbso: sum(hoaDon.tgtttbso),
  };

  const grouped = await db
    .select({ chieu: hoaDon.chieu, ...moneyCols })
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
      tongTcthue: g.tongTcthue,
      tongTthue: g.tongTthue,
      tongTtbso: g.tongTtbso,
    })),
    total: {
      count: Number(t?.count ?? 0),
      tongTcthue: t?.tongTcthue ?? null,
      tongTthue: t?.tongTthue ?? null,
      tongTtbso: t?.tongTtbso ?? null,
    },
  };
}

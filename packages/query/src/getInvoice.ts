// Lấy một hóa đơn header theo id, trong phạm vi tenant (U6). Lọc `tenant_id` tường
// minh → id của tenant khác trả `null` (không rò chéo). CHỐT #2: chỉ header từ DB,
// KHÔNG kèm dòng hàng (dong_hang_hoa) — đồng bộ chi tiết là pass sau (không gọi GDT).
import { hoaDon } from "@vat/db";
import { and, eq } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { HoaDonRow } from "./listInvoices";

export async function getInvoiceById<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(db: PgDatabase<TQuery, TFull, TSchema>, tenantId: string, id: string): Promise<HoaDonRow | null> {
  const rows = await db
    .select()
    .from(hoaDon)
    .where(and(eq(hoaDon.tenantId, tenantId), eq(hoaDon.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

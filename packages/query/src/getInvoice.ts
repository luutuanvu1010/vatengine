// Lấy một hóa đơn header theo id, trong phạm vi tenant (U6). Lọc `tenant_id` tường
// minh → id của tenant khác trả `null` (không rò chéo). Kèm dòng hàng (dong_hang_hoa)
// qua getInvoiceLines — pipeline U5 nay có lấy chi tiết 2 pha (ĐV3), bảng đã có dữ liệu.
import { dongHangHoa, hoaDon } from "@vat/db";
import { and, asc, eq } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { HoaDonRow } from "./listInvoices";

/** Một dòng hàng như lưu trong DB (numeric → chuỗi khi qua JSON API). */
export type DongHangHoaRow = typeof dongHangHoa.$inferSelect;

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

/**
 * Lấy dòng hàng của một hóa đơn, trong phạm vi tenant. Lọc `tenant_id` TƯỜNG MINH
 * (multi-tenant.md) + `hoadon_id` → dòng của tenant khác KHÔNG rò kể cả khi truyền
 * đúng hoadon_id của họ. Sắp theo `stt` cho hiển thị ổn định.
 */
export async function getInvoiceLines<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  hoaDonId: string,
): Promise<DongHangHoaRow[]> {
  return db
    .select()
    .from(dongHangHoa)
    .where(and(eq(dongHangHoa.tenantId, tenantId), eq(dongHangHoa.hoaDonId, hoaDonId)))
    .orderBy(asc(dongHangHoa.stt));
}

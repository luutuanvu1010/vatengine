// Nạp dong_hang_hoa cho MỘT LÔ hóa đơn (U22, phục vụ xml.zip/html.zip — mỗi hóa đơn kèm
// dòng hàng). Lọc tenant_id TƯỜNG MINH (ngoài RLS, multi-tenant.md) + inArray(hoadon_id).
// Chỉ ĐỌC — không gọi GDT.
import { dongHangHoa } from "@vat/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { InvoiceLineLike } from "./invoiceDoc";

/** Gom dong_hang_hoa theo hoadon_id cho một lô id, sắp theo stt tăng dần. Hóa đơn không có
 * dòng hàng KHÔNG xuất hiện trong Map (caller dùng `?? []`). */
export async function fetchLinesForInvoices<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  hoaDonIds: string[],
): Promise<Map<string, InvoiceLineLike[]>> {
  const map = new Map<string, InvoiceLineLike[]>();
  if (hoaDonIds.length === 0) return map;

  const rows = await db
    .select()
    .from(dongHangHoa)
    .where(and(eq(dongHangHoa.tenantId, tenantId), inArray(dongHangHoa.hoaDonId, hoaDonIds)))
    .orderBy(asc(dongHangHoa.stt));

  for (const row of rows) {
    const list = map.get(row.hoaDonId) ?? [];
    list.push({
      stt: row.stt,
      ten: row.ten,
      dvtinh: row.dvtinh,
      sluong: row.sluong,
      dgia: row.dgia,
      thtien: row.thtien,
      ltsuat: row.ltsuat,
      tsuat: row.tsuat,
      tsuatTien: row.tsuatTien,
    });
    map.set(row.hoaDonId, list);
  }
  return map;
}

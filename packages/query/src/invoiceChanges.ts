// U35 (A5) — tra cứu + đánh dấu đã đọc "thay đổi trạng thái hóa đơn" (lich_su_thay_doi_hoa_don,
// ghi bởi trigger DB — packages/db/migrations). Package này CHỈ ĐỌC/GHI cờ đã đọc, không
// tự phát hiện thay đổi (đó là việc của trigger). Mọi truy vấn gắn tenant_id TƯỜNG MINH
// (multi-tenant.md lớp 1) — gọi trong withTenant để RLS chốt lớp 2.
import { hoaDon, lichSuThayDoiHoaDon } from "@vat/db";
import { type SQL, and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import { dayBoundaryVn } from "./filters";
import type { Page } from "./filters";

// Zod chỉ kiểm ĐỊNH DẠNG — cùng mẫu invoiceFilterSchema (filters.ts). Không strict để
// route parse chung một object query cho cả filter lẫn page.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải định dạng YYYY-MM-DD");
export const invoiceChangeFilterSchema = z.object({
  unread: z.coerce.boolean().optional(),
  tuNgay: isoDate.optional(),
  denNgay: isoDate.optional(),
});
export type InvoiceChangeFilter = z.infer<typeof invoiceChangeFilterSchema>;

export interface InvoiceChangeRow {
  id: string;
  hoaDonId: string;
  truong: string;
  giaTriCu: number | null;
  giaTriMoi: number | null;
  lanDongBoId: string | null;
  phatHienLuc: Date;
  daDoc: boolean;
  // Định danh hóa đơn (join hoa_don) — panel hiển thị không cần gọi thêm API.
  khmshdon: string;
  khhdon: string;
  shdon: string;
  nbten: string | null;
}

export interface InvoiceChangeListResult {
  rows: InvoiceChangeRow[];
  total: number;
  limit: number;
  offset: number;
  /** Số chưa đọc CỦA TENANT (không phụ thuộc filter.unread) — nguồn cho badge. */
  unreadCount: number;
}

function buildWhere(tenantId: string, filter: InvoiceChangeFilter): SQL {
  const conds: SQL[] = [eq(lichSuThayDoiHoaDon.tenantId, tenantId)];
  if (filter.unread) conds.push(eq(lichSuThayDoiHoaDon.daDoc, false));
  if (filter.tuNgay)
    conds.push(gte(lichSuThayDoiHoaDon.phatHienLuc, dayBoundaryVn(filter.tuNgay, false)));
  if (filter.denNgay)
    conds.push(lte(lichSuThayDoiHoaDon.phatHienLuc, dayBoundaryVn(filter.denNgay, true)));
  const where = and(...conds);
  if (!where) throw new Error("buildWhere (invoiceChanges): điều kiện rỗng (không kỳ vọng)");
  return where;
}

export async function listInvoiceChanges<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  filter: InvoiceChangeFilter,
  page: Page,
): Promise<InvoiceChangeListResult> {
  const where = buildWhere(tenantId, filter);
  const totals = await db.select({ value: count() }).from(lichSuThayDoiHoaDon).where(where);
  const total = Number(totals[0]?.value ?? 0);
  const unreadTotals = await db
    .select({ value: count() })
    .from(lichSuThayDoiHoaDon)
    .where(and(eq(lichSuThayDoiHoaDon.tenantId, tenantId), eq(lichSuThayDoiHoaDon.daDoc, false)));
  const unreadCount = Number(unreadTotals[0]?.value ?? 0);
  const rows = await db
    .select({
      id: lichSuThayDoiHoaDon.id,
      hoaDonId: lichSuThayDoiHoaDon.hoaDonId,
      truong: lichSuThayDoiHoaDon.truong,
      giaTriCu: lichSuThayDoiHoaDon.giaTriCu,
      giaTriMoi: lichSuThayDoiHoaDon.giaTriMoi,
      lanDongBoId: lichSuThayDoiHoaDon.lanDongBoId,
      phatHienLuc: lichSuThayDoiHoaDon.phatHienLuc,
      daDoc: lichSuThayDoiHoaDon.daDoc,
      khmshdon: hoaDon.khmshdon,
      khhdon: hoaDon.khhdon,
      shdon: hoaDon.shdon,
      nbten: hoaDon.nbten,
    })
    .from(lichSuThayDoiHoaDon)
    // innerJoin same-tenant tường minh — khớp composite FK (tenant_id, hoa_don_id).
    .innerJoin(
      hoaDon,
      and(eq(lichSuThayDoiHoaDon.hoaDonId, hoaDon.id), eq(hoaDon.tenantId, tenantId)),
    )
    .where(where)
    // Mới nhất trước; tie-breaker `id` cho phân trang ổn định (cùng lý do buildOrderBy
    // của listInvoices — phat_hien_luc có thể trùng khi nhiều dòng ghi cùng transaction).
    .orderBy(desc(lichSuThayDoiHoaDon.phatHienLuc), desc(lichSuThayDoiHoaDon.id))
    .limit(page.limit)
    .offset(page.offset);
  return { rows, total, limit: page.limit, offset: page.offset, unreadCount };
}

/** Đánh dấu đã đọc — `ids` cụ thể (đã lọc tenant qua `and`, id của tenant khác → 0 hàng
 * đổi, KHÔNG lỗi, KHÔNG rò tồn tại chéo tenant) hoặc rỗng/thiếu = TẤT CẢ chưa đọc của
 * tenant. Trả số hàng vừa đổi (route dùng để phân biệt "không có gì để đánh dấu"). */
export async function markInvoiceChangesRead<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  tx: PgTransaction<TQuery, TFull, TSchema>,
  tenantId: string,
  ids?: readonly string[],
): Promise<number> {
  const where =
    ids && ids.length > 0
      ? and(
          eq(lichSuThayDoiHoaDon.tenantId, tenantId),
          eq(lichSuThayDoiHoaDon.daDoc, false),
          inArray(lichSuThayDoiHoaDon.id, [...ids]),
        )
      : and(eq(lichSuThayDoiHoaDon.tenantId, tenantId), eq(lichSuThayDoiHoaDon.daDoc, false));
  const updated = await tx
    .update(lichSuThayDoiHoaDon)
    .set({ daDoc: true })
    .where(where)
    .returning({ id: lichSuThayDoiHoaDon.id });
  return updated.length;
}

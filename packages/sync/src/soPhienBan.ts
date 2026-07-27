import { boDemPhienBan } from "@vat/db";
import { sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

// U35 (A3.2) — số phiên bản đồng bộ NGUYÊN TỬ mỗi tenant, gán khi một `lan_dong_bo`
// chuyển `trangThai='completed'` (CẢ đường sync() cũ, delta-sync `chotDeltaRun`, LẪN
// `ghiAuditDu` — cùng quy tắc "khi hoàn thành", nhất quán không phân biệt loại run).
// `INSERT … ON CONFLICT (tenant_id) DO UPDATE SET gia_tri = gia_tri + 1 RETURNING
// gia_tri` — tránh race của `MAX()+1` (kiểm chứng nguyên tử qua Promise.all,
// packages/db/test/integration/lichSuThayDoi.test.ts).
export async function capSoPhienBan<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(tx: PgTransaction<TQuery, TFull, TSchema>, tenantId: string): Promise<number> {
  const rows = await tx
    .insert(boDemPhienBan)
    .values({ tenantId, giaTri: 1 })
    .onConflictDoUpdate({
      target: boDemPhienBan.tenantId,
      set: { giaTri: sql`${boDemPhienBan.giaTri} + 1` },
    })
    .returning({ giaTri: boDemPhienBan.giaTri });
  const row = rows[0];
  if (!row) throw new Error("capSoPhienBan: insert/update không trả về giá trị");
  return row.giaTri;
}

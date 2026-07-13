import { sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

// Đặt ngữ cảnh tenant cho một giao dịch: nền để RLS (multi-tenant.md) lọc theo
// `app.tenant_id`. Dùng `set_config(..., is_local = true)` (tương đương SET LOCAL) —
// giá trị CHỈ sống trong giao dịch này, không rò sang giao dịch khác trên cùng kết
// nối pool (Hyperdrive/pg reuse connection). Job nền (U9) cũng phải truyền tenant_id
// tường minh vào đây — không suy đoán ngầm (multi-tenant.md).
export async function withTenant<
  TQueryResult extends PgQueryResultHKT,
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
  T,
>(
  db: PgDatabase<TQueryResult, TFullSchema, TSchema>,
  tenantId: string,
  fn: (tx: PgTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

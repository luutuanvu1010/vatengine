import { sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

// Đặt ngữ cảnh tenant cho một giao dịch: nền để RLS (multi-tenant.md) lọc theo
// `app.tenant_id`. Dùng `set_config(..., is_local = true)` (tương đương SET LOCAL) —
// giá trị CHỈ sống trong giao dịch này, không rò sang giao dịch khác trên cùng kết
// nối pool (Hyperdrive/pg reuse connection). Job nền (U9) cũng phải truyền tenant_id
// tường minh vào đây — không suy đoán ngầm (multi-tenant.md).
//
// U35 — tham số thứ tư TÙY CHỌN `lanDongBoId`: đặt CÙNG chỗ, CÙNG cơ chế
// `set_config(..., true)` biến phiên transaction-local `app.lan_dong_bo_id`, để
// trigger `hoa_don_ghi_lich_su_thay_doi` (packages/db/migrations) đọc được phiên
// đồng bộ đang chạy khi ghi lịch sử thay đổi trạng thái. Cả hai call-site (đường
// delta-sync `syncChunk` VÀ đường cũ `sync()`) đều biết `lanDongBoId` TRƯỚC khi mở
// transaction (delta: `moDeltaRun` trả id từ trước; `sync()` cũ: tự sinh
// `crypto.randomUUID()` rồi dùng làm `id` tường minh khi insert `lan_dong_bo`) — nên
// một điểm mở rộng duy nhất phục vụ cả hai, không cần set_config thủ công rải rác.
// Không truyền (job khác không liên quan sync) → biến phiên KHÔNG được đặt; trigger
// đọc `nullif(current_setting('app.lan_dong_bo_id', true), '')::uuid` ra NULL, không
// ném lỗi (khớp guard `_rls.ts`).
export async function withTenant<
  TQueryResult extends PgQueryResultHKT,
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
  T,
>(
  db: PgDatabase<TQueryResult, TFullSchema, TSchema>,
  tenantId: string,
  fn: (tx: PgTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
  lanDongBoId?: string,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    if (lanDongBoId !== undefined) {
      await tx.execute(sql`select set_config('app.lan_dong_bo_id', ${lanDongBoId}, true)`);
    }
    return fn(tx);
  });
}

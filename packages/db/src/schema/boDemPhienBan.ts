import { foreignKey, integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// U35 (A3.2) — bộ đếm phiên bản đồng bộ NGUYÊN TỬ, một hàng/tenant. Cấp số bằng
// `INSERT … ON CONFLICT (tenant_id) DO UPDATE SET gia_tri = gia_tri + 1 RETURNING
// gia_tri` (packages/sync) — tránh race của `MAX()+1`. `tenant_id` LÀ khóa chính
// (không có `id` riêng — mỗi tenant đúng một hàng đếm).
export const boDemPhienBan = pgTable(
  "bo_dem_phien_ban",
  {
    tenantId: uuid("tenant_id").primaryKey(),
    giaTri: integer("gia_tri").notNull().default(0),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "bo_dem_phien_ban_tenant_id_tenants_id_fk",
    }).onDelete("cascade"),
    tenantIsolationPolicy("bo_dem_phien_ban", t.tenantId),
  ],
);

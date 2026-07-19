import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { goiDichVu } from "./goiDichVu";

// Tenant = doanh nghiệp khách hàng. Trục cách ly đa khách hàng (multi-tenant.md).
// RLS keyed theo chính `id` (tenant chỉ thấy hàng tenant của mình).
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ten: text("ten").notNull(),
    mst: text("mst").notNull(),
    trangThai: text("trang_thai").notNull().default("active"),
    goiDichVu: text("goi_dich_vu")
      .notNull()
      .default("free")
      .references(() => goiDichVu.ma, { onDelete: "restrict" }),
    ghiChu: text("ghi_chu"),
    banQuyen: text("ban_quyen").notNull().default("Mặc định"),
    ngayTao: timestamp("ngay_tao", { withTimezone: true }).notNull().defaultNow(),
  },
  // U23-D: 1 MST gốc ↔ 1 tenant (khớp migration 0006 CREATE UNIQUE INDEX tenants_mst_unique).
  (t) => [tenantIsolationPolicy("tenants", t.id), uniqueIndex("tenants_mst_unique").on(t.mst)],
);

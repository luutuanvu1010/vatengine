import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";

// Tenant = doanh nghiệp khách hàng. Trục cách ly đa khách hàng (multi-tenant.md).
// RLS keyed theo chính `id` (tenant chỉ thấy hàng tenant của mình).
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ten: text("ten").notNull(),
    mst: text("mst").notNull(),
    trangThai: text("trang_thai").notNull().default("active"),
    goiDichVu: text("goi_dich_vu"),
    ghiChu: text("ghi_chu"),
    banQuyen: text("ban_quyen").notNull().default("Mặc định"),
    ngayTao: timestamp("ngay_tao", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantIsolationPolicy("tenants", t.id)],
);

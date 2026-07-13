import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// Nhật ký audit bất biến (chỉ append) cho hành động nhạy cảm: đăng nhập thuế, đồng
// bộ, xuất dữ liệu, đổi cấu hình (security.md). Khung tối thiểu ở U4; ghi audit
// runtime + ràng buộc không-ghi-đè đầy đủ là U12.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    hanhDong: text("hanh_dong").notNull(),
    doiTuong: text("doi_tuong"),
    chiTiet: jsonb("chi_tiet"),
    taoLuc: timestamp("tao_luc", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantIsolationPolicy("audit_log", t.tenantId)],
);

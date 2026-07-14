import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// Nhật ký audit bất biến (chỉ append) cho hành động nhạy cảm: đăng nhập thuế, đồng
// bộ, xuất dữ liệu, đổi cấu hình (security.md). Khung tối thiểu ở U4; ghi audit
// runtime ở U7/U9. U12: ràng buộc BẤT BIẾN thực thi bằng trigger append-only
// (migration 0002 — chặn UPDATE/DELETE kể cả owner) + masking chi_tiet (@vat/crypto).
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

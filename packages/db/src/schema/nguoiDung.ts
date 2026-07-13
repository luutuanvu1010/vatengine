import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// Người dùng nội bộ của SaaS (khác tài khoản thuế). Khung tối thiểu ở U4 để giữ ràng
// buộc đa tenant; RBAC + xác thực nội bộ đầy đủ là U8 (không hiện thực logic ở U4).
export const nguoiDung = pgTable(
  "nguoi_dung",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    vaiTro: text("vai_tro").notNull().default("member"),
    ngayTao: timestamp("ngay_tao", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantIsolationPolicy("nguoi_dung", t.tenantId)],
);

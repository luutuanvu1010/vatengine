import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { taiKhoanThue } from "./taiKhoanThue";
import { tenants } from "./tenants";

// Nhật ký một lần đồng bộ (một chiều, một khoảng ngày). U5 ghi số HĐ mới/cập nhật;
// U9 (nền) đọc để tiếp tục/giám sát. Lịch sử có phiên bản = truy vấn lại theo tenant.
export const lanDongBo = pgTable(
  "lan_dong_bo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taikhoanId: uuid("taikhoan_id")
      .notNull()
      .references(() => taiKhoanThue.id, { onDelete: "cascade" }),
    chieu: text("chieu").notNull(), // 'purchase' | 'sold'
    tuNgay: timestamp("tu_ngay", { withTimezone: true }).notNull(),
    denNgay: timestamp("den_ngay", { withTimezone: true }).notNull(),
    soHdMoi: integer("so_hd_moi").notNull().default(0),
    soHdCapNhat: integer("so_hd_cap_nhat").notNull().default(0),
    trangThai: text("trang_thai").notNull().default("running"),
    thongDiepLoi: text("thong_diep_loi"),
    batDau: timestamp("bat_dau", { withTimezone: true }).notNull().defaultNow(),
    ketThuc: timestamp("ket_thuc", { withTimezone: true }),
  },
  (t) => [tenantIsolationPolicy("lan_dong_bo", t.tenantId)],
);

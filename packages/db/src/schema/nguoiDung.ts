import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// Người dùng nội bộ của SaaS (khác tài khoản thuế). U8: xác thực email+mật khẩu +
// RBAC 3 vai (`ke_toan` | `ke_toan_truong` | `quan_tri`, mục 5 KIEN_TRUC). Vai trò
// đi vào claim JWT lúc phát hành (quyết định #3), không tra DB mỗi request.
//
// `password_hash`: PBKDF2 (WebCrypto) — mật khẩu người dùng SaaS, KHÔNG phải mật khẩu
// thuế (security.md chỉ cấm lưu mật khẩu THUẾ thô). Nullable để không chặn hàng cũ.
// `email` UNIQUE TOÀN CỤC (không theo tenant): login xảy ra TRƯỚC khi biết tenant nên
// một email định danh đúng một người dùng toàn hệ thống (quyết định U8-2026-07-14).
// U17b (Task 5b, F4) — chỉ mục duy nhất là BIỂU THỨC lower(email), KHÔNG phải cột "email"
// trần: byte-exact để "Boss@Corp.vn" và "BOSS@CORP.VN" lọt qua như hai người khác nhau, phá
// vỡ dedup (migration 0010_email_khong_phan_biet_hoa_thuong.sql). Cột email vẫn giữ NGUYÊN
// case người dùng gõ (hiển thị/audit); chỉ ép DUY NHẤT theo dạng đã chuẩn hoá.
export const nguoiDung = pgTable(
  "nguoi_dung",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    vaiTro: text("vai_tro").notNull().default("ke_toan"),
    ngayTao: timestamp("ngay_tao", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationPolicy("nguoi_dung", t.tenantId),
    uniqueIndex("nguoi_dung_email_unique").on(sql`lower(${t.email})`),
  ],
);

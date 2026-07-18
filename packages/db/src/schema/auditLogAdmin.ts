import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// U17a (QĐ-6) — Nhật ký hành động XUYÊN-TENANT của super-admin. Tách hẳn khỏi audit_log
// của khách.
//
// VÌ SAO BẢNG RIÊNG: audit_log có tenant_id NOT NULL + FK cascade (auditLog.ts:13), policy
// RLS `for: 'all'` so tenant_id, và trigger append-only (0002). Ba lớp cùng chặn ⇒ thay
// đổi cấu hình TOÀN CỤC (bảng gói, ngưỡng hệ thống) KHÔNG có chỗ ghi hợp lệ, trong khi
// security.md:21 bắt buộc audit "đổi cấu hình". Sửa audit_log đang chạy đúng trên
// production là rủi ro hồi quy; tách bảng cũng hợp ranh giới bảo mật U18.
//
// U17a chỉ TẠO bảng. Đường ghi vào nó là U18.
//
// BẢO VỆ (sửa sau review Task 3 — bản đầu chỉ GRANT SELECT,INSERT TO PUBLIC không RLS,
// bị đo được là cho phép MỌI role đọc + chèn giả mạo, kể cả role không có quyền bảng nào):
// bảng chỉ-ghi. RLS ENABLE+FORCE với ĐÚNG MỘT policy FOR INSERT WITH CHECK(true) — không
// có policy SELECT/UPDATE/DELETE nào ⇒ mọi role không phải owner/BYPASSRLS đọc ra 0 hàng
// dù có GRANT SELECT. GRANT thu hẹp còn đúng INSERT (REVOKE UPDATE/DELETE/TRUNCATE giữ
// nguyên từ trước). Trigger append-only (bên dưới) vẫn giữ vai trò cũ: chặn owner/BYPASSRLS
// sửa/xoá — RLS không chi phối các role đó. Đường ĐỌC hợp lệ (super-admin xem log) sẽ mở ở
// U18 bằng policy FOR SELECT TO <role_admin> khi có consumer thật (YAGNI, xem migration
// 0007 khối audit_log_admin).
export const auditLogAdmin = pgTable("audit_log_admin", {
  id: uuid("id").primaryKey().defaultRandom(),
  hanhDong: text("hanh_dong").notNull(),
  doiTuong: text("doi_tuong"),
  // Danh tính super-admin (U18 chốt mô hình). Text để không ràng vào bảng nguoi_dung của
  // khách — danh tính admin TÁCH khỏi bảng khách (yêu cầu bảo mật U18).
  nguoiThucHien: text("nguoi_thuc_hien").notNull(),
  // Ghi CŨ → MỚI, không chỉ tên trường (QĐ-6). Vẫn qua maskSensitive phòng thủ.
  chiTiet: jsonb("chi_tiet"),
  taoLuc: timestamp("tao_luc", { withTimezone: true }).notNull().defaultNow(),
});

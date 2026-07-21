import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// U18 — Danh tính SUPER-ADMIN (chủ phần mềm). Đứng NGOÀI trục tenant hoàn toàn.
//
// VÌ SAO KHÔNG PHẢI MỘT GIÁ TRỊ TRONG `nguoi_dung.vai_tro`: mọi hàng `nguoi_dung` buộc
// `tenant_id` NOT NULL + FK. Super-admin không thuộc tenant nào ⇒ biểu diễn bằng
// `vai_tro='super_admin'` sẽ phải bịa ra một `tenant_id` giả, vừa phá nguyên tắc "ROLES là
// một nguồn chân lý cho vai IN-tenant" (apps/api/src/rbac.ts) vừa tạo một hàng dữ liệu mà
// RLS không biết phải xử lý thế nào. Tách bảng là cách thực thi ranh giới chủ ↔ khách ở
// TẦNG DỮ LIỆU, không chỉ ở UI.
//
// KHÔNG có `tenantIsolationPolicy` — bảng này không nằm trên trục tenant nên không có cột
// nào để so. Thay vào đó migration 0011 bật RLS ENABLE + FORCE **không kèm policy nào**:
// mọi role không-owner và không-BYPASSRLS đọc ra 0 hàng kể cả khi có GRANT SELECT
// (fail-closed, cùng thủ pháp audit_log_admin dùng ở 0007). Drizzle không phát được dạng
// "RLS bật mà rỗng policy" nên trạng thái đó chỉ tồn tại trong SQL viết tay — đây là ghi
// chú để người đọc schema không tưởng bảng này đang mở.
//
// ĐƯỜNG VÀO DUY NHẤT ở runtime là các hàm SECURITY DEFINER `admin_*` (0011). Bảng KHÔNG
// được GRANT gì cho PUBLIC/role app ⇒ đừng viết truy vấn Drizzle trực tiếp lên nó trong
// `apps/api` (sẽ `permission denied` ở production dù test PGlite-superuser vẫn xanh).
// Ngoại lệ hợp lệ duy nhất: `scripts/seed-super-admin.ts` chạy dưới role migrate/owner.
export const quanTriHeThong = pgTable(
  "quan_tri_he_thong",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // PBKDF2 (WebCrypto) — cùng hàm `hashPassword` với nguoi_dung. Không phải mật khẩu THUẾ.
    passwordHash: text("password_hash").notNull(),
    ten: text("ten"),
    // 'active' | 'khoa'. Text không CHECK — theo tiền lệ 0004 (không khoá cứng enum ở DB).
    trangThai: text("trang_thai").notNull().default("active"),
    ngayTao: timestamp("ngay_tao", { withTimezone: true }).notNull().defaultNow(),
    dangNhapCuoi: timestamp("dang_nhap_cuoi", { withTimezone: true }),
  },
  // Chỉ mục trên BIỂU THỨC lower(email), KHÔNG phải cột trần — cùng hợp đồng chuẩn hoá
  // email mà `nguoi_dung` đã phải vá ở 0010: tầng gọi trim+lowercase, hàm `admin_lookup`
  // so trên `lower(email)`, chỉ mục này phục vụ đúng truy vấn đó. Lệch một trong ba chỗ là
  // tự khoá chủ dự án ra khỏi Cổng Admin bằng 401 không manh mối (bài học U17b Task 6).
  (t) => [uniqueIndex("quan_tri_he_thong_email_unique").on(sql`lower(${t.email})`)],
);

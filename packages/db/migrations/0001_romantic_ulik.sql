ALTER TABLE "nguoi_dung" ALTER COLUMN "vai_tro" SET DEFAULT 'ke_toan';--> statement-breakpoint
ALTER TABLE "nguoi_dung" ADD COLUMN "password_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "nguoi_dung_email_unique" ON "nguoi_dung" USING btree ("email");--> statement-breakpoint
-- U8 — Tra cứu xác thực AN TOÀN qua RLS (bổ sung tay; drizzle-kit KHÔNG sinh hàm/role).
-- BÀI TOÁN: login xảy ra TRƯỚC khi biết tenant → chưa set `app.tenant_id`. Nhưng
-- `nguoi_dung` bật FORCE RLS theo tenant_id ⇒ role app (non-superuser, production) sẽ
-- thấy 0 hàng ⇒ mọi login hỏng. Lưu ý Postgres: hàm SECURITY DEFINER do CHÍNH owner
-- bảng sở hữu VẪN bị FORCE chi phối ⇒ phải cho hàm thuộc một role có BYPASSRLS.
--
-- Vai trò `auth_lookup` NOLOGIN + BYPASSRLS chỉ để sở hữu đúng MỘT hàm hẹp dưới đây;
-- không đăng nhập, không sở hữu bảng. Bề mặt tối thiểu (multi-tenant.md).
-- Idempotent: DO-guard để áp lại migration không lỗi.
-- LƯU Ý VẬN HÀNH (Neon/Supabase): KIỂM CHỨNG 2026-07-14 trên Neon (aws-ap-southeast-1) —
-- role owner mặc định `neondb_owner` (KHÔNG superuser) TẠO ĐƯỢC role BYPASSRLS này và
-- GRANT SELECT bên dưới OK. Việc chuyển OWNER cho auth_lookup cần thêm 2 quyền (xử lý
-- ngay trước ALTER FUNCTION): (a) role migrate phải là THÀNH VIÊN auth_lookup để SET ROLE;
-- (b) auth_lookup phải có CREATE trên schema chứa hàm (PG15+ bỏ CREATE mặc định của public).
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auth_lookup') THEN
    CREATE ROLE auth_lookup NOLOGIN BYPASSRLS;
  END IF;
END $$;--> statement-breakpoint
-- BYPASSRLS chỉ bỏ qua policy HÀNG; quyền BẢNG vẫn áp dụng → owner của hàm (auth_lookup,
-- không sở hữu bảng) phải được GRANT SELECT tường minh trên nguoi_dung.
GRANT SELECT ON "nguoi_dung" TO auth_lookup;--> statement-breakpoint
CREATE OR REPLACE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE (id uuid, tenant_id uuid, vai_tro text, password_hash text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.tenant_id, n.vai_tro, n.password_hash
  FROM nguoi_dung n
  WHERE n.email = p_email
$$;--> statement-breakpoint
-- Điều kiện để ALTER ... OWNER TO auth_lookup chạy được với role migrate KHÔNG-superuser
-- (Neon `neondb_owner`, Supabase `postgres`, CI/PGlite). Dùng CURRENT_USER → portable.
-- (a) thành viên auth_lookup (được phép SET ROLE) — creator có admin option nên GRANT được;
-- (b) auth_lookup cần CREATE trên schema để "sở hữu" hàm.
-- CẢ HAI quyền TẠM này đều được THU HỒI sau khi dùng (least-privilege): CREATE thu hồi ngay
-- dưới; membership thu hồi ở CUỐI migration (phải sau REVOKE FROM PUBLIC vì lệnh đó vẫn cần
-- role migrate là thành viên owner mới auth_lookup). KIỂM CHỨNG (đường thành công) 2026-07-14
-- trên Neon. Đường FAIL giữa chừng: drizzle-kit bọc migration trong transaction ⇒ rollback
-- nguyên khối (quan sát 2026-07-14: 1 statement lỗi → 0 bảng, journal trống), không treo quyền TẠM.
GRANT auth_lookup TO CURRENT_USER;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO auth_lookup;--> statement-breakpoint
ALTER FUNCTION auth_lookup_user(text) OWNER TO auth_lookup;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM auth_lookup;--> statement-breakpoint
-- LEAST-PRIVILEGE (sửa từ security-reviewer 2026-07-14): TỪ CHỐI MẶC ĐỊNH. Postgres tự
-- cấp EXECUTE cho PUBLIC khi tạo hàm → REVOKE để CHỈ owner + role được cấp tường minh mới
-- gọi được. KHÔNG cấp lại cho PUBLIC: hàm là SECURITY DEFINER (BYPASSRLS) trả
-- password_hash + tenant_id XUYÊN tenant, nên chỉ role ứng dụng (Worker/Hyperdrive) mới
-- được phép — chặn role báo cáo/BI/migration thêm sau vô tình tra được toàn bộ người dùng.
-- ĐIỀU KIỆN TIÊN QUYẾT PRODUCTION (CHƯA KIỂM CHỨNG trên DB thật, cùng lớp với lưu ý role
-- BYPASSRLS ở trên): cấp tường minh `GRANT EXECUTE ON FUNCTION auth_lookup_user(text) TO
-- <role_app_hyperdrive>;` khi provision role app. Test cấp cho role app_user2 (xem
-- constraints.test U8-14) — chứng minh chính grant tường minh mở đường, không phải PUBLIC.
REVOKE ALL ON FUNCTION auth_lookup_user(text) FROM PUBLIC;--> statement-breakpoint
-- ĐÓNG đường leo thang qua auth_lookup (security-reviewer 2026-07-14): thu hồi phần SET/INHERIT
-- của membership đã cấp TẠM cho role migrate. Đặt CUỐI vì ALTER OWNER + REVOKE FROM PUBLIC ở
-- trên vẫn cần role migrate SET ROLE được sang owner mới. KIỂM CHỨNG 2026-07-14 trên Neon: sau
-- bước này `SET ROLE auth_lookup` bị CHẶN (permission denied) ⇒ không còn đường qua auth_lookup
-- để bỏ qua RLS. (Còn 1 dòng membership admin-only do neondb_owner là NGƯỜI TẠO role — không
-- SET ROLE được nên không khai thác được.)
-- LƯU Ý QUAN TRỌNG (KIỂM CHỨNG 2026-07-14): trên Neon chính role migrate `neondb_owner` có
-- THUỘC TÍNH BYPASSRLS nên vốn đã bỏ qua RLS trực tiếp — đây là role ADMIN chỉ dùng migrate
-- (CLI/CI), KHÔNG phải role app. Cách ly tenant dựa vào ROLE APP RIÊNG kết nối qua Hyperdrive:
-- phải NOSUPERUSER + NOBYPASSRLS + không-owner (xem multi-tenant.md; provision ở bước deploy).
REVOKE auth_lookup FROM CURRENT_USER;
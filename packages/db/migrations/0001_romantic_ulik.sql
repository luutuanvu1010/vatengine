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
-- LƯU Ý VẬN HÀNH (Neon/Supabase): tạo role BYPASSRLS có thể cần quyền admin/superuser
-- của provider — điều kiện tiên quyết khi migrate production (CHƯA KIỂM CHỨNG trên DB thật).
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
ALTER FUNCTION auth_lookup_user(text) OWNER TO auth_lookup;--> statement-breakpoint
-- LEAST-PRIVILEGE (sửa từ security-reviewer 2026-07-14): TỪ CHỐI MẶC ĐỊNH. Postgres tự
-- cấp EXECUTE cho PUBLIC khi tạo hàm → REVOKE để CHỈ owner + role được cấp tường minh mới
-- gọi được. KHÔNG cấp lại cho PUBLIC: hàm là SECURITY DEFINER (BYPASSRLS) trả
-- password_hash + tenant_id XUYÊN tenant, nên chỉ role ứng dụng (Worker/Hyperdrive) mới
-- được phép — chặn role báo cáo/BI/migration thêm sau vô tình tra được toàn bộ người dùng.
-- ĐIỀU KIỆN TIÊN QUYẾT PRODUCTION (CHƯA KIỂM CHỨNG trên DB thật, cùng lớp với lưu ý role
-- BYPASSRLS ở trên): cấp tường minh `GRANT EXECUTE ON FUNCTION auth_lookup_user(text) TO
-- <role_app_hyperdrive>;` khi provision role app. Test cấp cho role app_user2 (xem
-- constraints.test U8-14) — chứng minh chính grant tường minh mở đường, không phải PUBLIC.
REVOKE ALL ON FUNCTION auth_lookup_user(text) FROM PUBLIC;
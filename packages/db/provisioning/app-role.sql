-- Provision ROLE APP least-privilege cho kết nối Hyperdrive (production/staging).
-- KHÔNG phải migration Drizzle: đây là bước VẬN HÀNH chạy MỘT LẦN sau `make migrate`,
-- vì tên role + mật khẩu là bí mật theo môi trường (không hard-code vào migration).
--
-- BỐI CẢNH (multi-tenant.md + security.md): role app kết nối Hyperdrive PHẢI
-- NOSUPERUSER + NOBYPASSRLS + KHÔNG-sở-hữu-bảng, nếu không FORCE RLS bị vô hiệu và
-- cách ly tenant sụp đổ. KHÔNG dùng role owner (Neon `neondb_owner` CÓ BYPASSRLS!).
--
-- KIỂM CHỨNG 2026-07-14 trên Neon (aws-ap-southeast-1) với role `vat_app`:
--   * attrs: rolsuper=f, rolbypassrls=f, rolcanlogin=t
--   * không set app.tenant_id → thấy 0 hàng; set = tenant A → CHỈ thấy tenant A
--   * gọi được auth_lookup_user() (login); login thật bằng vat_app OK
--
-- Cách chạy (thay <APP_ROLE>, <STRONG_PASSWORD> — sinh `openssl rand -hex 24`):
--   psql "$DATABASE_URL_ADMIN" -v role=<APP_ROLE> -v pw=<STRONG_PASSWORD> -f app-role.sql
-- ($DATABASE_URL_ADMIN = chuỗi role migrate/owner, ví dụ neondb_owner.)

\set role vat_app
-- \set pw 'ĐẶT_QUA_-v_HOẶC_SỬA_TRỰC_TIẾP'   -- KHÔNG commit mật khẩu thật

-- 1) Tạo role app (idempotent). NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE.
--    Lưu ý: ALTER thuộc tính role có thể cần superuser tuỳ provider — nếu vậy tạo role
--    bằng UI/console của provider với đúng thuộc tính rồi bỏ qua bước CREATE này.
CREATE ROLE :role LOGIN PASSWORD :'pw' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- 2) Quyền bảng least-privilege (owner của bảng = role migrate cấp trực tiếp được).
GRANT USAGE ON SCHEMA public TO :role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :role;

-- 3) EXECUTE trên hàm login auth_lookup_user (owner = auth_lookup, NOLOGIN BYPASSRLS).
--    Role migrate KHÔNG sở hữu hàm này ⇒ phải nâng quyền TẠM CÓ PHẠM VI để cấp:
--    tạm là thành viên auth_lookup → SET ROLE → GRANT → RESET → thu hồi membership.
--    (Migration 0001 để owner=auth_lookup và thu hồi SET-membership của role migrate;
--     đây là chỗ đối ứng khi provision — xem chú thích cuối 0001_romantic_ulik.sql.)
GRANT auth_lookup TO CURRENT_USER;
SET ROLE auth_lookup;
GRANT EXECUTE ON FUNCTION public.auth_lookup_user(text) TO :role;
RESET ROLE;
REVOKE auth_lookup FROM CURRENT_USER;

-- 4) Kết quả → chuỗi kết nối của :role (endpoint DIRECT, không -pooler) nạp vào Hyperdrive:
--    wrangler hyperdrive create <name> --connection-string="postgresql://<APP_ROLE>:<pw>@<host>/<db>?sslmode=require&channel_binding=require"
--    KHÔNG dùng chuỗi role owner/migrate cho Hyperdrive.

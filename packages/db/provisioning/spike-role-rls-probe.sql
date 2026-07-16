-- ============================================================================
-- H-A.1 SPIKE — PROBE kiểm chứng thuộc tính role Neon + hiệu lực RLS THẬT.
-- Mục tiêu: chuyển các KHẲNG ĐỊNH trong chú thích app-role.sql (2026-07-14) thành
-- BẰNG CHỨNG TÁI LẬP GHI LẠI (lệnh + kết quả + ngày) — nguyên tắc bằng chứng của
-- Hiến pháp ("'đã có trong tài liệu' KHÔNG phải bằng chứng"; bài học :30000).
--
-- CÁCH CHẠY (KHÔNG paste chuỗi kết nối vào chat — đặt trong .dev.vars, đọc từ env):
--   psql "$APP_DATABASE_URL" -v tenant_real="<uuid-tenant-có-data>" -f spike-role-rls-probe.sql
--   ($APP_DATABASE_URL = chuỗi kết nối của ROLE APP `vat_app`, endpoint DIRECT không -pooler.)
--   Nếu chưa có uuid tenant thật, chạy không có -v: bỏ qua phần POSITIVE, vẫn chứng
--   minh được attrs + ownership + fail-closed.
--
-- LƯU raw output (lệnh + kết quả) vào ADR docs/adr/000X-neon-role-rls-pitr.md.
-- ============================================================================

\echo '=== 0) Danh tính kết nối (PHẢI là role app, KHÔNG owner/superuser) ==='
SELECT current_user AS connected_role, current_database() AS db, version();

\echo ''
\echo '=== 1) THUỘC TÍNH role app hiện tại — KỲ VỌNG rolsuper=f, rolbypassrls=f, rolcanlogin=t ==='
\echo '    (Nếu rolsuper=t HOẶC rolbypassrls=t ⇒ RLS bị VÔ HIỆU kể cả FORCE ⇒ THẢM HỌA cross-tenant)'
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
FROM pg_roles WHERE rolname = current_user;

\echo ''
\echo '=== 2) THUỘC TÍNH MỌI role (giải quyết dấu hỏi "neondb_owner CÓ BYPASSRLS?") ==='
\echo '    pg_roles đọc được bởi mọi role ⇒ chốt được câu hỏi này từ chính kết nối app.'
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
ORDER BY rolsuper DESC, rolbypassrls DESC, rolname;

\echo ''
\echo '=== 3) SỞ HỮU BẢNG — role app KHÔNG được sở hữu bảng nghiệp vụ (least-privilege) ==='
\echo '    (FORCE RLS vẫn áp cả owner, nhưng least-privilege yêu cầu app KHÔNG own.)'
SELECT tablename, tableowner,
       (tableowner = current_user) AS owned_by_app_role
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

\echo ''
\echo '=== 4) RLS ĐÃ BẬT + FORCE trên mọi bảng nghiệp vụ? (relrowsecurity=t, relforcerowsecurity=t) ==='
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

\echo ''
\echo '=== 5) CÁCH LY — FAIL-CLOSED: chưa set app.tenant_id ⇒ PHẢI thấy 0 hàng hoa_don ==='
SELECT set_config('app.tenant_id', '', true);
SELECT count(*) AS hoa_don_khi_chua_set_tenant__ky_vong_0 FROM hoa_don;

\echo ''
\echo '=== 6) CÁCH LY — tenant giả (uuid ngẫu nhiên không tồn tại) ⇒ PHẢI 0 hàng ==='
SELECT set_config('app.tenant_id', gen_random_uuid()::text, true);
SELECT count(*) AS hoa_don_tenant_ngau_nhien__ky_vong_0 FROM hoa_don;

-- ---------------------------------------------------------------------------
-- PHẦN POSITIVE + CROSS-LEAK: chỉ chạy khi truyền -v tenant_real=<uuid có data>.
-- (psql: nếu :tenant_real chưa đặt, các lệnh dưới sẽ lỗi cú pháp → chạy có -v.)
-- ---------------------------------------------------------------------------
\if :{?tenant_real}
  \echo ''
  \echo '=== 7) POSITIVE: set app.tenant_id = tenant thật ⇒ thấy ĐÚNG dữ liệu tenant đó ==='
  SELECT set_config('app.tenant_id', :'tenant_real', true);
  SELECT count(*) AS hoa_don_tenant_that FROM hoa_don;

  \echo ''
  \echo '=== 8) CROSS-LEAK: đang set tenant_real, truy vấn TƯỜNG MINH tenant_id KHÁC ⇒ 0 ==='
  \echo '    (RLS chặn kể cả khi WHERE tenant_id = <tenant khác> — không rò xuyên tenant)'
  SELECT count(*) AS hoa_don_tenant_khac_ky_vong_0
  FROM hoa_don
  WHERE tenant_id <> :'tenant_real';
\else
  \echo ''
  \echo '=== 7-8) BỎ QUA POSITIVE/CROSS-LEAK: không có -v tenant_real. Chạy lại với'
  \echo '    -v tenant_real="<uuid tenant có data>" để hoàn tất bằng chứng cách ly. ==='
\endif

\echo ''
\echo '=== 9) auth_lookup_user gọi được bằng role app (đường login) — KHÔNG lộ hàng qua RLS ==='
\echo '    (Chỉ kiểm hàm TỒN TẠI + EXECUTE được; không truyền email thật.)'
SELECT has_function_privilege(current_user, 'public.auth_lookup_user(text)', 'EXECUTE') AS co_execute_auth_lookup;

\echo ''
\echo '=== HẾT PROBE. Chép TOÀN BỘ output (kèm ngày, region Neon) vào ADR. ==='

-- U18 — Danh tính super-admin (NGOÀI trục tenant) + con đường xuyên-tenant CÓ KIỂM SOÁT.
--
-- ĐÂY LÀ NGOẠI LỆ CÁCH LY TENANT DUY NHẤT CỦA DỰ ÁN (multi-tenant.md). Nguyên tắc: bề mặt
-- hẹp, mỗi thao tác một "cửa", có audit, KHÔNG mở role rộng cho app. Phương án A đã chốt
-- 2026-07-21 (xem docs/plans/U18-plan-thuc-thi.md §3); phương án B (role BYPASSRLS +
-- connection riêng cho route admin) bị loại vì mọi bug ở route admin sẽ thành lỗ rò TOÀN
-- CỤC, không còn giới hạn ở một hàm.
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- QUYẾT ĐỊNH CÓ CHỦ Ý: KHÔNG ĐỤNG auth_lookup_user()
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Cờ `phai_doi_mat_khau` và `mat_khau_tam_het_han` cần đọc lúc ĐĂNG NHẬP KHÁCH, nên phản
-- xạ đầu tiên là thêm chúng vào RETURNS TABLE của auth_lookup_user(). KHÔNG LÀM.
--
-- Đổi RETURNS TABLE buộc DROP + CREATE (Postgres chặn CREATE OR REPLACE — lỗi 42P13, đã
-- KIỂM CHỨNG ở 0009). Và DROP FUNCTION xoá SẠCH mọi GRANT EXECUTE gắn trên hàm, kể cả
-- grant cho `vat_app` được cấp NGOÀI lịch sử migration (packages/db/provisioning/
-- app-role.sql, chạy tay lúc provision) — không migration nào "biết" để cấp lại. 0009 đã
-- đi đúng vào cái bẫy này và làm hỏng TOÀN BỘ login production.
--
-- Đường thay thế, không rủi ro: route /auth/login sau khi auth_lookup_user() trả về đã
-- CÓ `tenant_id` ⇒ đọc hai cột mới bằng một truy vấn thường trong `withTenant(tenant_id)`,
-- dưới RLS bình thường. Không cần bề mặt SECURITY DEFINER nào, không chạm hàm đang gánh
-- toàn bộ đường đăng nhập production.
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 1 — Role sở hữu các hàm admin. NOLOGIN + BYPASSRLS, TÁCH khỏi `auth_lookup`.
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Vì sao KHÔNG tái dùng `auth_lookup`: hai role = hai bán kính thiệt hại. `auth_lookup`
-- chỉ đọc nguoi_dung/tenants phục vụ đăng nhập; `admin_api` GHI xuyên-tenant. Gộp lại thì
-- một lỗi ở đường admin sẽ nới quyền cho cả đường đăng nhập của khách, và ngược lại.
-- Idiom `IF EXISTS pg_roles` theo đúng 0001 — dev/CI/PGlite chạy lại được, không vỡ.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_api') THEN
    CREATE ROLE admin_api NOLOGIN BYPASSRLS;
  END IF;
END $$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 2 — Bảng danh tính chủ. KHÔNG có tenant_id (super-admin đứng ngoài trục tenant).
-- ══════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "quan_tri_he_thong" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "ten" text,
  "trang_thai" text NOT NULL DEFAULT 'active',
  "ngay_tao" timestamptz NOT NULL DEFAULT now(),
  "dang_nhap_cuoi" timestamptz
);--> statement-breakpoint
-- Email chuẩn hoá không phân biệt hoa/thường — CÙNG hợp đồng với nguoi_dung (0010). Ba nơi
-- phải đồng ý: tầng gọi trim+lowercase, hàm admin_lookup so trên lower(email), chỉ mục này
-- trên BIỂU THỨC lower(email). Lệch một chỗ là tự khoá chủ dự án ra khỏi Cổng Admin.
CREATE UNIQUE INDEX IF NOT EXISTS "quan_tri_he_thong_email_unique"
  ON "quan_tri_he_thong" (lower("email"));--> statement-breakpoint

-- FAIL-CLOSED: RLS bật + FORCE nhưng KHÔNG có policy nào. Mọi role không-owner và
-- không-BYPASSRLS đọc ra 0 hàng dù có GRANT SELECT — cùng thủ pháp 0007 đã dùng cho
-- audit_log_admin. Đây là lớp phòng thủ thứ hai phòng khi một provisioning tương lai chạy
-- `GRANT ... ON ALL TABLES` và vô tình quét trúng bảng này.
ALTER TABLE "quan_tri_he_thong" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quan_tri_he_thong" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Lớp phòng thủ thứ nhất: KHÔNG cấp gì cho PUBLIC. Bảng này chứa password_hash của chủ
-- phần mềm — đường vào duy nhất là các hàm SECURITY DEFINER bên dưới.
REVOKE ALL ON "quan_tri_he_thong" FROM PUBLIC;--> statement-breakpoint
-- BYPASSRLS bỏ qua policy HÀNG, KHÔNG thay quyền BẢNG ⇒ owner của hàm phải được cấp
-- tường minh (bài học 0009 Bước 4).
GRANT SELECT, UPDATE ON "quan_tri_he_thong" TO admin_api;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 3 — Cột phục vụ mật khẩu tạm (U18 §6, đã điều chỉnh theo QĐ-1: KHÔNG gửi email).
-- ══════════════════════════════════════════════════════════════════════════════════════
-- U17-plan §123 hẹn đặt sẵn hai cột này ở U17 "để migration gọn" nhưng U17 đã bỏ — đo
-- được trên schema thật (nguoiDung.ts không có), nên U18 tự thêm.
--
-- `mat_khau_tam_het_han`: mật khẩu tạm 6 chữ số chỉ có 10^6 không gian ⇒ ĐIỀU KIỆN BÙ BẮT
-- BUỘC là hết hạn + buộc đổi + rate-limit login (U18-plan §103). Cột này là chân "hết hạn".
-- NULL = mật khẩu do chính người dùng đặt, không hết hạn.
ALTER TABLE "nguoi_dung"
  ADD COLUMN IF NOT EXISTS "phai_doi_mat_khau" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "nguoi_dung"
  ADD COLUMN IF NOT EXISTS "mat_khau_tam_het_han" timestamptz;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 4 — Quyền BẢNG cho admin_api (trước khi tạo hàm, cho dễ đọc cùng chỗ).
-- ══════════════════════════════════════════════════════════════════════════════════════
GRANT SELECT, UPDATE ON "tenants" TO admin_api;--> statement-breakpoint
GRANT SELECT, UPDATE ON "nguoi_dung" TO admin_api;--> statement-breakpoint
GRANT SELECT ON "tai_khoan_thue" TO admin_api;--> statement-breakpoint
GRANT SELECT ON "lan_dong_bo" TO admin_api;--> statement-breakpoint
-- audit_log_admin: 0007 mở đường GHI (GRANT INSERT TO PUBLIC + policy FOR INSERT) và cố ý
-- để dành đường ĐỌC cho U18 — đây là chỗ mở nó, đúng như comment ở auditLogAdmin.ts.
-- KHÔNG thêm policy FOR SELECT: admin_api có BYPASSRLS nên đọc được, còn mọi role khác vẫn
-- ra 0 hàng. Bề mặt đọc duy nhất là hàm admin_doc_audit() bên dưới.
GRANT SELECT ON "audit_log_admin" TO admin_api;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 5 — Các hàm SECURITY DEFINER. Mỗi hàm là MỘT cửa hẹp, không hàm nào nhận SQL tự do.
-- ══════════════════════════════════════════════════════════════════════════════════════
-- `SET search_path = public` trên MỌI hàm: bắt buộc với SECURITY DEFINER, nếu không kẻ gọi
-- có thể dựng schema giả đứng trước public và cướp quyền thực thi của owner BYPASSRLS.

-- 5.1 Tra danh tính chủ khi đăng nhập. So trên lower(email) — khớp chỉ mục biểu thức.
CREATE OR REPLACE FUNCTION admin_lookup(p_email text)
RETURNS TABLE (id uuid, email text, password_hash text, ten text, trang_thai text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.email, a.password_hash, a.ten, a.trang_thai
  FROM quan_tri_he_thong a
  WHERE lower(a.email) = p_email
$$;--> statement-breakpoint

-- 5.2 Ghi mốc đăng nhập cuối. Tách khỏi 5.1 để 5.1 giữ được STABLE (chỉ đọc).
CREATE OR REPLACE FUNCTION admin_ghi_dang_nhap_cuoi(p_id uuid)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE quan_tri_he_thong SET dang_nhap_cuoi = now() WHERE id = p_id
$$;--> statement-breakpoint

-- 5.3 Liệt kê tenant xuyên-tenant + lọc + tìm. `total` bằng window function để phân trang
-- không cần truy vấn đếm thứ hai (mục tiêu 100k tenant — không quét bảng hai lần).
-- p_trang_thai NULL = không lọc; p_q NULL/'' = không tìm.
CREATE OR REPLACE FUNCTION admin_liet_ke_tenant(
  p_trang_thai text, p_q text, p_limit int, p_offset int
)
RETURNS TABLE (
  id uuid, ten text, mst text, trang_thai text, goi_dich_vu text,
  ngay_tao timestamptz, email text, total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.ten, t.mst, t.trang_thai, t.goi_dich_vu, t.ngay_tao,
         (SELECT n.email FROM nguoi_dung n
           WHERE n.tenant_id = t.id ORDER BY n.ngay_tao LIMIT 1) AS email,
         count(*) OVER() AS total
  FROM tenants t
  WHERE (p_trang_thai IS NULL OR t.trang_thai = p_trang_thai)
    AND (
      p_q IS NULL OR p_q = '' OR
      t.mst ILIKE '%' || p_q || '%' OR
      t.ten ILIKE '%' || p_q || '%' OR
      EXISTS (SELECT 1 FROM nguoi_dung n
               WHERE n.tenant_id = t.id AND n.email ILIKE '%' || p_q || '%')
    )
  ORDER BY t.ngay_tao DESC
  LIMIT greatest(0, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0))
$$;--> statement-breakpoint

-- 5.4 Chi tiết MỘT tenant — CHỈ metadata + vòng đời. RANH GIỚI PHÁP LÝ CỨNG (chốt
-- 2026-07-15): chủ phần mềm KHÔNG đọc dữ liệu nghiệp vụ của khách. Hàm này KHÔNG chạm
-- bảng hoa_don / dong_hang_hoa — không phải "route không gọi", mà là **hàm không có
-- đường tới**, nên một route viết ẩu sau này cũng không lấy được hóa đơn qua cửa này.
--
-- Token thuế: CHỈ trả `token_het_han` (suy ra còn hạn / sắp hết / hết hạn ở tầng ứng
-- dụng). KHÔNG BAO GIỜ trả `token_hien_tai` — security.md cấm rò token.
CREATE OR REPLACE FUNCTION admin_chi_tiet_tenant(p_id uuid)
RETURNS TABLE (
  id uuid, ten text, mst text, trang_thai text, goi_dich_vu text, ghi_chu text,
  ngay_tao timestamptz, nguoi_dung jsonb, tai_khoan_thue jsonb, dong_bo_gan_nhat jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.ten, t.mst, t.trang_thai, t.goi_dich_vu, t.ghi_chu, t.ngay_tao,
    coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'email', n.email, 'vai_tro', n.vai_tro,
        'ngay_tao', n.ngay_tao, 'phai_doi_mat_khau', n.phai_doi_mat_khau,
        'da_dat_mat_khau', (n.password_hash IS NOT NULL))
      ORDER BY n.ngay_tao)
      FROM nguoi_dung n WHERE n.tenant_id = t.id), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'username', k.username, 'loai', k.loai,
        'token_het_han', k.token_het_han)
      ORDER BY k.ngay_tao)
      FROM tai_khoan_thue k WHERE k.tenant_id = t.id), '[]'::jsonb),
    (SELECT jsonb_build_object(
        'bat_dau', l.bat_dau, 'ket_thuc', l.ket_thuc, 'trang_thai', l.trang_thai,
        'so_hd_moi', l.so_hd_moi, 'so_hd_cap_nhat', l.so_hd_cap_nhat)
      FROM lan_dong_bo l WHERE l.tenant_id = t.id ORDER BY l.bat_dau DESC LIMIT 1)
  FROM tenants t
  WHERE t.id = p_id
$$;--> statement-breakpoint

-- 5.5 Đổi trạng thái — TẦNG ÉP THỨ HAI của máy trạng thái.
-- `WHERE trang_thai = p_tu` là cả cơ chế: route đã kiểm bằng tenantStateMachine.ts, nhưng
-- mệnh đề này đi cùng MỌI đường ghi. Chuyển sai (hoặc có ai đó vừa đổi trạng thái xen
-- giữa — TOCTOU) → 0 hàng cập nhật → hàm trả 0 hàng → route trả 409. Không có cửa nào
-- đổi trạng thái mà không qua kiểm tra này.
CREATE OR REPLACE FUNCTION admin_doi_trang_thai_tenant(p_id uuid, p_tu text, p_den text)
RETURNS TABLE (id uuid, trang_thai text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE tenants SET trang_thai = p_den
  WHERE id = p_id AND trang_thai = p_tu
  RETURNING tenants.id, tenants.trang_thai
$$;--> statement-breakpoint

-- 5.6 Sửa metadata. Danh sách cột sửa được là ALLOWLIST nằm ngay trong thân hàm —
-- KHÔNG nhận tên cột từ tầng gọi. `mst` (khoá tự nhiên, U23-D: 1 MST ↔ 1 tenant) và mọi
-- dữ liệu nghiệp vụ nằm ngoài tầm với của hàm này theo đúng nghĩa đen.
-- Tham số NULL = giữ nguyên cột đó (coalesce), để PATCH sửa một phần được.
CREATE OR REPLACE FUNCTION admin_sua_metadata_tenant(
  p_id uuid, p_ten text, p_goi_dich_vu text, p_ghi_chu text
)
RETURNS TABLE (id uuid, ten text, mst text, goi_dich_vu text, ghi_chu text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE tenants SET
    ten = coalesce(p_ten, tenants.ten),
    goi_dich_vu = coalesce(p_goi_dich_vu, tenants.goi_dich_vu),
    ghi_chu = coalesce(p_ghi_chu, tenants.ghi_chu)
  WHERE id = p_id
  RETURNING tenants.id, tenants.ten, tenants.mst, tenants.goi_dich_vu, tenants.ghi_chu
$$;--> statement-breakpoint

-- 5.7 Đặt mật khẩu tạm cho tài khoản chính của tenant (sau Duyệt / khi Reset).
-- Hàm nhận HASH đã băm sẵn (PBKDF2 tính ở tầng Worker bằng WebCrypto) — mật khẩu THÔ
-- không bao giờ đi vào Postgres, nên cũng không lọt vào log truy vấn chậm của DB.
-- Chọn tài khoản `quan_tri` cũ nhất = người đã đăng ký (dangKy.ts tạo đúng một hàng này).
CREATE OR REPLACE FUNCTION admin_dat_mat_khau_tam(
  p_tenant_id uuid, p_hash text, p_het_han timestamptz
)
RETURNS TABLE (id uuid, email text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE nguoi_dung SET
    password_hash = p_hash,
    phai_doi_mat_khau = true,
    mat_khau_tam_het_han = p_het_han
  WHERE id = (
    SELECT n.id FROM nguoi_dung n
    WHERE n.tenant_id = p_tenant_id AND n.vai_tro = 'quan_tri'
    ORDER BY n.ngay_tao LIMIT 1
  )
  RETURNING nguoi_dung.id, nguoi_dung.email
$$;--> statement-breakpoint

-- 5.8 Đọc nhật ký quản trị. Đường ĐỌC mà 0007 cố ý để dành cho U18.
CREATE OR REPLACE FUNCTION admin_doc_audit(p_limit int, p_offset int)
RETURNS TABLE (
  id uuid, hanh_dong text, doi_tuong text, nguoi_thuc_hien text,
  chi_tiet jsonb, tao_luc timestamptz, total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.hanh_dong, a.doi_tuong, a.nguoi_thuc_hien, a.chi_tiet, a.tao_luc,
         count(*) OVER() AS total
  FROM audit_log_admin a
  ORDER BY a.tao_luc DESC
  LIMIT greatest(0, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0))
$$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 6 — NGHI THỨC OWNERSHIP + LEAST-PRIVILEGE, áp ĐỒNG LOẠT bằng vòng lặp.
-- ══════════════════════════════════════════════════════════════════════════════════════
-- VÌ SAO VÒNG LẶP CHỨ KHÔNG PHẢI 8 KHỐI CHÉP TAY: nghi thức này gồm 3 lệnh cho mỗi hàm
-- (ALTER OWNER → REVOKE ALL FROM PUBLIC → GRANT EXECUTE cho role app). Chép tay 8 lần là
-- 24 dòng gần-giống-nhau, và **bỏ sót đúng một dòng REVOKE là mở hàm BYPASSRLS đó cho
-- PUBLIC** — tức bất kỳ ai kết nối được DB đều đổi trạng thái tenant được. Vòng lặp trên
-- một danh sách chữ ký khiến việc "sót một hàm" là bất khả thi về mặt cấu trúc, và danh
-- sách thì kiểm bằng mắt trong một lần nhìn.
--
-- Điều kiện tiên quyết (đúng 0001/0009): role migrate phải TẠM là thành viên admin_api để
-- ALTER OWNER, và admin_api cần CREATE trên schema để đủ tư cách "nhận" quyền sở hữu.
GRANT admin_api TO CURRENT_USER;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO admin_api;--> statement-breakpoint
DO $$
DECLARE
  sig text;
  -- Danh sách chữ ký ĐẦY ĐỦ. Thêm hàm admin mới ở Bước 5 thì PHẢI thêm vào đây.
  sigs text[] := ARRAY[
    'admin_lookup(text)',
    'admin_ghi_dang_nhap_cuoi(uuid)',
    'admin_liet_ke_tenant(text,text,int,int)',
    'admin_chi_tiet_tenant(uuid)',
    'admin_doi_trang_thai_tenant(uuid,text,text)',
    'admin_sua_metadata_tenant(uuid,text,text,text)',
    'admin_dat_mat_khau_tam(uuid,text,timestamptz)',
    'admin_doc_audit(int,int)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO admin_api', sig);
    -- Postgres TỰ cấp EXECUTE cho PUBLIC mỗi lần CREATE FUNCTION. Không REVOKE thì mọi
    -- role đọc/ghi xuyên-tenant được qua các hàm này — hỏng toàn bộ mục đích của U18.
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', sig);
  END LOOP;
END $$;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM admin_api;--> statement-breakpoint

-- Cấp EXECUTE cho role app (đường gọi thật từ Worker). Phải hành động NHƯ owner vì vừa
-- REVOKE ALL FROM PUBLIC — chỉ owner mới GRANT lại được.
-- Guard theo tên 'vat_app' + nhánh ELSE RAISE WARNING: tên role app KHÁC NHAU theo môi
-- trường (app-role.sql tham số hoá `-v role=<APP_ROLE>`; production = vat_app, test =
-- app_user). Guard im lặng sẽ khiến migration báo thành công trong khi Cổng Admin hỏng ở
-- môi trường đặt tên khác, không một tín hiệu nào — đúng lỗi 0009 đã phải vá.
SET ROLE admin_api;--> statement-breakpoint
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'admin_lookup(text)',
    'admin_ghi_dang_nhap_cuoi(uuid)',
    'admin_liet_ke_tenant(text,text,int,int)',
    'admin_chi_tiet_tenant(uuid)',
    'admin_doi_trang_thai_tenant(uuid,text,text)',
    'admin_sua_metadata_tenant(uuid,text,text,text)',
    'admin_dat_mat_khau_tam(uuid,text,timestamptz)',
    'admin_doc_audit(int,int)'
  ];
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'vat_app') THEN
    FOREACH sig IN ARRAY sigs LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO vat_app', sig);
    END LOOP;
  ELSE
    RAISE WARNING 'U18: role "vat_app" không tồn tại — BỎ QUA cấp EXECUTE cho 8 hàm admin_*. Nếu môi trường này CÓ role app dùng tên khác (xem packages/db/provisioning/app-role.sql), Cổng Admin SẼ KHÔNG hoạt động (permission denied) cho tới khi cấp tay: GRANT EXECUTE ON FUNCTION public.admin_lookup(text), public.admin_ghi_dang_nhap_cuoi(uuid), public.admin_liet_ke_tenant(text,text,int,int), public.admin_chi_tiet_tenant(uuid), public.admin_doi_trang_thai_tenant(uuid,text,text), public.admin_sua_metadata_tenant(uuid,text,text,text), public.admin_dat_mat_khau_tam(uuid,text,timestamptz), public.admin_doc_audit(int,int) TO <ten_role_app>;';
  END IF;
END $$;--> statement-breakpoint
RESET ROLE;--> statement-breakpoint

-- Bước 7 — ĐÓNG đường leo thang: thu hồi membership TẠM. Đặt CUỐI vì mọi bước trên đều
-- cần role migrate còn là thành viên admin_api. Sau dòng này, role migrate KHÔNG còn
-- `SET ROLE admin_api` được ⇒ không còn đường mượn BYPASSRLS qua danh tính admin.
--
-- GIỚI HẠN PHỦ TEST (ghi nhận minh bạch, giống 0009): PGlite chạy dưới superuser và quyền
-- SET ROLE xét trên session_user, nên superuser luôn SET ROLE được bất kể membership —
-- xoá hẳn dòng này test vẫn xanh. Câu lệnh vẫn đúng và đúng vị trí; độ tin cậy dựa vào
-- lần kiểm chứng tay trên Neon ghi ở 0001 (dòng 60-65), không phải bộ test PGlite.
REVOKE admin_api FROM CURRENT_USER;

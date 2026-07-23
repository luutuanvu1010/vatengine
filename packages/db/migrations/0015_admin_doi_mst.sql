-- Sửa MST trong Cổng Admin (spec 2026-07-23).
--
-- MST bị khoá có chủ ý (U23-D: khoá tự nhiên, 1 MST ↔ 1 tenant). Hàm này mở một cửa HẸP
-- cho super-admin sửa lỗi gõ nhầm lúc đăng ký, KHÔNG bẻ bất biến đó:
--   • chặn cứng khi tenant đã TỪNG ĐỒNG BỘ — đổi MST của tenant có dữ liệu thật là bỏ rơi
--     toàn bộ hoá đơn đã kéo về thành mồ côi, không hoàn tác được;
--   • `tai_khoan_thue.username` tự gán = MST lúc kết nối (U23-D2), nên đổi MST phải XOÁ
--     luôn tài khoản thuế — giữ lại là để một kết nối chết trỏ vào MST không còn tồn tại;
--   • cả hai nằm TRỌN trong thân hàm ⇒ một giao dịch: hoặc đổi cả, hoặc rollback cả.
--
-- ── VÌ SAO ĐẾM `lan_dong_bo`, KHÔNG ĐẾM `hoa_don` ────────────────────────────────────
-- Ranh giới pháp lý cứng (chốt 2026-07-15): quản trị KHÔNG có đường tới bảng `hoa_don` —
-- kể cả đếm. Cơ chế thực thi là các hàm/role phía quản trị KHÔNG được GRANT gì trên
-- `hoa_don`, và test bất biến canh đúng điều đó. `lan_dong_bo` là proxy hợp lệ: một hàng
-- ở đó nghĩa là tenant đã chạy ít nhất một lượt đồng bộ, tức đã có dữ liệu thật để mất.
-- Đánh đổi đã biết: tenant đồng bộ một kỳ RỖNG (có `lan_dong_bo` nhưng 0 hoá đơn) bị chặn
-- oan — hiếm, và chặn nhầm về phía an toàn còn hơn cho đổi rồi bỏ rơi dữ liệu.
--
-- ── VÌ SAO ROLE RIÊNG `doi_mst_api`, KHÔNG PHẢI `admin_api` ──────────────────────────
-- 0011 CỐ Ý thu hẹp quyền `admin_api` (REVOKE CREATE ON SCHEMA ở cuối) và khoá danh sách
-- hàm `admin_*` bằng test bất biến. Thêm một hàm `admin_*` thứ 9 đảo cả hai. Một role
-- riêng — cùng khuôn 0013 (`dat_mat_khau_api`) — giữ bán kính thiệt hại đúng bằng việc nó
-- làm: đọc `lan_dong_bo`, sửa `tenants.mst`, xoá `tai_khoan_thue`. KHÔNG chạm `hoa_don`.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 1 — Role sở hữu
-- ══════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'doi_mst_api') THEN
    CREATE ROLE doi_mst_api NOLOGIN BYPASSRLS;
  END IF;
END $$;--> statement-breakpoint

-- Postgres đòi chủ sở hữu MỚI của hàm phải có CREATE trên schema chứa nó (bài học 0013,
-- production 2026-07-22). BYPASSRLS là thuộc tính ROLE, KHÔNG thay quyền BẢNG — phải GRANT
-- tường minh từng bảng hàm chạm tới. TUYỆT ĐỐI không GRANT gì trên `hoa_don`.
GRANT USAGE, CREATE ON SCHEMA public TO doi_mst_api;--> statement-breakpoint
GRANT SELECT, UPDATE ON "tenants" TO doi_mst_api;--> statement-breakpoint
GRANT SELECT ON "lan_dong_bo" TO doi_mst_api;--> statement-breakpoint
-- SELECT + DELETE: `DELETE ... WHERE tenant_id = ...` đòi Postgres ĐỌC cột lọc, nên thiếu
-- SELECT thì DELETE có WHERE cũng "permission denied" (đã gặp thật khi chạy test).
GRANT SELECT, DELETE ON "tai_khoan_thue" TO doi_mst_api;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 2 — Cửa hẹp. `SET search_path = public` BẮT BUỘC (chống schema giả cướp quyền owner).
-- ══════════════════════════════════════════════════════════════════════════════════════
-- TÁCH khỏi `admin_sua_metadata_tenant` có chủ ý: hàm đó cố ý KHÔNG nhận mst (0011). Đổi
-- MST là đổi danh tính pháp lý, đáng có đường riêng + audit riêng.
CREATE OR REPLACE FUNCTION doi_mst_tenant(p_id uuid, p_mst_moi text)
RETURNS TABLE (id uuid, mst_cu text, mst_moi text, so_tk_thue_da_xoa int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mst_cu text;
  v_so_lan_dong_bo int;
  v_so_xoa int;
BEGIN
  SELECT t.mst INTO v_mst_cu FROM tenants t WHERE t.id = p_id FOR UPDATE;
  IF v_mst_cu IS NULL THEN
    RAISE EXCEPTION 'khong_thay';
  END IF;

  -- Đổi sang chính nó: không làm gì, KHÔNG ngắt kết nối oan.
  IF p_mst_moi = v_mst_cu THEN
    RETURN QUERY SELECT p_id, v_mst_cu, v_mst_cu, 0;
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_so_lan_dong_bo FROM lan_dong_bo l WHERE l.tenant_id = p_id;
  IF v_so_lan_dong_bo > 0 THEN
    RAISE EXCEPTION 'da_co_du_lieu';
  END IF;

  DELETE FROM tai_khoan_thue k WHERE k.tenant_id = p_id;
  GET DIAGNOSTICS v_so_xoa = ROW_COUNT;

  -- UNIQUE tenants_mst_unique (0006) vi phạm ⇒ 23505 nổi lên nguyên vẹn, giao dịch rollback
  -- (cả DELETE ở trên cũng lùi lại). Route map 23505 → 409 mst_da_ton_tai.
  UPDATE tenants SET mst = p_mst_moi WHERE tenants.id = p_id;

  RETURN QUERY SELECT p_id, v_mst_cu, p_mst_moi, v_so_xoa;
END $$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 3 — Nghi thức owner (khuôn 0013). Hàm MỚI nên chỉ cần owner chuẩn. Mượn tạm
-- membership để ALTER OWNER chạy ("must be able to SET ROLE" — production 2026-07-22).
-- KHÔNG trả lại membership, cùng lý do 0013: role migrate sở hữu toàn bộ bảng nên câu
-- REVOKE không thêm bảo vệ, mà lại hỏng trên Neon (non-superuser).
-- ══════════════════════════════════════════════════════════════════════════════════════
GRANT doi_mst_api TO CURRENT_USER;--> statement-breakpoint
DO $$
DECLARE
  ten_role text;
BEGIN
  ALTER FUNCTION public.doi_mst_tenant(uuid,text) OWNER TO doi_mst_api;
  REVOKE ALL ON FUNCTION public.doi_mst_tenant(uuid,text) FROM PUBLIC;
  FOREACH ten_role IN ARRAY ARRAY['vat_app', 'app_user'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = ten_role) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.doi_mst_tenant(uuid,text) TO %I', ten_role);
    END IF;
  END LOOP;
END $$;

-- Lát cắt 3 (QĐ-14) — Đặt mật khẩu bằng LINK dùng-một-lần, thay mật khẩu tạm 6 chữ số.
--
-- Mật khẩu tạm 6 số ra đời (U18, 2026-07-15) CHỈ vì chủ dự án phải đọc nó cho khách qua
-- điện thoại. Nó chấp nhận không gian 10^6 và bù bằng ba ràng buộc; QĐ-7 và QĐ-11 đã lấy
-- đi hai, chỉ còn hạn 72h. Khi hệ thống tự gửi được thư thì lý do "phải đọc qua điện
-- thoại" biến mất, và cùng với nó là toàn bộ lý do chịu đựng 10^6. Token 32 byte không
-- dò được, và khách bấm một nút thay vì gõ lại sáu chữ số.
--
-- Khuôn mẫu sao chép nguyên từ `0013_xac_thuc_email.sql`. Khác đúng ba điểm:
--   • hạn 72h thay vì 24h (nằm ở tầng ứng dụng — cột chỉ lưu mốc);
--   • token gắn vào NGƯỜI DÙNG, không phải tenant (nó đặt mật khẩu cho một tài khoản);
--   • tạo token mới thì token cũ chưa dùng CHẾT NGAY.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 1 — Role sở hữu. TÁCH khỏi `xac_thuc_api`, có chủ ý.
-- ══════════════════════════════════════════════════════════════════════════════════════
-- `xac_thuc_api` (0013) chỉ cần đọc/sửa `tenants`. Hàm ở đây phải GHI ĐƯỢC
-- `nguoi_dung.password_hash` — bảng thông tin xác thực của toàn hệ thống. Gộp hai thứ
-- nghĩa là một lỗ hổng ở đường xác thực email mượn được quyền đổi mật khẩu người khác.
-- Cùng lập luận 0013 đã dùng khi tách khỏi `admin_api`: một role giữ bán kính thiệt hại
-- đúng bằng việc nó làm.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dat_mat_khau_api') THEN
    CREATE ROLE dat_mat_khau_api NOLOGIN BYPASSRLS;
  END IF;
END $$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 2 — Bảng token
-- ══════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "dat_mat_khau" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nguoi_dung_id" uuid NOT NULL REFERENCES "nguoi_dung"("id") ON DELETE CASCADE,
  -- BĂM, không phải token thô: token này đổi được mật khẩu, nên phải đối xử như mật khẩu.
  "token_bam" text NOT NULL UNIQUE,
  "het_han" timestamptz NOT NULL,
  -- NULL = chưa dùng. Mốc thời gian thay cờ boolean để còn truy được lúc nào đã tiêu.
  "da_dung_luc" timestamptz,
  "ngay_tao" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dat_mat_khau_nguoi_dung_idx" ON "dat_mat_khau" ("nguoi_dung_id");--> statement-breakpoint

-- RLS ENABLE + FORCE, KHÔNG policy ⇒ fail-closed: không ai đọc/ghi được, kể cả owner.
-- Đường vào DUY NHẤT là hai hàm SECURITY DEFINER bên dưới. FORCE là bắt buộc — ENABLE một
-- mình không chi phối table owner (bài học U4).
ALTER TABLE "dat_mat_khau" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dat_mat_khau" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "dat_mat_khau" FROM PUBLIC;--> statement-breakpoint

-- Postgres đòi chủ sở hữu MỚI của một hàm phải có quyền CREATE trên schema chứa nó — nếu
-- không, `ALTER FUNCTION … OWNER TO` hỏng với `permission denied for schema public` (đã
-- gặp thật khi áp 0013 lên production 2026-07-22). USAGE để tham chiếu được đối tượng
-- trong schema; CREATE để đứng tên sở hữu chúng. Role vẫn NOLOGIN nên không ai đăng nhập
-- thẳng vào nó được.
GRANT USAGE, CREATE ON SCHEMA public TO dat_mat_khau_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "dat_mat_khau" TO dat_mat_khau_api;--> statement-breakpoint
GRANT SELECT, UPDATE ON "nguoi_dung" TO dat_mat_khau_api;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 3 — Hai cửa hẹp. `SET search_path = public` BẮT BUỘC trên mọi SECURITY DEFINER:
-- thiếu nó, kẻ gọi dựng được schema giả đứng trước public và cướp quyền của owner BYPASSRLS.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- 3.1 Tạo token cho tài khoản quản trị của một tenant.
--
-- Chọn tài khoản theo ĐÚNG quy tắc `admin_dat_mat_khau_tam` (0011) đang dùng — `vai_tro =
-- 'quan_tri'`, cũ nhất trước — để đường mới không âm thầm nhắm một tài khoản khác đường cũ.
--
-- `UPDATE ... SET da_dung_luc = now()` trước khi INSERT: bấm "Gửi lại link" mà link cũ vẫn
-- sống là hai chìa cùng mở một cửa, và người bấm tưởng mình vừa thu hồi chìa cũ.
CREATE OR REPLACE FUNCTION dat_mat_khau_tao(
  p_tenant_id uuid, p_token_bam text, p_het_han timestamptz
)
RETURNS TABLE (r_nguoi_dung_id uuid, r_email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  SELECT n.id, n.email INTO v_id, v_email
  FROM nguoi_dung n
  WHERE n.tenant_id = p_tenant_id AND n.vai_tro = 'quan_tri'
  ORDER BY n.ngay_tao
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;  -- 0 hàng: tenant không có tài khoản quản trị. Nơi gọi trả 404.
  END IF;

  UPDATE dat_mat_khau SET da_dung_luc = now()
  WHERE nguoi_dung_id = v_id AND da_dung_luc IS NULL;

  INSERT INTO dat_mat_khau (nguoi_dung_id, token_bam, het_han)
  VALUES (v_id, p_token_bam, p_het_han);

  RETURN QUERY SELECT v_id, v_email;
END $$;--> statement-breakpoint

-- 3.2 Dùng token: kiểm + tiêu + đặt mật khẩu, TRỌN VẸN trong một lời gọi.
--
-- Không tách "kiểm" rồi "đặt" ở tầng ứng dụng: giữa hai bước có khe hở, và hai lần submit
-- đồng thời sẽ cùng thấy token còn hiệu lực. `FOR UPDATE` khoá hàng nên lần thứ hai phải
-- chờ, và khi tới lượt thì thấy `da_dung_luc` đã có. Đúng lớp lỗi TOCTOU U18 đã gặp.
--
-- `p_hash` là mật khẩu ĐÃ BĂM ở tầng Worker (WebCrypto). Mật khẩu thô không bao giờ đi
-- vào Postgres, nên nó cũng không lọt vào nhật ký truy vấn chậm hay bản sao lưu.
--
-- KHÔNG kiểm trạng thái tenant ở đây, có chủ ý: cổng trạng thái nằm ở đường ĐĂNG NHẬP
-- (`routes/auth.ts` chỉ cho `active` vào). Tenant bị khoá sau khi duyệt mà đặt được mật
-- khẩu thì cũng vẫn không đăng nhập được — thêm một chốt nữa ở đây chỉ nhân đôi nơi phải
-- sửa khi máy trạng thái đổi.
CREATE OR REPLACE FUNCTION dat_mat_khau_dung(p_token_bam text, p_hash text)
RETURNS TABLE (ket_qua text, r_email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  v_email text;
BEGIN
  SELECT d.id, d.nguoi_dung_id, d.het_han, d.da_dung_luc INTO r
  FROM dat_mat_khau d
  WHERE d.token_bam = p_token_bam
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'khong_thay'::text, NULL::text;
    RETURN;
  END IF;

  IF r.da_dung_luc IS NOT NULL THEN
    RETURN QUERY SELECT 'da_dung'::text, NULL::text;
    RETURN;
  END IF;

  IF r.het_han <= now() THEN
    RETURN QUERY SELECT 'het_han'::text, NULL::text;
    RETURN;
  END IF;

  UPDATE dat_mat_khau SET da_dung_luc = now() WHERE id = r.id;

  -- Xoá luôn dấu vết mật khẩu tạm: mật khẩu này do CHÍNH người dùng đặt, nên cờ nhắc đổi
  -- và mốc hết hạn 72h của mật khẩu tạm đều không còn nghĩa. Bỏ sót hai dòng này thì một
  -- tài khoản cũ từng nhận mật khẩu tạm sẽ bị cổng hết-hạn ở login chặn dù vừa đặt xong.
  UPDATE nguoi_dung SET
    password_hash = p_hash,
    phai_doi_mat_khau = false,
    mat_khau_tam_het_han = NULL
  WHERE id = r.nguoi_dung_id
  RETURNING email INTO v_email;

  RETURN QUERY SELECT 'ok'::text, v_email;
END $$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 4 — Nghi thức sở hữu. Viết bằng vòng lặp vì bỏ sót đúng một dòng REVOKE là mở một
-- hàm BYPASSRLS cho PUBLIC (khuôn mẫu 0011/0013).
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Mượn TẠM membership: `ALTER FUNCTION ... OWNER TO r` đòi role đang chạy phải là THÀNH
-- VIÊN của `r`. Thiếu dòng này, migration hỏng với "must be able to SET ROLE" — đã gặp
-- thật trên production 2026-07-22. PGlite KHÔNG bắt được vì nó chạy superuser.
--
-- KHÔNG có bước trả lại membership, cùng lý do đã ghi ở cuối 0013: trên Neon, role chạy
-- migration là `neondb_owner` (không phải superuser) và câu REVOKE hỏng; mà nó cũng không
-- bảo vệ thêm gì vì `neondb_owner` sở hữu toàn bộ bảng, tự tắt RLS được bất cứ lúc nào.
GRANT dat_mat_khau_api TO CURRENT_USER;--> statement-breakpoint
DO $$
DECLARE
  sig text;
  ten_role text;
  cap_duoc boolean;
  sigs text[] := ARRAY[
    'dat_mat_khau_tao(uuid,text,timestamptz)',
    'dat_mat_khau_dung(text,text)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO dat_mat_khau_api', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', sig);
  END LOOP;

  -- Tên role app KHÁC NHAU theo môi trường: production `vat_app`, test `app_user`.
  -- 0013 đã học bài này bằng một test đỏ — cấp cho MỌI tên role app đã biết, không chỉ một.
  cap_duoc := false;
  FOREACH ten_role IN ARRAY ARRAY['vat_app', 'app_user'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = ten_role) THEN
      cap_duoc := true;
      FOREACH sig IN ARRAY sigs LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I', sig, ten_role);
      END LOOP;
    END IF;
  END LOOP;

  IF NOT cap_duoc THEN
    RAISE WARNING 'Lát cắt 3: KHÔNG tìm thấy role app nào (đã thử vat_app, app_user) — BỎ QUA cấp EXECUTE cho dat_mat_khau_tao/dung. Nếu môi trường này dùng tên role khác, DUYỆT TENANT VÀ ĐẶT MẬT KHẨU SẼ HỎNG (permission denied) cho tới khi cấp tay: GRANT EXECUTE ON FUNCTION public.dat_mat_khau_tao(uuid,text,timestamptz), public.dat_mat_khau_dung(text,text) TO <ten_role_app>;';
  END IF;
END $$;

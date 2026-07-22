-- U34c (QĐ-15) — Xác thực địa chỉ email khi đăng ký.
--
-- Chuỗi mới: đăng ký → `cho_xac_thuc_email` → khách bấm link trong thư → `cho_duyet` →
-- lúc ĐÓ mới báo admin. Xác thực email là bộ lọc đặt TRƯỚC người thật: nếu báo admin ngay
-- từ lúc đăng ký, kênh Telegram/email của chủ dự án thành đích spam của chính cổng công
-- khai mà U33 vừa mở.
--
-- `tenants.trang_thai` là `text` (không phải enum) nên trạng thái mới không cần DDL — máy
-- trạng thái nằm ở `apps/api/src/admin/tenantStateMachine.ts`, đó mới là nơi chi phối.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 1 — Role sở hữu các hàm xác thực. TÁCH khỏi `admin_api` có chủ ý.
-- ══════════════════════════════════════════════════════════════════════════════════════
-- `admin_api` là danh tính của MIỀN QUẢN TRỊ. Đường xác thực email là đường CÔNG KHAI —
-- ai cầm một chuỗi token cũng gọi tới được. Gộp hai thứ vào một role BYPASSRLS nghĩa là
-- một lỗ hổng ở đường công khai sẽ mượn được đúng danh tính đang gánh toàn bộ quyền quản
-- trị. Một role riêng giữ bán kính thiệt hại đúng bằng việc nó làm.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xac_thuc_api') THEN
    CREATE ROLE xac_thuc_api NOLOGIN BYPASSRLS;
  END IF;
END $$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 2 — Bảng token
-- ══════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "xac_thuc_email" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  -- BĂM, không phải token thô. Token này là CHÌA KHOÁ chuyển trạng thái tenant, nên phải
  -- được đối xử đúng như mật khẩu: rò cơ sở dữ liệu không được biến thành rò quyền.
  "token_bam" text NOT NULL UNIQUE,
  "het_han" timestamptz NOT NULL,
  -- NULL = chưa dùng. Dùng mốc thời gian thay cờ boolean để còn truy được lúc nào đã dùng.
  "da_dung_luc" timestamptz,
  "ngay_tao" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "xac_thuc_email_tenant_idx" ON "xac_thuc_email" ("tenant_id");--> statement-breakpoint

-- RLS ENABLE + FORCE, KHÔNG policy nào ⇒ fail-closed: mặc định không ai đọc/ghi được, kể
-- cả owner. Đường vào DUY NHẤT là hai hàm SECURITY DEFINER bên dưới. FORCE là bắt buộc —
-- ENABLE một mình không chi phối table owner (bài học U4).
ALTER TABLE "xac_thuc_email" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "xac_thuc_email" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "xac_thuc_email" FROM PUBLIC;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "xac_thuc_email" TO xac_thuc_api;--> statement-breakpoint
GRANT SELECT, UPDATE ON "tenants" TO xac_thuc_api;--> statement-breakpoint
GRANT SELECT ON "nguoi_dung" TO xac_thuc_api;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 3 — Hai cửa hẹp. `SET search_path = public` BẮT BUỘC trên mọi SECURITY DEFINER:
-- thiếu nó, kẻ gọi dựng được schema giả đứng trước public và cướp quyền của owner BYPASSRLS.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- 3.1 Tạo token. Gọi ngay sau khi tạo tenant, trong cùng đường đăng ký.
CREATE OR REPLACE FUNCTION xac_thuc_email_tao(
  p_tenant_id uuid, p_token_bam text, p_het_han timestamptz
)
RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO xac_thuc_email (tenant_id, token_bam, het_han)
  VALUES (p_tenant_id, p_token_bam, p_het_han)
  RETURNING id
$$;--> statement-breakpoint

-- 3.2 Dùng token: kiểm + tiêu + chuyển trạng thái, TRỌN VẸN trong một lời gọi.
--
-- Vì sao không tách thành "kiểm" rồi "tiêu" ở tầng ứng dụng: giữa hai bước đó có khe hở,
-- và hai lần bấm đồng thời (người dùng bấm hai lần, hoặc trình duyệt tải trước) sẽ cùng
-- thấy token còn hiệu lực. `FOR UPDATE` khoá hàng nên lần thứ hai phải chờ, và khi tới
-- lượt thì thấy `da_dung_luc` đã có ⇒ trả `da_dung`. Đây đúng lớp lỗi TOCTOU mà U18 đã
-- gặp một lần ở đường duyệt tenant.
CREATE OR REPLACE FUNCTION xac_thuc_email_dung(p_token_bam text)
RETURNS TABLE (ket_qua text, r_tenant_id uuid, r_ten text, r_mst text, r_email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT x.id, x.tenant_id, x.het_han, x.da_dung_luc INTO r
  FROM xac_thuc_email x
  WHERE x.token_bam = p_token_bam
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'khong_thay'::text, NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF r.da_dung_luc IS NOT NULL THEN
    RETURN QUERY SELECT 'da_dung'::text, NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF r.het_han <= now() THEN
    RETURN QUERY SELECT 'het_han'::text, NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE xac_thuc_email SET da_dung_luc = now() WHERE id = r.id;

  -- Điều kiện `trang_thai = 'cho_xac_thuc_email'` là chốt thứ hai: token còn hiệu lực
  -- nhưng tenant đã bị từ chối/khoá thì KHÔNG được âm thầm kéo ngược về `cho_duyet`.
  UPDATE tenants SET trang_thai = 'cho_duyet'
  WHERE id = r.tenant_id AND trang_thai = 'cho_xac_thuc_email';

  RETURN QUERY
    SELECT 'ok'::text, t.id, t.ten, t.mst, u.email
    FROM tenants t
    LEFT JOIN nguoi_dung u ON u.tenant_id = t.id
    WHERE t.id = r.tenant_id
    LIMIT 1;
END $$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 4 — Nghi thức sở hữu. Ba lệnh cho mỗi hàm, viết bằng vòng lặp vì bỏ sót đúng một
-- dòng REVOKE là mở một hàm BYPASSRLS cho PUBLIC (khuôn mẫu 0011).
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Mượn TẠM membership: `ALTER FUNCTION ... OWNER TO r` đòi role đang chạy phải là THÀNH
-- VIÊN của `r`. Thiếu dòng này, migration hỏng với "must be able to SET ROLE" — đã gặp
-- thật trên production 2026-07-22. PGlite KHÔNG bắt được vì nó chạy superuser, và superuser
-- SET ROLE được tới bất kỳ role nào; đúng khoảng mù mà 0011 đã ghi nhận.
GRANT xac_thuc_api TO CURRENT_USER;--> statement-breakpoint
DO $$
DECLARE
  sig text;
  ten_role text;
  cap_duoc boolean;
  sigs text[] := ARRAY[
    'xac_thuc_email_tao(uuid,text,timestamptz)',
    'xac_thuc_email_dung(text)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO xac_thuc_api', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', sig);
  END LOOP;

  -- Tên role app KHÁC NHAU theo môi trường: production `vat_app`, test `app_user`
  -- (app-role.sql tham số hoá `-v role=<APP_ROLE>`).
  --
  -- 0011 chỉ cấp cho `vat_app` và cảnh báo ở nhánh ELSE. Với các hàm admin thì không sao —
  -- test không chạy đường đó dưới role non-superuser. Nhưng ĐĂNG KÝ thì có, và test
  -- "QĐ-1: INSERT tenant qua withTenant lọt RLS dưới role production non-superuser" đã ĐỎ
  -- ngay khi thiếu: `permission denied for function xac_thuc_email_tao`. Cảnh báo đã làm
  -- đúng việc của nó — nên ở đây cấp cho MỌI tên role app đã biết, thay vì chỉ một.
  cap_duoc := false;
  FOREACH ten_role IN ARRAY ARRAY['vat_app', 'app_user'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = ten_role) THEN
      cap_duoc := true;
      FOREACH sig IN ARRAY sigs LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I', sig, ten_role);
      END LOOP;
    END IF;
  END LOOP;

  IF cap_duoc THEN
    NULL;
  ELSE
    RAISE WARNING 'U34c: KHÔNG tìm thấy role app nào (đã thử vat_app, app_user) — BỎ QUA cấp EXECUTE cho xac_thuc_email_tao/dung. Nếu môi trường này dùng tên role khác, ĐĂNG KÝ VÀ XÁC THỰC EMAIL SẼ HỎNG (permission denied) cho tới khi cấp tay: GRANT EXECUTE ON FUNCTION public.xac_thuc_email_tao(uuid,text,timestamptz), public.xac_thuc_email_dung(text) TO <ten_role_app>;';
  END IF;
END $$;--> statement-breakpoint

-- ĐÓNG đường leo thang: trả lại membership TẠM ngay sau khi xong. Để nguyên nghĩa là role
-- chạy migration vĩnh viễn mượn được BYPASSRLS qua danh tính này (khuôn mẫu 0011 Bước 7).
REVOKE xac_thuc_api FROM CURRENT_USER;

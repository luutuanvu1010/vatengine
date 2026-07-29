-- U37c — hai hàm phục vụ ĐƯỜNG TẢI CÔNG KHAI `/tai/<token>`.
--
-- VÌ SAO PHẢI LÀ SECURITY DEFINER: đường tải không có phiên đăng nhập ⇒ không có
-- `app.tenant_id` để đặt ⇒ policy `goi_chia_se_tenant_isolation` trả 0 hàng cho `vat_app`.
-- Không thể "tra tenant trước rồi đặt app.tenant_id" vì chính bước tra đó đã bị RLS chặn.
--
-- Dùng lại đúng nghi thức của `auth_lookup_user` (0001/0009): hàm thuộc sở hữu role
-- `auth_lookup` (NOLOGIN, BYPASSRLS), REVOKE khỏi PUBLIC, chỉ GRANT EXECUTE cho `vat_app`.
-- KHÔNG dựng cơ chế vượt-RLS thứ hai cho cùng một loại việc.
--
-- BỀ MẶT ĐƯỢC MỞ HẸP NHẤT CÓ THỂ: hàm KHÔNG nhận `tenant_id`, KHÔNG trả dữ liệu hóa đơn,
-- và chỉ trả hàng khi gói CÒN HIỆU LỰC. Kẻ gọi được hàm mà không có token hợp lệ không lấy
-- được gì; có token hợp lệ thì vốn đã tải được file rồi.

GRANT auth_lookup TO CURRENT_USER;--> statement-breakpoint

-- Hàm SECURITY DEFINER chạy với quyền của OWNER, nên `auth_lookup` phải tự có quyền trên
-- bảng — nó BYPASSRLS nên không vướng policy, nhưng BYPASSRLS KHÔNG thay thế GRANT.
-- Thiếu hai dòng này thì hàm dựng được, gọi được, rồi ném "permission denied for table
-- goi_chia_se" ngay lượt tải đầu (đã tái lập trên PGlite trước khi vá).
GRANT SELECT ON goi_chia_se TO auth_lookup;--> statement-breakpoint
-- Least-privilege ở mức CỘT: hàm chỉ được đụng bộ đếm, không sửa được trạng thái hay hạn
-- dùng của gói — tức không tự nới hiệu lực một liên kết.
GRANT UPDATE (so_luot_tai, lan_tai_cuoi) ON goi_chia_se TO auth_lookup;--> statement-breakpoint

-- Trả gói cho một token, CHỈ khi còn hiệu lực.
--
-- Ba điều kiện gộp vào ĐÂY chứ không để tầng ứng dụng tự kiểm: đây là chỗ duy nhất mọi
-- đường tải đi qua, đặt luật ở đây thì không ai quên được vế nào.
--   `trang_thai = 'san_sang'` → đã thu hồi thì tắt ngay, không chờ xóa file hay hết cache.
--   `het_han_luc > now()`     → hết hạn ÉP Ở DB, không chờ R2 Lifecycle (Cloudflare chỉ
--                               bảo đảm xóa TRONG VÒNG 24h sau mốc ⇒ trước đây link còn
--                               sống quá hạn tới một ngày).
CREATE OR REPLACE FUNCTION tai_tra_goi(p_token text)
RETURNS TABLE (id uuid, tenant_id uuid, khoa_r2 text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.tenant_id, g.khoa_r2
  FROM goi_chia_se g
  WHERE g.token = p_token
    AND g.trang_thai = 'san_sang'
    AND g.het_han_luc > now();
$$;--> statement-breakpoint

-- Ghi nhận một lượt tải. Tách khỏi hàm tra để CHỈ đếm khi thực sự phục vụ được file
-- (object còn trong R2), không đếm cả những lần tra hụt.
CREATE OR REPLACE FUNCTION tai_ghi_nhan_luot(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE goi_chia_se
  SET so_luot_tai = so_luot_tai + 1, lan_tai_cuoi = now()
  WHERE token = p_token AND trang_thai = 'san_sang';
$$;--> statement-breakpoint

-- Đổi chủ sở hữu đòi CHỦ MỚI có quyền CREATE trên schema — Postgres 15+ đã thu hồi CREATE
-- mặc định của PUBLIC trên `public`, nên `auth_lookup` không còn tự có (0001 chạy thời còn
-- có). Không phát hiện được bằng đọc mã: chỉ nổ khi ALTER OWNER chạy thật trên Neon.
-- USAGE giữ vĩnh viễn (hàm cần để phân giải tên khi chạy); CREATE cấp tạm rồi THU LẠI ngay
-- — quyền tạo đối tượng mới trong schema không thuộc về một role chỉ để sở hữu 3 hàm.
GRANT USAGE ON SCHEMA public TO auth_lookup;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO auth_lookup;--> statement-breakpoint
ALTER FUNCTION tai_tra_goi(text) OWNER TO auth_lookup;--> statement-breakpoint
ALTER FUNCTION tai_ghi_nhan_luot(text) OWNER TO auth_lookup;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM auth_lookup;--> statement-breakpoint

-- Hàm SECURITY DEFINER mặc định cho PUBLIC gọi được. Thu về, chỉ mở cho role ứng dụng.
REVOKE ALL ON FUNCTION tai_tra_goi(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION tai_ghi_nhan_luot(text) FROM PUBLIC;--> statement-breakpoint

-- Guard `IF EXISTS pg_roles` theo đúng idiom 0001/0009: `vat_app` được cấp NGOÀI lịch sử
-- migration (provisioning chạy tay), nên KHÔNG tồn tại ở dev/CI/PGlite. Thiếu guard là vỡ
-- toàn bộ test. Thiếu chính khối này là production 500 ngay lần tải đầu.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vat_app') THEN
    GRANT EXECUTE ON FUNCTION tai_tra_goi(text) TO vat_app;
    GRANT EXECUTE ON FUNCTION tai_ghi_nhan_luot(text) TO vat_app;
  ELSE
    RAISE WARNING 'role vat_app khong ton tai — bo qua GRANT EXECUTE (moi truong dev/CI)';
  END IF;
END $$;

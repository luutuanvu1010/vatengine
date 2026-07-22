-- U34f / QĐ-17 (2026-07-22) — Ẩn danh hoá email còn sót trong `audit_log`.
--
-- BỐI CẢNH: `routes/dangKy.ts` từng ghi thẳng email khách vào `chi_tiet`, trong khi
-- `audit_log` là bảng KHÔNG SỬA, KHÔNG XOÁ được (trigger `audit_log_immutable`, 0002).
-- Nguồn chảy đã bịt ở tầng mã cùng ngày (`maskSensitive` che email). File này dọn phần đã
-- lỡ ghi. Đo trên production trước khi viết: ĐÚNG 2 hàng, đều là `dang_ky`;
-- `audit_log_admin` sạch (0 hàng).
--
-- ⚠️ VÌ SAO PHẢI TẮT TRIGGER, VÀ VÌ SAO ĐÓ KHÔNG PHẢI LÀ MỞ MỘT LỖ HỔNG
-- Trigger cố ý chặn CẢ owner lẫn superuser, nên không có đường nào sửa hàng audit mà không
-- tắt nó. Điều kiện để việc này không phá vỡ cam kết bất biến:
--   1. Tắt và bật lại nằm TRONG CÙNG MỘT khối `DO` ⇒ lỗi ở bất kỳ bước nào cũng rollback
--      trọn vẹn, không có trạng thái "quên bật lại".
--   2. Khối tự KIỂM CHỨNG trigger đã bật lại, và ném lỗi nếu chưa — không tin, mà kiểm.
--   3. Ai chạy được migration thì vốn đã có toàn quyền trên DB; file này không cấp thêm
--      quyền gì cho ai. Nó chỉ khiến một thao tác vốn đã khả thi trở nên CÓ REVIEW.
--
-- DẤU VẾT: chủ ý KHÔNG ghi thêm hàng audit cho chính việc ẩn danh hoá này. Dấu vết đã đủ
-- và tốt hơn: file nằm trong git (có review, có tác giả, có commit), và bảng
-- `__drizzle_migrations` ghi lại thời điểm nó chạy. Ghi một hàng audit từ migration thì
-- phải bịa ra `tenant_id` và `nguoi_thuc_hien` — tức là làm bẩn chính cái sổ đang dọn.
--
-- IDEMPOTENT: chạy lại thì `UPDATE` khớp 0 hàng và phần kiểm chứng vẫn xanh.
DO $$
DECLARE
  so_hang_da_sua int;
  trigger_con_tat int;
  so_hang_con_email int;
BEGIN
  EXECUTE 'ALTER TABLE audit_log DISABLE TRIGGER audit_log_immutable';

  -- Chỉ thay ĐÚNG giá trị của khoá `email`, giữ nguyên `mst` và `tenDoanhNghiep`: đó là dữ
  -- liệu đăng ký kinh doanh công khai của một TỔ CHỨC, không phải dữ liệu cá nhân, và là
  -- thứ khiến hàng audit còn truy vết được. Ẩn danh hoá không phải là xoá trắng.
  -- Dùng '***' cho khớp hằng REDACTED của `maskSensitive` — hàng cũ và hàng mới cùng dạng.
  UPDATE audit_log
     SET chi_tiet = jsonb_set(chi_tiet, '{email}', '"***"'::jsonb)
   WHERE chi_tiet ? 'email'
     AND chi_tiet->>'email' <> '***';
  GET DIAGNOSTICS so_hang_da_sua = ROW_COUNT;

  EXECUTE 'ALTER TABLE audit_log ENABLE TRIGGER audit_log_immutable';

  -- KIỂM CHỨNG 1 — trigger đã bật lại thật. Nếu bỏ bước này thì một thay đổi tương lai làm
  -- lệnh ENABLE im lặng không ăn sẽ để bảng audit mất bất biến VĨNH VIỄN mà không ai biết.
  SELECT count(*) INTO trigger_con_tat
    FROM pg_trigger
   WHERE tgrelid = 'audit_log'::regclass
     AND tgname  = 'audit_log_immutable'
     AND tgenabled = 'D';
  IF trigger_con_tat > 0 THEN
    RAISE EXCEPTION 'audit_log_immutable VẪN ĐANG TẮT sau khi ENABLE — huỷ toàn bộ migration';
  END IF;

  -- KIỂM CHỨNG 2 — không còn chuỗi hình dạng email ở BẤT KỲ ĐÂU trong chi_tiet, không chỉ
  -- dưới khoá `email`. Nhờ vậy migration không thể "thành công" mà vẫn để sót: nếu sau này
  -- có hàng chứa email lẫn trong chuỗi tự do, nó sẽ ĐỎ ở đây thay vì trôi qua lặng lẽ.
  SELECT count(*) INTO so_hang_con_email
    FROM audit_log
   WHERE chi_tiet::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  IF so_hang_con_email > 0 THEN
    RAISE EXCEPTION 'Vẫn còn % hàng audit_log chứa chuỗi hình dạng email — huỷ toàn bộ migration',
      so_hang_con_email;
  END IF;

  RAISE NOTICE 'Đã ẩn danh hoá email ở % hàng audit_log; trigger bất biến đã bật lại.',
    so_hang_da_sua;
END $$;

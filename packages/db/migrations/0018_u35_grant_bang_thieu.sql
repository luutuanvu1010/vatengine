-- Sự cố 2026-07-28 (docs/plans/HANDOFF-phien-2026-07-28-grant-thieu.md, §2–§3): migration
-- 0008 (dong_bo_that_bai, 2026-07-20) và 0017 (bo_dem_phien_ban, lich_su_thay_doi_hoa_don,
-- U35) đều TẠO bảng mà QUÊN GRANT cho vat_app — đúng cái bẫy 0007:72-75 đã cảnh báo bằng
-- chữ ("app-role.sql chạy GRANT ON ALL TABLES MỘT LẦN, không có ALTER DEFAULT PRIVILEGES,
-- bảng tạo sau đó KHÔNG thừa hưởng quyền nào"). Hệ quả THẬT trên production, đã đo:
--   * `permission denied for table bo_dem_phien_ban` → 39 phiên đồng bộ `failed`/24h.
--   * Sổ dead-letter `dong_bo_that_bai` câm hoàn toàn 8 ngày (từ 20/07) — mọi job chết
--     không để lại dấu vết nào, một phần khiến sự cố livelock 27/07 chẩn đoán trong mù.
-- Đã VÁ NÓNG ba câu GRANT y hệt dưới đây thẳng trên DB production sáng 28/07 (xác minh lại
-- bằng has_table_privilege ngay sau khi cấp). Migration này CODIFY lại đúng vá đó, để một
-- DB mới/staging/khôi phục DR không tái tạo đúng lỗi (mục 4.1 trong handoff trên).
--
-- Phạm vi quyền: SELECT, INSERT, UPDATE — KHÔNG DELETE. Cả ba bảng đều chỉ đọc/ghi/cập
-- nhật qua đường nghiệp vụ hiện có (đếm nguyên tử, nhật ký thay đổi, sổ dead-letter);
-- không nghiệp vụ nào xoá hàng ở ba bảng này — giữ least-privilege khớp đúng những gì đã
-- vá thật, không nới thêm "cho chắc".
--
-- Guard theo tên role (idiom 0009:121/0011:314): tên role app khác nhau theo môi trường
-- (production = vat_app; PGlite test tự GRANT rộng ON ALL TABLES ở bước setup — xem
-- packages/db/test/integration/constraints.test.ts:161-165 — nên không cần role này tồn
-- tại để test qua). Guard im lặng đúng "thành công" giả — RAISE WARNING để không lặp lại
-- kiểu lỗi 0009 đã phải vá (cảnh báo mất tích, hỏng chỉ lộ ra sau khi deploy).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'vat_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "bo_dem_phien_ban", "lich_su_thay_doi_hoa_don", "dong_bo_that_bai" TO vat_app;
  ELSE
    RAISE WARNING 'U35-vá (0018): role "vat_app" không tồn tại — BỎ QUA GRANT cho bo_dem_phien_ban/lich_su_thay_doi_hoa_don/dong_bo_that_bai. Nếu môi trường này CÓ role app dùng tên khác (xem packages/db/provisioning/app-role.sql), ba bảng này SẼ báo permission denied cho tới khi cấp tay: GRANT SELECT, INSERT, UPDATE ON "bo_dem_phien_ban", "lich_su_thay_doi_hoa_don", "dong_bo_that_bai" TO <ten_role_app>;';
  END IF;
END $$;--> statement-breakpoint

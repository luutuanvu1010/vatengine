-- U17b (Task 5b, F4) — nguoi_dung_email_unique (migration 0006) là chỉ mục BYTE-EXACT trên
-- cột "email" trần. dangKy.ts (đăng ký công khai) chuẩn hoá (trim+lowercase) email MỚI
-- trước khi ghi, nhưng chỉ mục byte-exact KHÔNG bắt được trùng lặp với hàng ĐÃ CÓ SẴN mang
-- case gốc (dữ liệu cũ trước khi có chuẩn hoá, hoặc bất kỳ đường ghi nào trong tương lai
-- không đi qua dangKy.ts — vd một màn quản trị tạo người dùng tay). ĐO ĐƯỢC: với
-- "Boss@Corp.vn" đã có sẵn, đăng ký lại bằng "BOSS@CORP.VN" trả 201 và tạo THÊM một tenant
-- — phá vỡ đúng mục đích chống trùng lặp mà chuẩn hoá ở tầng ứng dụng định làm, và mở
-- đường giả mạo email nhìn-giống-nhau (lookalike) trên màn duyệt Admin sau này (U18).
--
-- SỬA: thay chỉ mục UNIQUE trên cột "email" bằng chỉ mục UNIQUE trên BIỂU THỨC lower(email)
-- — khớp Object.is chuẩn hoá trim+lowercase mà dangKy.ts đã dùng khi ghi (auth.ts, migration
-- này đi kèm, cũng chuẩn hoá cùng cách ở đường đọc/login — xem apps/api/src/routes/auth.ts).
-- KHÔNG đổi cột email thành lowercase sẵn (giữ nguyên case người dùng gõ để hiển thị/audit),
-- chỉ ép DUY NHẤT theo dạng chuẩn hoá.
--
-- QUYẾT ĐỊNH VỀ DỮ LIỆU TRÙNG SẴN CÓ TRONG PRODUCTION (KHÔNG kiểm chứng được từ đây — CLAUDE.md
-- nguyên tắc bằng chứng): nếu đã tồn tại ≥2 hàng nguoi_dung mà lower(email) trùng nhau,
-- `CREATE UNIQUE INDEX ... (lower(email))` bên dưới SẼ THẤT BẠI (Postgres 23505 khi build chỉ
-- mục). CHỌN THẤT BẠI TO, KHÔNG âm thầm gộp/xoá hàng nào và KHÔNG hạ chỉ mục xuống non-unique
-- để né — cả hai lựa chọn đó đều tự ý quyết định "ai giữ được tài khoản, ai mất" thay cho vận
-- hành viên, và có thể xoá nhầm audit trail/dữ liệu nghiệp vụ đã gắn vào một trong hai tenant.
-- Việc gộp 2 tenant với 2 lịch sử hóa đơn/audit riêng là quyết định NGHIỆP VỤ, không phải
-- quyết định migration tự động hoá được. Chủ động RAISE EXCEPTION với thông điệp RÕ RÀNG (kèm câu
-- lệnh dò) TRƯỚC bước tạo chỉ mục, thay vì để lộ ra lỗi 23505 chung chung của Postgres không
-- nói được là những email nào đụng nhau — cả migration nằm trong một transaction (như 0001/
-- 0009 đã ghi chú) nên fail ở bước nào cũng rollback sạch, không để lại trạng thái nửa vời.
--
-- CÂU LỆNH DÒ TRƯỚC KHI MIGRATE (chạy tay trên production TRƯỚC khi áp 0010 — CHƯA chạy vì
-- không truy cập được DB thật từ phiên làm việc này, xem báo cáo task-5b-report.md):
--   SELECT lower(email) AS email_thuong, array_agg(email) AS bien_the, array_agg(id) AS id_lien_quan, count(*) AS so_luong
--   FROM nguoi_dung GROUP BY lower(email) HAVING count(*) > 1;
-- Nếu trả về hàng nào, DỪNG — xử lý tay (đổi email hoặc gộp tenant có chủ đích) trước khi
-- migrate; đây chính là truy vấn được RAISE EXCEPTION nhắc lại bên dưới cho vận hành viên
-- không có sẵn file này trong tay.
DO $$
DECLARE
  so_nhom_trung int;
BEGIN
  SELECT count(*) INTO so_nhom_trung
  FROM (
    SELECT lower(email) FROM nguoi_dung GROUP BY lower(email) HAVING count(*) > 1
  ) trung;
  IF so_nhom_trung > 0 THEN
    RAISE EXCEPTION 'migration 0010 DỪNG: % nhóm email trùng nhau (khác hoa/thường) trong nguoi_dung — không thể tạo unique index trên lower(email). Dò danh sách bằng: SELECT lower(email), array_agg(email), array_agg(id) FROM nguoi_dung GROUP BY lower(email) HAVING count(*) > 1; rồi xử lý tay (đổi email hoặc gộp tenant) trước khi migrate lại.', so_nhom_trung;
  END IF;
END $$;--> statement-breakpoint
-- IF EXISTS (hardening — cùng idiom 0009 dùng cho DROP FUNCTION): vô hại trong thực tế vì
-- 0006 luôn chạy trước (thứ tự journal) nên chỉ mục chắc chắn tồn tại — thêm để file khớp
-- đúng cái nó tự nhận ("Idempotent" — convention dự án, xem chú thích 0006), không phải vì
-- có đường lỗi thật đang xảy ra.
DROP INDEX IF EXISTS "nguoi_dung_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "nguoi_dung_email_unique" ON "nguoi_dung" (lower("email"));

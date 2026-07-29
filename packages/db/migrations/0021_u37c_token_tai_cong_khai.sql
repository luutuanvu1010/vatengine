-- U37c — định danh CÔNG KHAI tách khỏi khóa lưu trữ, + tên khách chụp lúc tạo, + đếm lượt tải.
--
-- BỐI CẢNH: probe thật 2026-07-29 cho thấy xóa object khỏi R2 KHÔNG vô hiệu hóa bản đã nằm
-- trong cache CDN của custom domain ⇒ "Thu hồi" hứa sai tới 4 giờ. U37c chuyển đường tải qua
-- Worker để thu hồi trở thành SỰ THẬT TRONG DB, không phụ thuộc cache hay việc xóa file.
--
-- THỨ TỰ QUAN TRỌNG: bảng đã có dữ liệu thật (2 hàng, đo 2026-07-29) nên KHÔNG thể thêm cột
-- NOT NULL trần — phải thêm cột cho phép NULL, backfill, rồi mới siết NOT NULL.

ALTER TABLE "goi_chia_se" ADD COLUMN "token" text;
--> statement-breakpoint
ALTER TABLE "goi_chia_se" ADD COLUMN "nmten" text;
--> statement-breakpoint
ALTER TABLE "goi_chia_se" ADD COLUMN "so_luot_tai" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "goi_chia_se" ADD COLUMN "lan_tai_cuoi" timestamptz;

--> statement-breakpoint
-- Backfill: lấy lại chính phần ngẫu nhiên đã có trong `khoa_r2`
-- (`goi-hoa-don/<YYYY-MM>/<token>.zip`) thay vì sinh giá trị mới.
--
-- Vì sao dùng lại: phần đó vốn đã là 26 ký tự base32 ≈ 130 bit từ cùng bộ sinh, và `khoa_r2`
-- đã UNIQUE toàn cục nên token dẫn xuất cũng duy nhất. Sinh mới bằng SQL sẽ phải dựng một bộ
-- sinh ngẫu nhiên THỨ HAI ngay trong migration — đúng thứ "nguồn sự thật thứ hai" cần tránh,
-- lại còn yếu hơn `crypto.getRandomValues`.
UPDATE "goi_chia_se"
SET "token" = regexp_replace("khoa_r2", '^.*/([^/]+)\.zip$', '\1')
WHERE "token" IS NULL;

--> statement-breakpoint
-- Chỉ siết được SAU khi backfill. Nếu còn hàng nào NULL, câu này sẽ ném lỗi và cả migration
-- rollback — đúng mong muốn: thà dừng còn hơn để lại hàng không có định danh công khai.
ALTER TABLE "goi_chia_se" ALTER COLUMN "token" SET NOT NULL;

--> statement-breakpoint
-- AN TOÀN, không phải gọn gàng: trùng token nghĩa là một liên kết công khai mở ra gói của
-- tenant khác. Duy nhất TOÀN CỤC, không theo tenant.
ALTER TABLE "goi_chia_se" ADD CONSTRAINT "goi_chia_se_token_unique" UNIQUE ("token");

--> statement-breakpoint
-- Tra cứu đường tải công khai đi theo token; không có index thì mỗi lượt tải là một seq scan.
CREATE INDEX IF NOT EXISTS "goi_chia_se_token_idx" ON "goi_chia_se" ("token");

-- KHÔNG cần khối GRANT ở đây: `0020` đã cấp SELECT/INSERT/UPDATE ở mức BẢNG cho `vat_app`,
-- và quyền mức bảng của PostgreSQL phủ luôn cột thêm sau. Vẫn phải hậu kiểm bằng
-- `node scripts/hau-kiem-bang.mjs goi_chia_se` trên DB THẬT — không suy luận thay cho đo.
-- Vẫn KHÔNG cấp DELETE: thu hồi = đổi trạng thái, giữ hàng để còn vết điều tra.

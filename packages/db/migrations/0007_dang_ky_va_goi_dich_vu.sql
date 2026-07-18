-- U17a — Nền gói dịch vụ + cấu hình ngưỡng (spec: docs/plans/U17-plan.md §3.1, QĐ-5..9).
--
-- THỨ TỰ CÂU LỆNH LÀ CÓ CHỦ Ý — KHÔNG ĐẢO:
--   CREATE TABLE → INSERT seed → ENABLE RLS → FORCE RLS → CREATE POLICY → GRANT.
-- Vì sao: FORCE ROW LEVEL SECURITY chi phối CẢ owner. Nếu bật FORCE trước khi seed, câu
-- INSERT seed sẽ bị chính policy chặn (ta cố ý KHÔNG tạo policy nào cho INSERT) và
-- migration hỏng. Đây là hệ quả trực tiếp của bài học FORCE RLS ở 0000/0001.
--
-- Vì sao làm TAY: drizzle-kit chỉ phát ENABLE RLS cho bảng CÓ khai báo policy (bằng
-- chứng 0000: đúng 7 bảng có tenantIsolationPolicy mới được bật). Ba bảng dưới đây là
-- bảng TOÀN CỤC (không tenant_id) nên drizzle sẽ bỏ qua — không làm tay thì chúng thành
-- ngoại lệ RLS đầu tiên của dự án.
--
-- Idempotent (áp lại không lỗi) theo convention 0002/0006.

CREATE TABLE IF NOT EXISTS "goi_dich_vu" (
  "ma" text PRIMARY KEY,
  "ten" text NOT NULL,
  "so_mst_toi_da" integer NOT NULL DEFAULT 1,
  "so_hoa_don_thang" integer,
  "cho_tai_khoan_con" boolean NOT NULL DEFAULT false,
  "gh_invoices_moi_phut" integer NOT NULL DEFAULT 120,
  "gh_exports_moi_phut" integer NOT NULL DEFAULT 20,
  "gh_reconcile_moi_phut" integer NOT NULL DEFAULT 20,
  "cap_nhat_luc" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

-- SEED phải chạy TRƯỚC khi bật FORCE RLS (xem chú thích thứ tự ở đầu file).
-- v1.0 chỉ có gói free; bảng cố ý linh hoạt để thêm gói trả phí không cần đổi lược đồ.
-- Ngưỡng gh_* là số ĐỀ XUẤT CHƯA KIỂM CHỨNG (U17-plan §3.6) — phải đo bằng số thật của
-- tenant production rồi chỉnh qua bảng điều khiển, KHÔNG cần deploy lại.
INSERT INTO "goi_dich_vu" ("ma", "ten", "so_mst_toi_da", "so_hoa_don_thang", "cho_tai_khoan_con")
VALUES ('free', 'Miễn phí', 1, NULL, false)
ON CONFLICT ("ma") DO NOTHING;--> statement-breakpoint

ALTER TABLE "goi_dich_vu" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goi_dich_vu" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- CHỈ policy SELECT. Cố ý KHÔNG tạo policy INSERT/UPDATE/DELETE. ĐÃ ĐO THẬT (không suy
-- đoán — xem goiDichVu.test.ts) hành vi với role có GRANT ghi nhưng KHÔNG có BYPASSRLS
-- (vd. role app kết nối Hyperdrive, xem app-role.sql):
--   * INSERT bị RLS chặn và NÉM LỖI "new row violates row-level security policy".
--   * UPDATE/DELETE KHÔNG ném lỗi — chạy "thành công" nhưng ảnh hưởng 0 HÀNG (WHERE không
--     khớp hàng nào vì không có policy nào cho phép nhìn thấy hàng để sửa/xoá). Code nào
--     trông chờ exception cho hai lệnh này sẽ bị lừa: phải kiểm rowCount, không phải
--     try/catch. U18 (đường ghi Admin) PHẢI biết điều này khi viết code ghi + kiểm kết quả.
--   * "Chặn cả owner" là SAI ở MỌI môi trường hiện có: FORCE ROW LEVEL SECURITY không chi
--     phối role có BYPASSRLS/superuser. PGlite (test) chạy dưới role `postgres` (superuser
--     → tự bypass); trên Neon, `neondb_owner` CÓ BYPASSRLS (xem app-role.sql:9) — cả hai
--     nơi INSERT/UPDATE bằng owner đều THÀNH CÔNG và đổi được dữ liệu thật.
--   Vì vậy đường ghi hợp lệ của Admin (U18) sẽ đi qua hàm SECURITY DEFINER do một role
--   BYPASSRLS sở hữu — đúng mẫu auth_lookup_user (0001). LƯU Ý cho U18: hàm SECURITY
--   DEFINER do role KHÔNG-BYPASSRLS sở hữu VẪN bị FORCE chặn (0001:4-8 ghi rõ).
DROP POLICY IF EXISTS "goi_dich_vu_doc_moi_nguoi" ON "goi_dich_vu";--> statement-breakpoint
CREATE POLICY "goi_dich_vu_doc_moi_nguoi" ON "goi_dich_vu" FOR SELECT USING (true);--> statement-breakpoint

-- GRANT TƯỜNG MINH — bắt buộc, dễ quên: app-role.sql:28 là `GRANT ... ON ALL TABLES`
-- chạy MỘT LẦN và toàn repo KHÔNG có `ALTER DEFAULT PRIVILEGES` (đã grep, = 0). Bảng tạo
-- ở migration này KHÔNG thừa hưởng quyền nào ⇒ quên GRANT thì API lỗi `permission denied`
-- và lỗi chỉ lộ ra SAU khi deploy production.
--
-- Vì sao TO PUBLIC (mở đọc cho mọi role, không riêng role app): bảng này KHÔNG chứa dữ
-- liệu của bất kỳ tenant nào — chỉ là định nghĩa gói dịch vụ toàn cục (tên gói, hạn mức).
-- Không có trục tenant ⇒ không có bề mặt rò rỉ dữ liệu chéo giữa các doanh nghiệp khách
-- hàng khi mở đọc rộng. (Đây KHÔNG suy ra từ việc đường ghi bị RLS chặn — an toàn của
-- đường GHI không biện minh cho việc mở đường ĐỌC; lý do đứng độc lập như trên.)
GRANT SELECT ON "goi_dich_vu" TO PUBLIC;

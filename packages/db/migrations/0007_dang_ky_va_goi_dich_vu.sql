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

-- CHỈ policy SELECT. Cố ý KHÔNG tạo policy INSERT/UPDATE/DELETE ⇒ mọi đường ghi bị chặn
-- ở tầng RLS, kể cả owner. Đường ghi của Admin (U18) sẽ đi qua hàm SECURITY DEFINER do
-- một role BYPASSRLS sở hữu — đúng mẫu auth_lookup_user (0001). LƯU Ý cho U18: hàm
-- SECURITY DEFINER do role KHÔNG-BYPASSRLS sở hữu VẪN bị FORCE chặn (0001:4-8 ghi rõ).
DROP POLICY IF EXISTS "goi_dich_vu_doc_moi_nguoi" ON "goi_dich_vu";--> statement-breakpoint
CREATE POLICY "goi_dich_vu_doc_moi_nguoi" ON "goi_dich_vu" FOR SELECT USING (true);--> statement-breakpoint

-- GRANT TƯỜNG MINH — bắt buộc, dễ quên: app-role.sql:28 là `GRANT ... ON ALL TABLES`
-- chạy MỘT LẦN và toàn repo KHÔNG có `ALTER DEFAULT PRIVILEGES` (đã grep, = 0). Bảng tạo
-- ở migration này KHÔNG thừa hưởng quyền nào ⇒ quên GRANT thì API lỗi `permission denied`
-- và lỗi chỉ lộ ra SAU khi deploy production.
GRANT SELECT ON "goi_dich_vu" TO PUBLIC;

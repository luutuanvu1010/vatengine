CREATE TABLE "tep_hoa_don_goc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hoa_don_id" uuid NOT NULL,
	"khoa_xml" text,
	"khoa_html" text,
	"kich_thuoc_xml" integer,
	"kich_thuoc_html" integer,
	"trang_thai" text NOT NULL,
	"ma_loi" text,
	"tai_luc" timestamp with time zone,
	"ngay_tao" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tep_hoa_don_goc_tenant_hoa_don_unique" UNIQUE("tenant_id","hoa_don_id")
);
--> statement-breakpoint
ALTER TABLE "tep_hoa_don_goc" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tep_hoa_don_goc" ADD CONSTRAINT "tep_hoa_don_goc_hoa_don_fk" FOREIGN KEY ("tenant_id","hoa_don_id") REFERENCES "public"."hoa_don"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tep_hoa_don_goc_tenant_trangthai_idx" ON "tep_hoa_don_goc" USING btree ("tenant_id","trang_thai");--> statement-breakpoint
CREATE POLICY "tep_hoa_don_goc_tenant_isolation" ON "tep_hoa_don_goc" AS PERMISSIVE FOR ALL TO public USING ("tep_hoa_don_goc"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tep_hoa_don_goc"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- ⬇⬇ HAI KHỐI DƯỚI ĐÂY drizzle-kit KHÔNG SINH — phải viết tay, và cả hai đều đã từng
-- gây sự cố production khi bị quên.

-- (1) FORCE: drizzle-kit chỉ phát ENABLE, mà ENABLE chỉ chi phối role KHÔNG-owner.
-- Thiếu FORCE thì role SỞ HỮU bảng bỏ qua policy và nhìn xuyên tenant — đúng kịch bản
-- mặc định của Neon/Supabase (.claude/rules/multi-tenant.md). Cùng khuôn 0017:36-39.
ALTER TABLE "tep_hoa_don_goc" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- (2) GRANT: `provisioning/app-role.sql` chạy `GRANT … ON ALL TABLES` đúng MỘT LẦN
-- (2026-07-14) và repo KHÔNG có `ALTER DEFAULT PRIVILEGES`, nên MỌI bảng tạo sau mốc đó
-- không thừa hưởng quyền nào. Cảnh báo này đã viết ở 0007:72-75 nhưng vẫn bị quên HAI
-- lần — 0008 (`dong_bo_that_bai`: sổ dead-letter câm 8 ngày) và 0017 (`bo_dem_phien_ban`:
-- 39 phiên đồng bộ failed/24h) — và cả hai lần chỉ lộ ra SAU khi deploy production, vì
-- test chạy trên PGlite với role owner. Đây là lần thứ ba, không được lặp lại.
--
-- Phạm vi: SELECT, INSERT, UPDATE — KHÔNG DELETE. Bảng này là sổ theo dõi hồ sơ gốc
-- BẤT BIẾN; job nền chỉ chèn mới hoặc cập nhật trạng thái, không nghiệp vụ nào xóa hàng
-- (hàng chỉ biến mất theo CASCADE khi hóa đơn bị xóa, do DB làm, không cần quyền app).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'vat_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "tep_hoa_don_goc" TO vat_app;
  ELSE
    RAISE WARNING 'U37a (0019): role "vat_app" không tồn tại — BỎ QUA GRANT cho tep_hoa_don_goc. Nếu môi trường này CÓ role app dùng tên khác (xem packages/db/provisioning/app-role.sql), bảng này SẼ báo permission denied cho tới khi cấp tay: GRANT SELECT, INSERT, UPDATE ON "tep_hoa_don_goc" TO <ten_role_app>;';
  END IF;
END $$;--> statement-breakpoint
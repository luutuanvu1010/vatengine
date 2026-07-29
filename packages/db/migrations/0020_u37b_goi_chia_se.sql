CREATE TABLE "goi_chia_se" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"khoa_r2" text NOT NULL,
	"nmmst" text NOT NULL,
	"tu_ngay" date NOT NULL,
	"den_ngay" date NOT NULL,
	"so_hoa_don" integer DEFAULT 0 NOT NULL,
	"kich_thuoc" integer,
	"nguoi_tao" uuid,
	"tao_luc" timestamp with time zone DEFAULT now() NOT NULL,
	"het_han_luc" timestamp with time zone NOT NULL,
	"trang_thai" text NOT NULL,
	"ma_loi" text,
	CONSTRAINT "goi_chia_se_khoa_r2_unique" UNIQUE("khoa_r2")
);
--> statement-breakpoint
ALTER TABLE "goi_chia_se" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goi_chia_se" ADD CONSTRAINT "goi_chia_se_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goi_chia_se" ADD CONSTRAINT "goi_chia_se_nguoi_tao_fk" FOREIGN KEY ("nguoi_tao") REFERENCES "public"."nguoi_dung"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goi_chia_se_tenant_taoluc_idx" ON "goi_chia_se" USING btree ("tenant_id","tao_luc");--> statement-breakpoint
CREATE POLICY "goi_chia_se_tenant_isolation" ON "goi_chia_se" AS PERMISSIVE FOR ALL TO public USING ("goi_chia_se"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("goi_chia_se"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- ⬇⬇ HAI KHỐI DƯỚI ĐÂY drizzle-kit KHÔNG SINH — phải viết tay, cả hai đều đã gây sự cố
-- production khi bị quên. Khuôn: 0019_u37a_tep_hoa_don_goc.sql.

-- (1) FORCE: drizzle-kit chỉ phát ENABLE, mà ENABLE không chi phối role SỞ HỮU bảng.
-- Thiếu FORCE thì owner nhìn xuyên tenant — mặc định phổ biến của Neon/Supabase
-- (.claude/rules/multi-tenant.md). Với bảng này hậu quả nặng hơn `tep_hoa_don_goc`: mỗi
-- hàng trỏ tới một file CÔNG KHAI, lộ hàng là lộ luôn đường tới dữ liệu của tenant khác.
ALTER TABLE "goi_chia_se" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- (2) GRANT: `provisioning/app-role.sql` chạy `GRANT … ON ALL TABLES` đúng MỘT LẦN
-- (2026-07-14) và repo KHÔNG có `ALTER DEFAULT PRIVILEGES`, nên mọi bảng tạo sau mốc đó
-- không thừa hưởng quyền nào. Đã quên HAI lần — 0008 (`dong_bo_that_bai`: sổ dead-letter
-- câm 8 ngày) và 0017 (`bo_dem_phien_ban`: 39 phiên đồng bộ failed/24h) — và cả hai lần
-- chỉ lộ ra SAU khi deploy, vì test chạy trên PGlite với role owner.
--
-- Phạm vi: SELECT, INSERT, UPDATE — KHÔNG DELETE. THU HỒI một gói = xóa object trên R2 +
-- đổi `trang_thai` thành 'da_thu_hoi', KHÔNG xóa hàng: phải giữ vết "ai đã phát hành link
-- nào, lúc nào" — đúng thứ cần tra khi có sự cố lộ dữ liệu (NĐ 13/2023).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'vat_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "goi_chia_se" TO vat_app;
  ELSE
    RAISE WARNING 'U37b (0020): role "vat_app" không tồn tại — BỎ QUA GRANT cho goi_chia_se. Nếu môi trường này CÓ role app dùng tên khác (xem packages/db/provisioning/app-role.sql), bảng này SẼ báo permission denied cho tới khi cấp tay: GRANT SELECT, INSERT, UPDATE ON "goi_chia_se" TO <ten_role_app>;';
  END IF;
END $$;--> statement-breakpoint

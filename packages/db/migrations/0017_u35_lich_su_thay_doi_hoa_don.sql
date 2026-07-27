CREATE TABLE "bo_dem_phien_ban" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"gia_tri" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bo_dem_phien_ban" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lich_su_thay_doi_hoa_don" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hoa_don_id" uuid NOT NULL,
	"truong" text NOT NULL,
	"gia_tri_cu" integer,
	"gia_tri_moi" integer,
	"lan_dong_bo_id" uuid,
	"phat_hien_luc" timestamp with time zone DEFAULT now() NOT NULL,
	"da_doc" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lich_su_thay_doi_hoa_don_natural_key" UNIQUE("hoa_don_id","truong","gia_tri_moi","lan_dong_bo_id")
);
--> statement-breakpoint
ALTER TABLE "lich_su_thay_doi_hoa_don" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lan_dong_bo" ADD COLUMN "so_phien_ban" integer;--> statement-breakpoint
-- THỨ TỰ QUAN TRỌNG (sửa theo lỗi Postgres 42830 "no unique constraint matching given
-- keys" phát hiện qua test tích hợp thật): UNIQUE(tenant_id, id) trên hoa_don/lan_dong_bo
-- PHẢI tồn tại TRƯỚC khi thêm FK composite bên dưới tham chiếu tới chúng — drizzle-kit
-- sinh thứ tự statement theo tên bảng (bo_dem_phien_ban, lich_su_thay_doi_hoa_don) trước
-- các ALTER TABLE hoa_don/lan_dong_bo, không theo phụ thuộc FK. Di chuyển tay lên trước.
ALTER TABLE "hoa_don" ADD CONSTRAINT "hoa_don_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "lan_dong_bo" ADD CONSTRAINT "lan_dong_bo_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "bo_dem_phien_ban" ADD CONSTRAINT "bo_dem_phien_ban_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lich_su_thay_doi_hoa_don" ADD CONSTRAINT "lich_su_thay_doi_hoa_don_hoa_don_fk" FOREIGN KEY ("tenant_id","hoa_don_id") REFERENCES "public"."hoa_don"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lich_su_thay_doi_hoa_don" ADD CONSTRAINT "lich_su_thay_doi_hoa_don_lan_dong_bo_fk" FOREIGN KEY ("tenant_id","lan_dong_bo_id") REFERENCES "public"."lan_dong_bo"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lich_su_thay_doi_hoa_don_badge_idx" ON "lich_su_thay_doi_hoa_don" USING btree ("tenant_id","da_doc","phat_hien_luc");--> statement-breakpoint
CREATE POLICY "bo_dem_phien_ban_tenant_isolation" ON "bo_dem_phien_ban" AS PERMISSIVE FOR ALL TO public USING ("bo_dem_phien_ban"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("bo_dem_phien_ban"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "lich_su_thay_doi_hoa_don_tenant_isolation" ON "lich_su_thay_doi_hoa_don" AS PERMISSIVE FOR ALL TO public USING ("lich_su_thay_doi_hoa_don"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("lich_su_thay_doi_hoa_don"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- Bổ sung tay (mẫu 0000/0004/…): drizzle-kit chỉ phát ENABLE ROW LEVEL SECURITY, KHÔNG
-- phát FORCE — ENABLE chỉ chi phối role KHÔNG-owner. Thiếu FORCE, role sở hữu bảng (mặc
-- định Neon/Supabase) bỏ qua RLS hoàn toàn. GIỮ khi regenerate. multi-tenant.md.
ALTER TABLE "bo_dem_phien_ban" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lich_su_thay_doi_hoa_don" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- U35 (A4) — trigger DB bắt thay đổi ttxly/tthai Ở TẦNG GẦN DỮ LIỆU NHẤT, phủ MỌI đường
-- ghi hoa_don (UPDATE trực tiếp của upsertBatch VÀ INSERT…ON CONFLICT DO UPDATE của đường
-- race — Postgres coi nhánh DO UPDATE là một UPDATE thật, trigger AFTER UPDATE kích hoạt
-- cho cả hai). AFTER UPDATE (không phải AFTER INSERT) ⇒ hóa đơn MỚI không sinh lịch sử.
--
-- `v_lan_dong_bo_id` đọc biến phiên transaction-local `app.lan_dong_bo_id` (đặt bởi
-- `withTenant` mở rộng, packages/db/src/tenantContext.ts) — CÙNG khuôn guard
-- `nullif(current_setting(...), '')::uuid` đã dùng cho `app.tenant_id` ở _rls.ts: chuỗi
-- rỗng/chưa đặt hóa NULL trước khi ép ::uuid, tránh lỗi 22P02 ở MỌI UPDATE hoa_don ngoài
-- đường đồng bộ (vd sửa tay qua công cụ quản trị) — review S1. Biến chưa đặt ⇒ vẫn ghi
-- lịch sử, chỉ NULL cột lan_dong_bo_id (không ném lỗi).
--
-- `ON CONFLICT DO NOTHING` BẮT BUỘC (review B3): redelivery Queue (cùng lan_dong_bo_id)
-- ghi lại đúng khóa tự nhiên (hoa_don_id, truong, gia_tri_moi, lan_dong_bo_id) — thiếu
-- mệnh đề này sẽ RAISE vi phạm unique → rollback CẢ CHUNK → sync failed oan.
CREATE OR REPLACE FUNCTION hoa_don_ghi_lich_su_thay_doi()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_lan_dong_bo_id uuid := nullif(current_setting('app.lan_dong_bo_id', true), '')::uuid;
BEGIN
  IF OLD.ttxly IS DISTINCT FROM NEW.ttxly THEN
    INSERT INTO lich_su_thay_doi_hoa_don
      (tenant_id, hoa_don_id, truong, gia_tri_cu, gia_tri_moi, lan_dong_bo_id)
    VALUES
      (NEW.tenant_id, NEW.id, 'ttxly', OLD.ttxly, NEW.ttxly, v_lan_dong_bo_id)
    ON CONFLICT (hoa_don_id, truong, gia_tri_moi, lan_dong_bo_id) DO NOTHING;
  END IF;
  IF OLD.tthai IS DISTINCT FROM NEW.tthai THEN
    INSERT INTO lich_su_thay_doi_hoa_don
      (tenant_id, hoa_don_id, truong, gia_tri_cu, gia_tri_moi, lan_dong_bo_id)
    VALUES
      (NEW.tenant_id, NEW.id, 'tthai', OLD.tthai, NEW.tthai, v_lan_dong_bo_id)
    ON CONFLICT (hoa_don_id, truong, gia_tri_moi, lan_dong_bo_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS hoa_don_ghi_lich_su_thay_doi_trigger ON "hoa_don";--> statement-breakpoint
CREATE TRIGGER hoa_don_ghi_lich_su_thay_doi_trigger
AFTER UPDATE ON "hoa_don"
FOR EACH ROW
EXECUTE FUNCTION hoa_don_ghi_lich_su_thay_doi();
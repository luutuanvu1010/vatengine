CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hanh_dong" text NOT NULL,
	"doi_tuong" text,
	"chi_tiet" jsonb,
	"tao_luc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dong_hang_hoa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hoadon_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stt" integer,
	"ten" text,
	"dvtinh" text,
	"sluong" numeric,
	"dgia" numeric,
	"thtien" numeric,
	"ltsuat" text,
	"tsuat" numeric,
	"tsuat_tien" numeric,
	"raw_json" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dong_hang_hoa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hoa_don" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nbmst" text NOT NULL,
	"nbten" text,
	"nmmst" text,
	"nmten" text,
	"khmshdon" text NOT NULL,
	"khhdon" text NOT NULL,
	"shdon" text NOT NULL,
	"tdlap" timestamp with time zone NOT NULL,
	"ncnhat" timestamp with time zone,
	"tgtcthue" numeric,
	"tgtthue" numeric,
	"tgtttbso" numeric,
	"ttcktmai" numeric,
	"dvtte" text,
	"tgia" numeric,
	"ttxly" integer,
	"tthai" integer,
	"chieu" text NOT NULL,
	"nguon" text NOT NULL,
	"raw_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hoa_don_natural_key" UNIQUE("tenant_id","nbmst","khmshdon","khhdon","shdon","tdlap")
);
--> statement-breakpoint
ALTER TABLE "hoa_don" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lan_dong_bo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"taikhoan_id" uuid NOT NULL,
	"chieu" text NOT NULL,
	"tu_ngay" timestamp with time zone NOT NULL,
	"den_ngay" timestamp with time zone NOT NULL,
	"so_hd_moi" integer DEFAULT 0 NOT NULL,
	"so_hd_cap_nhat" integer DEFAULT 0 NOT NULL,
	"trang_thai" text DEFAULT 'running' NOT NULL,
	"thong_diep_loi" text,
	"bat_dau" timestamp with time zone DEFAULT now() NOT NULL,
	"ket_thuc" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lan_dong_bo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nguoi_dung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"vai_tro" text DEFAULT 'member' NOT NULL,
	"ngay_tao" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nguoi_dung" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tai_khoan_thue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"username" text NOT NULL,
	"loai" text DEFAULT 'chinh' NOT NULL,
	"secret_ref" text,
	"token_hien_tai" text,
	"token_het_han" timestamp with time zone,
	"ngay_tao" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tai_khoan_thue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ten" text NOT NULL,
	"mst" text NOT NULL,
	"trang_thai" text DEFAULT 'active' NOT NULL,
	"goi_dich_vu" text,
	"ngay_tao" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dong_hang_hoa" ADD CONSTRAINT "dong_hang_hoa_hoadon_id_hoa_don_id_fk" FOREIGN KEY ("hoadon_id") REFERENCES "public"."hoa_don"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dong_hang_hoa" ADD CONSTRAINT "dong_hang_hoa_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hoa_don" ADD CONSTRAINT "hoa_don_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lan_dong_bo" ADD CONSTRAINT "lan_dong_bo_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lan_dong_bo" ADD CONSTRAINT "lan_dong_bo_taikhoan_id_tai_khoan_thue_id_fk" FOREIGN KEY ("taikhoan_id") REFERENCES "public"."tai_khoan_thue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nguoi_dung" ADD CONSTRAINT "nguoi_dung_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tai_khoan_thue" ADD CONSTRAINT "tai_khoan_thue_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dong_hang_hoa_hoadon_idx" ON "dong_hang_hoa" USING btree ("hoadon_id");--> statement-breakpoint
CREATE INDEX "hoa_don_tenant_idx" ON "hoa_don" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO public USING ("audit_log"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("audit_log"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "dong_hang_hoa_tenant_isolation" ON "dong_hang_hoa" AS PERMISSIVE FOR ALL TO public USING ("dong_hang_hoa"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("dong_hang_hoa"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hoa_don_tenant_isolation" ON "hoa_don" AS PERMISSIVE FOR ALL TO public USING ("hoa_don"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("hoa_don"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "lan_dong_bo_tenant_isolation" ON "lan_dong_bo" AS PERMISSIVE FOR ALL TO public USING ("lan_dong_bo"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("lan_dong_bo"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "nguoi_dung_tenant_isolation" ON "nguoi_dung" AS PERMISSIVE FOR ALL TO public USING ("nguoi_dung"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("nguoi_dung"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tai_khoan_thue_tenant_isolation" ON "tai_khoan_thue" AS PERMISSIVE FOR ALL TO public USING ("tai_khoan_thue"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tai_khoan_thue"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenants_tenant_isolation" ON "tenants" AS PERMISSIVE FOR ALL TO public USING ("tenants"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenants"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- Bổ sung tay sau review U4 (security-reviewer + dod-auditor): FORCE ROW LEVEL SECURITY
-- để RLS ràng buộc CẢ table owner, không chỉ role thường. ENABLE (drizzle-kit tự sinh
-- ở trên) chỉ chi phối role KHÔNG-owner; nếu production kết nối Hyperdrive bằng đúng
-- role sở hữu bảng (mặc định phổ biến của Neon/Supabase) mà thiếu FORCE ⇒ RLS bị vô
-- hiệu âm thầm. drizzle-kit KHÔNG phát FORCE từ schema → thêm tay, GIỮ khi regenerate.
-- LƯU Ý VẬN HÀNH: SUPERUSER vẫn bỏ qua RLS kể cả FORCE ⇒ role app production (U6,
-- Hyperdrive) KHÔNG được là superuser. Xem .claude/rules/multi-tenant.md.
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tai_khoan_thue" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hoa_don" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dong_hang_hoa" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lan_dong_bo" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nguoi_dung" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
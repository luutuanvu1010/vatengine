CREATE TABLE IF NOT EXISTS "dong_bo_that_bai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"loai" text NOT NULL,
	"payload" jsonb NOT NULL,
	"ly_do" text NOT NULL,
	"so_lan" integer,
	"trang_thai" text NOT NULL DEFAULT 'da_dau',
	"tao_luc" timestamp with time zone DEFAULT now() NOT NULL,
	"phat_lai_luc" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dong_bo_that_bai" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dong_bo_that_bai" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "dong_bo_that_bai_tenant_isolation" ON "dong_bo_that_bai";--> statement-breakpoint
CREATE POLICY "dong_bo_that_bai_tenant_isolation" ON "dong_bo_that_bai"
	AS PERMISSIVE FOR ALL TO public
	USING ("dong_bo_that_bai"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
	WITH CHECK ("dong_bo_that_bai"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dong_bo_that_bai_tenant_trangthai_idx"
	ON "dong_bo_that_bai" ("tenant_id", "trang_thai", "tao_luc" DESC);

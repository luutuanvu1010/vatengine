-- U-a — hồ sơ tenant sửa được: ghi chú người dùng + loại bản quyền (hệ thống cấp).
-- Idempotent (IF NOT EXISTS) theo convention migration của dự án — áp lại không lỗi.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "ghi_chu" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "ban_quyen" text DEFAULT 'Mặc định' NOT NULL;

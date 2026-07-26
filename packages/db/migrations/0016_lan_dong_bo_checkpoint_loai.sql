ALTER TABLE "lan_dong_bo" ADD COLUMN "checkpoint" jsonb;--> statement-breakpoint
ALTER TABLE "lan_dong_bo" ADD COLUMN "loai" text DEFAULT 'sync' NOT NULL;

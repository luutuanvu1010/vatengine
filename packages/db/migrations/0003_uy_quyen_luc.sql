-- U14 — mốc ủy quyền tenant (NĐ 13/2023) cho tài khoản thuế. null = chưa ủy quyền.
-- Idempotent: IF NOT EXISTS để áp lại không lỗi.
ALTER TABLE "tai_khoan_thue" ADD COLUMN IF NOT EXISTS "uy_quyen_luc" timestamp with time zone;

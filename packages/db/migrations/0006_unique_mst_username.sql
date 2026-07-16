-- U23-D (D1) — ràng buộc duy nhất: 1 MST gốc ↔ 1 tenant (chống 2 doanh nghiệp trùng MST);
-- chống trùng tài khoản thuế trong MỘT tenant. Nền tài khoản con vẫn hợp lệ: cùng tenant
-- nhưng username khác nhau (vd "abcd" và "abcd-001") không vi phạm. Idempotent
-- (CREATE UNIQUE INDEX IF NOT EXISTS) theo convention dự án — áp lại không lỗi (deploy.md).
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_mst_unique" ON "tenants" ("mst");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tai_khoan_thue_tenant_username_unique" ON "tai_khoan_thue" ("tenant_id","username");

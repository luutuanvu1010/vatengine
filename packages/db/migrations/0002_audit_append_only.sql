-- U12 — audit_log BẤT BIẾN (append-only). security.md: "Ghi audit log cho: đăng nhập
-- thuế …; Audit log không được ghi đè, chỉ append."
--
-- CƠ CHẾ: trigger BEFORE UPDATE OR DELETE ném exception. Vì sao trigger, không chỉ
-- REVOKE quyền bảng: REVOKE phụ thuộc role app cụ thể (tên role provider-specific,
-- CHƯA KIỂM CHỨNG trên DB thật) và KHÔNG chi phối table owner — hệt bài toán FORCE RLS
-- ở U4. Trigger chặn CẢ owner/superuser → bảo đảm bất biến độc lập cách kết nối.
--
-- Idempotent (áp lại migration không lỗi): CREATE OR REPLACE + DROP IF EXISTS trigger.
CREATE OR REPLACE FUNCTION audit_log_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log là append-only: không được % (security.md)', TG_OP;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_immutable ON "audit_log";--> statement-breakpoint
CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW
EXECUTE FUNCTION audit_log_no_mutate();--> statement-breakpoint
-- TRUNCATE là lệnh CẤP CÂU LỆNH riêng → trigger row-level ở trên KHÔNG kích hoạt. Thêm
-- trigger STATEMENT-level chặn TRUNCATE, nếu không owner/role có DDL có thể xóa sạch
-- audit tức thời (phát hiện Medium từ security-reviewer 2026-07-14).
DROP TRIGGER IF EXISTS audit_log_no_truncate ON "audit_log";--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
BEFORE TRUNCATE ON "audit_log"
FOR EACH STATEMENT
EXECUTE FUNCTION audit_log_no_mutate();--> statement-breakpoint
-- PHÒNG THỦ CHIỀU SÂU (quyền bảng): role app KHÔNG cần UPDATE/DELETE/TRUNCATE trên
-- audit_log. REVOKE FROM PUBLIC theo mẫu least-privilege của 0001 (từ chối mặc định).
-- ĐIỀU KIỆN TIÊN QUYẾT PRODUCTION (CHƯA KIỂM CHỨNG trên DB thật): khi provision role
-- app, chỉ `GRANT SELECT, INSERT ON audit_log TO <role_app>;` — KHÔNG cấp UPDATE/DELETE/TRUNCATE.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM PUBLIC;

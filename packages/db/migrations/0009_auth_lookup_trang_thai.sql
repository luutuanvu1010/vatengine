-- U17b (Task 3) — auth_lookup_user() trả thêm tenant_trang_thai để Task 4 chặn login
-- của tenant chưa duyệt (trạng thái `cho_duyet`).
--
-- VÌ SAO PHẢI DROP + CREATE (không CREATE OR REPLACE): các cột trong RETURNS TABLE là
-- OUT parameter của hàm; Postgres CHẶN đổi danh sách này qua CREATE OR REPLACE — lỗi
-- 42P13 "cannot change return type of existing function". KIỂM CHỨNG 2026-07-20 (đơn vị
-- này): thử CREATE OR REPLACE FUNCTION auth_lookup_user(...) với RETURNS TABLE thêm cột
-- tenant_trang_thai qua PGlite (packages/db/test/integration) → tái lập đúng lỗi 42P13
-- "cannot change return type of existing function". Phải DROP hàm cũ rồi CREATE lại với
-- danh sách cột mới.
--
-- HỆ QUẢ CỦA DROP (khác CREATE OR REPLACE): DROP FUNCTION xoá SẠCH mọi quyền gắn TRÊN
-- HÀM — kể cả GRANT EXECUTE cho `vat_app`, role Hyperdrive production được cấp NGOÀI
-- lịch sử migration (packages/db/provisioning/app-role.sql, chạy tay một lần lúc
-- provision). Không khôi phục lại trong chính migration này ⇒ MỌI login production hỏng
-- ngay sau khi migrate (permission denied). Vì vậy migration này KHÔNG chỉ tạo lại hàm mà
-- còn lặp lại TOÀN BỘ nghi thức ownership + least-privilege của 0001, và bổ sung bước tự
-- cấp lại EXECUTE cho vat_app — guard theo đúng idiom "IF EXISTS pg_roles" mà 0001 dùng
-- cho CREATE ROLE, để không vỡ ở dev/CI/PGlite (nơi vat_app không tồn tại).
--
-- Owner sau DROP+CREATE KHÔNG còn là auth_lookup nữa (thuộc CURRENT_USER — role migrate
-- vừa tạo hàm) — giả định "CREATE OR REPLACE giữ nguyên owner nên khỏi lặp nghi thức" của
-- bản nháp trước SAI ngay từ tiền đề vì không còn CREATE OR REPLACE. Phải trả owner về
-- auth_lookup (NOLOGIN BYPASSRLS, xem 0001) bằng đúng các bước 0001 đã dùng.

-- Bước 1: role migrate tạm làm THÀNH VIÊN auth_lookup. Cần cho: (a) DROP hàm hiện đang
-- do auth_lookup sở hữu — Postgres cho phép DROP nếu current_user có đặc quyền của owner
-- qua membership, không cần SET ROLE tường minh (đúng cơ chế 0001 đã dùng cho ALTER
-- OWNER); (b) ALTER OWNER + REVOKE FROM PUBLIC bên dưới; (c) SET ROLE ở Bước 6.
GRANT auth_lookup TO CURRENT_USER;--> statement-breakpoint
-- IF EXISTS (hardening — review 2026-07-20): 0001 tự nhận "Idempotent" nhưng DROP gốc
-- không có IF EXISTS. Vô hại trong thực tế (Drizzle không chạy lại migration đã áp; nếu lỗi
-- giữa chừng, transaction rollback nguyên khối — xem ghi chú 0001 dòng 44-45) — thêm để file
-- khớp đúng cái nó tự nhận, không phải vì có đường lỗi thật đang xảy ra.
DROP FUNCTION IF EXISTS auth_lookup_user(text);--> statement-breakpoint
-- Bước 2: tạo lại hàm với CỘT MỚI DUY NHẤT tenant_trang_thai (t.trang_thai) — bề mặt vẫn
-- hẹp như 0001 quy định, không thêm cột nào khác.
-- JOIN (không LEFT JOIN) giữ nguyên vì cùng lý do 0001: nguoi_dung.tenant_id NOT NULL +
-- FK nên không có người dùng mồ côi; nếu có, JOIN làm họ KHÔNG đăng nhập được thay vì trả
-- trạng thái rác — fail-closed, đúng hướng an toàn cho một hàm xác thực.
CREATE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE (id uuid, tenant_id uuid, vai_tro text, password_hash text, tenant_trang_thai text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.tenant_id, n.vai_tro, n.password_hash, t.trang_thai
  FROM nguoi_dung n
  JOIN tenants t ON t.id = n.tenant_id
  WHERE n.email = p_email
$$;--> statement-breakpoint
-- Bước 3: hàm mới vừa tạo hiện thuộc CURRENT_USER (role migrate) — trả chủ về auth_lookup
-- như 0001. auth_lookup cần CREATE TẠM trên schema public để đủ điều kiện "nhận" quyền sở
-- hữu (ALTER ... OWNER TO đòi role mới phải có CREATE trên schema chứa đối tượng); thu hồi
-- ngay sau ALTER, không giữ lại (least-privilege, giống hệt trình tự 0001).
GRANT CREATE ON SCHEMA public TO auth_lookup;--> statement-breakpoint
ALTER FUNCTION auth_lookup_user(text) OWNER TO auth_lookup;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM auth_lookup;--> statement-breakpoint
-- Bước 4: owner mới cần SELECT trên tenants để JOIN — BYPASSRLS chỉ bỏ qua policy HÀNG,
-- KHÔNG thay quyền BẢNG (0001 mới cấp SELECT trên nguoi_dung, chưa có JOIN tenants).
-- Lưu ý: GRANT SELECT trên nguoi_dung từ 0001 là quyền gắn trên BẢNG, không gắn trên HÀM,
-- nên DROP FUNCTION ở Bước 1 KHÔNG xoá nó — auth_lookup vẫn đọc được nguoi_dung sau bước
-- này mà không cần cấp lại.
GRANT SELECT ON "tenants" TO auth_lookup;--> statement-breakpoint
-- Bước 5: LEAST-PRIVILEGE giống hệt 0001 — Postgres tự cấp EXECUTE cho PUBLIC mỗi khi
-- CREATE FUNCTION (kể cả lần DROP+CREATE lại này, đây KHÔNG phải trạng thái được kế thừa
-- từ hàm cũ). REVOKE ngay để chỉ owner + role được cấp tường minh mới gọi được — hàm là
-- SECURITY DEFINER (BYPASSRLS), trả password_hash + tenant_id XUYÊN tenant.
REVOKE ALL ON FUNCTION auth_lookup_user(text) FROM PUBLIC;--> statement-breakpoint
-- Bước 6: khôi phục EXECUTE cho vat_app (role Hyperdrive production) — đây là phần DROP ở
-- Bước 1 đã âm thầm phá, không migration nào khác biết để vá. Grant GỐC nằm ở
-- packages/db/provisioning/app-role.sql (chạy tay lúc provision, ngoài lịch sử migration)
-- nên phải tự cấp lại Ở ĐÂY. Guard IF EXISTS theo đúng idiom pg_roles mà 0001 dùng cho
-- CREATE ROLE auth_lookup ⇒ no-op an toàn ở dev/CI/PGlite (không có role vat_app).
-- SET ROLE auth_lookup (owner) rồi RESET — mô phỏng đúng cách app-role.sql tự cấp lúc
-- provision (xem app-role.sql bước 3): CHỈ owner (hoặc thành viên hành động NHƯ owner)
-- mới GRANT EXECUTE được trên một hàm vừa REVOKE ALL FROM PUBLIC.
SET ROLE auth_lookup;--> statement-breakpoint
-- Guard theo TÊN CỐ ĐỊNH 'vat_app' (hardening — review 2026-07-20): tên role app KHÔNG cố
-- định theo môi trường — packages/db/provisioning/app-role.sql tham số hoá qua `-v role=
-- <APP_ROLE>`, và docs/plans/U17a-plan-thuc-thi.md nói rõ tên khác nhau mỗi môi trường
-- (production: vat_app; test: app_user). Ở môi trường dùng tên khác, nhánh IF không khớp,
-- guard NO-OP TRONG IM LẶNG — migration báo thành công nhưng login sẽ hỏng ở đó, không có
-- tín hiệu nào. Nhánh ELSE dưới đây CHỈ để phát tín hiệu (RAISE WARNING, không phải
-- EXCEPTION): production hiện đặt đúng tên 'vat_app' (KIỂM CHỨNG, xem
-- docs/plans/production-deploy.md dòng 18) nên đây không phải sự cố đang xảy ra — nhưng
-- dev/CI/PGlite hợp pháp KHÔNG có role này (0001 dùng cùng idiom IF EXISTS pg_roles cho lý
-- do này), nên dùng EXCEPTION ở đây sẽ làm hỏng local dev một cách không cần thiết.
-- RAISE WARNING vẫn hiện trong output `make migrate`, đủ để người vận hành thấy và tự
-- GRANT EXECUTE tay nếu môi trường của họ đặt tên role app khác 'vat_app'.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'vat_app') THEN
    GRANT EXECUTE ON FUNCTION public.auth_lookup_user(text) TO vat_app;
  ELSE
    RAISE WARNING 'auth_lookup_user(): role "vat_app" không tồn tại — BỎ QUA re-grant EXECUTE. Nếu môi trường này CÓ role app dùng tên khác (xem packages/db/provisioning/app-role.sql), role đó SẼ KHÔNG gọi được auth_lookup_user() sau migration này (permission denied khi login) cho tới khi cấp tay: GRANT EXECUTE ON FUNCTION public.auth_lookup_user(text) TO <ten_role_app>;';
  END IF;
END $$;--> statement-breakpoint
RESET ROLE;--> statement-breakpoint
-- Bước 7: ĐÓNG đường leo thang qua auth_lookup — thu hồi membership TẠM đã cấp ở Bước 1.
-- Đặt CUỐI CÙNG vì DROP/ALTER OWNER/REVOKE FROM PUBLIC/SET ROLE ở trên đều cần role
-- migrate còn là thành viên auth_lookup. Sau dòng này `SET ROLE auth_lookup` bị chặn lại
-- với role migrate — cùng trạng thái cuối mà 0001 để lại.
--
-- GIỚI HẠN PHỦ TEST (ghi nhận minh bạch — review bảo mật 2026-07-20): bước REVOKE này
-- KHÔNG có coverage hiệu quả trong bộ test PGlite. PGlite chạy dưới superuser, và quyền
-- SET ROLE được Postgres xét trên session_user chứ không phải role hiện có — nên superuser
-- luôn SET ROLE được bất kể còn membership hay không; xoá hẳn dòng REVOKE này test vẫn
-- xanh. Câu lệnh vẫn ĐÚNG và ĐÚNG VỊ TRÍ; độ tin cậy của nó dựa vào lần kiểm chứng tay trên
-- Neon ghi ở 0001 (dòng 60-65: "sau bước này SET ROLE auth_lookup bị CHẶN"), không phải bộ
-- test này. Không cố viết test cho bước này dưới PGlite — reviewer đã xác nhận không khả
-- thi ở tầng đó.
REVOKE auth_lookup FROM CURRENT_USER;

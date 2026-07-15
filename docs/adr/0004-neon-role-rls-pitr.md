# ADR-0004 — Kiểm chứng role Neon + hiệu lực RLS thật + PITR (H-A.1 SPIKE)

- **Trạng thái:** 🟡 E1–E4 (role + RLS) **ĐÃ KIỂM CHỨNG 2026-07-15** trên Neon thật (db `neondb`, role `vat_app`, hướng A — probe read-only trên DB demo). E5 (PITR) **CHỜ** thao tác Neon console. Chờ chủ dự án duyệt.
- **Ngày mở:** 2026-07-15 · **Đơn vị:** FORDEX H-A.1 (SPIKE, Gate A).
- **Gating:** mở khoá H-A.2 (health-check role lúc khởi động); chốt DR (Cụm 2).

## Bối cảnh — vì sao SPIKE này tồn tại

Cách ly tenant lớp 2 (RLS `ENABLE`+`FORCE`, policy fail-closed) **thiết kế đúng** và có test cách ly dưới PGlite. NHƯNG hiệu lực **production** phụ thuộc **role kết nối** không mang `SUPERUSER`/`BYPASSRLS` và không sở hữu bảng — điều kiện này nằm **ngoài mã** (`packages/db/provisioning/app-role.sql`), là bước thủ công, **chưa** được máy ép và **chưa** có bằng chứng tái lập ghi lại trên Neon thật.

`app-role.sql` có **chú thích** "KIỂM CHỨNG 2026-07-14: vat_app rolsuper=f, rolbypassrls=f…" và "neondb_owner CÓ BYPASSRLS!". Theo **nguyên tắc bằng chứng** của Hiến pháp — *"'đã có trong tài liệu/mã cũ' KHÔNG phải bằng chứng"* (bài học `:30000`) — chú thích này **chưa đủ**: phải tự kiểm lại từ nguồn sơ cấp và **ghi lại lệnh + kết quả + ngày**. ADR này làm việc đó, cộng phép **khôi phục PITR thật** (hiện thiếu hoàn toàn).

## Câu hỏi cần chốt (tiền đề CHƯA KIỂM CHỨNG)

1. Role app production (`vat_app`) có thật sự `rolsuper=false`, `rolbypassrls=false`, **không sở hữu bảng**?
2. `neondb_owner` (role owner/migrate) có `BYPASSRLS` không? (nếu có ⇒ tuyệt đối không dùng cho Hyperdrive).
3. Dưới role app, RLS có **fail-closed** thật (chưa set tenant ⇒ 0 hàng) và **không rò xuyên tenant** (truy vấn tường minh tenant khác ⇒ 0 hàng)?
4. Neon **PITR/backup** đã bật và **khôi phục được** (một phép restore thật)?

## Phương pháp kiểm chứng (tái lập)

- **Probe role + RLS:** `packages/db/provisioning/spike-role-rls-probe.sql` (psql) hoặc `spike-role-rls-probe.mjs` (node `pg`, đọc `APP_DATABASE_URL` từ env — KHÔNG paste chuỗi kết nối vào chat/commit).
  - Chạy bằng **chuỗi kết nối role app `vat_app`** (endpoint DIRECT, không `-pooler`).
  - Tuỳ chọn `TENANT_REAL=<uuid tenant có data>` để kiểm POSITIVE + cross-leak.
- **PITR:** trên Neon console/API — tạo branch tại timestamp quá khứ (hoặc restore), xác nhận đọc lại được dữ liệu; ghi lại thao tác + kết quả.

## BẰNG CHỨNG (điền khi chạy trên staging — RAW, không tóm tắt)

> Nguyên văn output `spike-role-rls-probe.mjs` chạy **2026-07-15** trên Neon `neondb`
> (kết nối `current_user='vat_app'`). Không có giá trị nhạy cảm (chỉ metadata role/RLS).

### E1 — Thuộc tính role app (`vat_app`) — ✅
```
current_user='vat_app', db='neondb'
rolname   | rolsuper | rolbypassrls | rolcanlogin | rolcreatedb | rolcreaterole
vat_app   | false    | false        | true        | false       | false
```
→ `vat_app` NOSUPERUSER + NOBYPASSRLS + không tạo db/role. RLS chi phối được nó.

### E2 — Thuộc tính mọi role (CHỐT: neondb_owner CÓ BYPASSRLS) — ✅
```
rolname         | rolsuper | rolbypassrls | rolcanlogin
cloud_admin     | true     | true         | true
auth_lookup     | false    | true         | false   (owner hàm SECURITY DEFINER login — có chủ đích)
neon_service    | false    | true         | true
neon_superuser  | false    | true         | false
neondb_owner    | false    | true         | true    ← CÓ BYPASSRLS
vat_app         | false    | false        | true    ← role app, KHÔNG bypass
```
→ **Chốt dấu hỏi treo:** `neondb_owner` **CÓ BYPASSRLS=true**. Xác nhận khẳng định
cũ trong `app-role.sql` bằng bằng chứng tái lập. ⇒ **TUYỆT ĐỐI không dùng
`neondb_owner` (hay bất kỳ role bypassrls) cho Hyperdrive** — chỉ `vat_app`.

### E3 — Sở hữu bảng + RLS enabled/forced — ✅
```
7/7 bảng (audit_log, dong_hang_hoa, hoa_don, lan_dong_bo, nguoi_dung,
tai_khoan_thue, tenants): tableowner='neondb_owner', owned_by_app_role=false;
rls_enabled=true, rls_forced=true.
```
→ `vat_app` KHÔNG sở hữu bảng (least-privilege). RLS ENABLE+FORCE trên MỌI bảng.

### E4 — Cách ly (role vat_app) — ✅
```
(5) chưa set app.tenant_id  → hoa_don count = 0   (fail-closed)
(6) tenant ngẫu nhiên       → 0
(7) POSITIVE (tenant thật)  → 0  *(bảng hoa_don RỖNG — demo chưa có hóa đơn; không
                                   phải RLS chặn nhầm. Hướng "thấy data tenant mình"
                                   đã phủ bởi test PGlite cách ly, packages/db test 13)*
(8) CROSS-LEAK tenant khác  → 0
(9) auth_lookup_user EXECUTE bằng vat_app = true  (đường login hoạt động)
```
→ Fail-closed thật + không rò xuyên tenant, dưới đúng role production `vat_app`.

### E5 — PITR restore thật — ⬜ CHỜ (thao tác Neon console)
```
(chưa chạy — chủ dự án tạo branch "Past data" tại timestamp ≤6h trong Neon Console,
 xác nhận đọc lại được state quá khứ. Free plan history window = 6 giờ.)
```

## QUYẾT ĐỊNH

- [x] `vat_app` NOSUPERUSER/NOBYPASSRLS/không-own-bảng → **an toàn cho Hyperdrive** (E1, E3, 2026-07-15).
- [x] `neondb_owner` BYPASSRLS = **true** → **tuyệt đối không dùng** cho Hyperdrive (chỉ migrate/admin) (E2, 2026-07-15).
- [x] RLS ENABLE+FORCE 7/7 bảng + fail-closed + không rò xuyên tenant dưới `vat_app` trên Neon thật → cách ly lớp 2 **đã kiểm chứng** (E3, E4, 2026-07-15).
- [ ] **PITR khôi phục được → DR (E5) CHỜ** thao tác Neon console của chủ dự án; ghi runbook rollback.
- [x] Tiền đề "thuộc tính role Neon + hiệu lực RLS thật" → **đã kiểm chứng 2026-07-15** (FORDEX-PROGRESS.md). Tiền đề DR/PITR vẫn CHỜ (E5).
- [x] **H-A.2 XONG** — `packages/db/src/roleGuard.ts` (`checkConnectionRole`+`assertConnectionRoleSafe`) dùng ĐÚNG truy vấn E1 (`pg_roles where rolname=current_user` + đếm `pg_tables` owner); wiring `apps/{api,sync-worker}/src/db.ts` kiểm 1 lần/isolate, từ chối khởi động nếu super/bypassrls/owner (fail-closed nếu role_not_found). Test unit + integration PGlite (catalog thật). QA 2 reviewer PASS.
  - *Khuyến nghị Low (security-reviewer):* BYPASSRLS/SUPERUSER là thuộc tính trực tiếp (không kế thừa qua membership) → truy vấn đủ. Nếu TƯƠNG LAI có code path dùng `SET ROLE`, bổ sung kiểm `pg_auth_members` chống escalation gián tiếp. Hiện grep xác nhận không có `SET ROLE` runtime.

## Lưu ý runtime (cho H-A.2)

Probe chứng minh **thuộc tính role `vat_app`** đúng. Nhưng an toàn production còn cần
**Hyperdrive THỰC SỰ kết nối bằng `vat_app`** (không phải `neondb_owner`). `APP_DATABASE_URL`
= `vat_app` và production-deploy.md nói Hyperdrive dùng `vat_app` — nhưng đây là bước cấu
hình thủ công. **H-A.2** chính là cổng máy ép điều này lúc RUNTIME: kiểm role kết nối
thật lúc bootstrap, từ chối khởi động nếu là role bypass/super/owner.

## Ràng buộc an toàn khi chạy SPIKE

- **KHÔNG** paste chuỗi kết nối/mật khẩu Neon vào chat hay commit — đặt trong `.dev.vars` (gitignore), script đọc từ env.
- Mật khẩu `neondb_owner` đã lộ trong chat trước đây (production-deploy.md §1) → **phải xoay** trước/khi làm staging.
- Probe chỉ ĐỌC (SELECT/count) + set GUC `is_local` trong phiên; KHÔNG ghi/xoá dữ liệu nghiệp vụ.

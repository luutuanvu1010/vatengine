# Runbook deploy — U18 (Admin API) + U19 (Cổng Admin)

> Trạng thái: **⬜ CHƯA THỰC THI.** Soạn 2026-07-21.
> Nguồn nghi thức: `docs/plans/production-deploy.md` (nhật ký U17b/U29/U23) + luật `deploy.md` (**migrate TRƯỚC, deploy SAU**).
>
> **Vì sao runbook này dài hơn thường lệ:** migration `0011` tạo **8 hàm `SECURITY DEFINER`** — đúng loại thao tác mà `0009` đã dùng và **làm hỏng toàn bộ login production** ngày 2026-07-20 (`DROP FUNCTION` xoá mất `GRANT EXECUTE` của `vat_app`, vốn được cấp ngoài lịch sử migration). Bước hậu kiểm ACL ở §2 không phải thủ tục hình thức: nó là chỗ phát hiện sự cố đó **trước khi** người dùng phát hiện.

---

## 0. Điều kiện tiên quyết

- [ ] PR **#27** (U18) merge vào trunk, CI xanh.
- [ ] PR **#28** (U19) merge vào trunk, CI xanh.
- [ ] Deploy từ nhánh **đã đối chiếu khớp origin**: `git diff origin/feat/cloudflare-stack-u0 HEAD` phải **trống** (vết sự cố 2026-07-16 — deploy từ cây khác origin).
- [ ] `make lint` sạch + `make test` xanh **trên trục đã gộp** (không phải trên nhánh riêng — U18 và U19 chỉ gặp nhau sau merge).
- [ ] Có `DATABASE_URL` của Neon (role migrate/owner) trong `packages/db/.dev.vars`.

> ⚠️ **Gotcha đã ghi nhận (U17b):** `make migrate` **không tự nạp** `packages/db/.dev.vars` — `drizzle.config.ts` đọc `process.env.DATABASE_URL`, phải `export` thủ công. Và `source .dev.vars` **vỡ** vì connection string chứa `&` không đóng ngoặc. Dùng:
> ```bash
> export DATABASE_URL='postgres://...'   # nháy đơn, bắt buộc
> ```

---

## 1. TIỀN KIỂM production — TRƯỚC khi migrate (chỉ đọc, bắt buộc)

Chạy trên Neon bằng role migrate. **Không lệnh nào ở bước này ghi dữ liệu.**

```sql
-- 1.1 Mốc migration đã áp: PHẢI là 0010, không khoảng trống.
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 3;
```
✅ Kỳ vọng: bản mới nhất ứng với `0010_email_khong_phan_biet_hoa_thuong` (`when = 1785200000000`).
❌ Nếu thấy `0011` đã áp → **DỪNG**, ai đó đã migrate trước; đọc §2.3 rồi quyết.

```sql
-- 1.2 ẢNH CHỤP ACL trước migrate — mốc so sánh của hậu kiểm.
--     0011 KHÔNG đụng auth_lookup_user, nên giá trị này phải KHÔNG ĐỔI sau migrate.
SELECT p.oid::regprocedure::text AS ham, p.proacl::text AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'auth_lookup_user';
```
✅ Kỳ vọng: `{auth_lookup=X/auth_lookup,vat_app=X/auth_lookup}` — **chép lại nguyên văn**, §2 sẽ so.

```sql
-- 1.3 Tên role app THẬT trên production. 0011 guard theo tên cố định 'vat_app'.
SELECT rolname FROM pg_roles WHERE rolcanlogin AND rolname NOT LIKE 'pg\_%';
```
✅ Kỳ vọng: có `vat_app`.
❌ Nếu role app mang tên KHÁC → migration sẽ `RAISE WARNING` và **bỏ qua cấp EXECUTE**; Cổng Admin sẽ `permission denied`. Xử lý ở §2.4.

```sql
-- 1.4 Các tên 0011 sẽ tạo phải CHƯA tồn tại (tránh va chạm im lặng).
SELECT to_regclass('quan_tri_he_thong') AS bang,
       (SELECT count(*) FROM pg_roles WHERE rolname = 'admin_api') AS role_admin_api,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname LIKE 'admin\_%') AS so_ham_admin;
```
✅ Kỳ vọng: `bang = NULL`, `role_admin_api = 0`, `so_ham_admin = 0`.

```sql
-- 1.5 Cột 0011 sẽ thêm phải chưa có (migration dùng IF NOT EXISTS nên an toàn, kiểm để biết).
SELECT column_name FROM information_schema.columns
WHERE table_name='nguoi_dung' AND column_name IN ('phai_doi_mat_khau','mat_khau_tam_het_han');
```
✅ Kỳ vọng: 0 hàng.

```sql
-- 1.6 Tenant đang chờ duyệt — đây chính là thứ U18 sinh ra để gỡ. Ghi lại để §6 verify.
SELECT id, ten, mst, trang_thai, ngay_tao FROM tenants WHERE trang_thai = 'cho_duyet';
```
📌 Ghi lại. `production-deploy.md` có nhắc **1 tenant smoke** còn sót: `mst=9999999901`, id `b9937258-e268-4138-81a9-5455887f5a44` — dùng đúng nó làm ca nghiệm thu đầu-cuối ở §6, rồi xoá.

---

## 2. MIGRATE `0011` + HẬU KIỂM ACL

### 2.1 Áp migration

```bash
export DATABASE_URL='postgres://...'
make migrate
```

👀 **Đọc kỹ output.** Nếu thấy dòng:
```
WARNING:  U18: role "vat_app" không tồn tại — BỎ QUA cấp EXECUTE cho 8 hàm admin_*
```
⇒ nhảy tới §2.4. Migration vẫn báo thành công nhưng Cổng Admin sẽ **không hoạt động**.

### 2.2 🔴 HẬU KIỂM — bước quan trọng nhất của cả runbook

```sql
-- (a) auth_lookup_user KHÔNG ĐƯỢC ĐỔI. So với ảnh chụp §1.2.
SELECT p.oid::regprocedure::text AS ham, p.proacl::text AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='auth_lookup_user';
```
✅ **PHẢI GIỐNG HỆT §1.2.** Khác một ký tự ⇒ đường đăng nhập của khách đang gặp nguy — **DỪNG, không deploy**, xem §7.

```sql
-- (b) 8 hàm admin_*: owner đúng, SECURITY DEFINER, search_path ghim, PUBLIC KHÔNG gọi được,
--     vat_app GỌI ĐƯỢC. Bốn cột cuối phải là t/t/f/t ở MỌI hàng.
SELECT p.oid::regprocedure::text AS ham,
       pg_get_userbyid(p.proowner) = 'admin_api'            AS owner_dung,
       p.prosecdef                                          AS security_definer,
       has_function_privilege('public', p.oid, 'EXECUTE')   AS public_goi_duoc,
       has_function_privilege('vat_app', p.oid, 'EXECUTE')  AS vat_app_goi_duoc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'admin\_%'
ORDER BY 1;
```
✅ Kỳ vọng: **đúng 8 hàng**; `owner_dung = t`, `security_definer = t`, `public_goi_duoc = f`, `vat_app_goi_duoc = t`.
❌ `public_goi_duoc = t` ở bất kỳ hàng nào ⇒ **một cửa BYPASSRLS đang mở cho mọi role** — DỪNG.
❌ `vat_app_goi_duoc = f` ⇒ Cổng Admin sẽ `permission denied` — xem §2.4.

```sql
-- (c) Bảng danh tính chủ phải ĐÓNG với role app và fail-closed ở tầng RLS.
SELECT has_table_privilege('vat_app','quan_tri_he_thong','SELECT') AS vat_app_doc_duoc,
       c.relrowsecurity AS rls_bat, c.relforcerowsecurity AS rls_force,
       (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS so_policy
FROM pg_class c WHERE c.relname='quan_tri_he_thong';
```
✅ Kỳ vọng: `vat_app_doc_duoc = f`, `rls_bat = t`, `rls_force = t`, `so_policy = 0`.

```sql
-- (d) Cột mật khẩu tạm đã có, mặc định đúng.
SELECT column_name, is_nullable, column_default FROM information_schema.columns
WHERE table_name='nguoi_dung' AND column_name IN ('phai_doi_mat_khau','mat_khau_tam_het_han');
```
✅ Kỳ vọng: `phai_doi_mat_khau` NOT NULL DEFAULT false; `mat_khau_tam_het_han` nullable.

```sql
-- (e) Role migrate KHÔNG còn mượn được danh tính admin_api (bước 7 của migration).
SET ROLE admin_api;   -- ✅ Kỳ vọng: LỖI "permission denied to set role"
RESET ROLE;
```
> 📌 Đây là điều **PGlite không kiểm được** (chạy superuser, luôn SET ROLE được). Production là nơi duy nhất câu này có ý nghĩa — đừng bỏ qua.

### 2.3 Nếu `0011` đã được áp từ trước
Không chạy lại. Nhảy thẳng §2.2 hậu kiểm; nếu mọi giá trị đúng thì đi tiếp §3.

### 2.4 Nếu `vat_app` không được cấp EXECUTE
Chạy dưới role migrate:
```sql
GRANT admin_api TO CURRENT_USER;
SET ROLE admin_api;
GRANT EXECUTE ON FUNCTION
  public.admin_lookup(text), public.admin_ghi_dang_nhap_cuoi(uuid),
  public.admin_liet_ke_tenant(text,text,int,int), public.admin_chi_tiet_tenant(uuid),
  public.admin_doi_trang_thai_tenant(uuid,text,text),
  public.admin_sua_metadata_tenant(uuid,text,text,text),
  public.admin_dat_mat_khau_tam(uuid,text,timestamptz), public.admin_doc_audit(int,int)
TO vat_app;   -- ⚠️ đổi 'vat_app' thành tên role app THẬT nếu §1.3 cho tên khác
RESET ROLE;
REVOKE admin_api FROM CURRENT_USER;
```
Rồi chạy lại §2.2(b).

---

## 3. Secret

```bash
# Sinh khoá MỚI — KHÔNG tái dùng JWT_SECRET. Trùng nhau ⇒ mọi /admin/* trả 503 (fail-closed).
openssl rand -hex 32

cd apps/api && npx wrangler secret put ADMIN_JWT_SECRET
```
✅ Xác minh: `npx wrangler secret list` thấy **cả** `JWT_SECRET` và `ADMIN_JWT_SECRET`.

> Không có cách kiểm "hai secret có khác nhau không" từ CLI — chính vì vậy `requireSuperAdmin` tự kiểm lúc chạy và trả 503. Ca smoke §6.2 sẽ phát hiện nếu đặt trùng.

---

## 4. Build + deploy — ĐÚNG THỨ TỰ

Thứ tự có lý do: `vat-api` mang endpoint mới, `vat-web` mang cổng chặn, `vat-admin` là thứ tiêu thụ cả hai. Deploy ngược lại sẽ có cửa sổ Cổng Admin gọi vào API chưa có route.

```bash
# 4.1 vat-api TRƯỚC — endpoint /admin/* + /auth/doi-mat-khau
cd apps/api && npx wrangler deploy

# 4.2 vat-web — worker.ts đổi (chặn /api/admin/*). SPA nguồn KHÔNG đổi ở U18/U19,
#     nhưng `wrangler deploy` cần ./dist tồn tại ⇒ vẫn phải build.
cd ../web && VITE_API_BASE=/api npm run build && npx wrangler deploy

# 4.3 vat-admin — MỚI HOÀN TOÀN. VITE_API_BASE mặc định đã là "/api" (khác apps/web),
#     đặt tường minh cho khớp quy ước cũng không hại.
cd ../admin && VITE_API_BASE=/api npm run build && npx wrangler deploy
```

> ⚠️ **Gotcha (U17b):** ngay sau `wrangler deploy`, vài request đầu tới route MỚI có thể trả **404** trong ~10–20 giây do biên Cloudflare chưa lan truyền hết. **Không phải lỗi** — chờ vài giây rồi smoke lại.

---

## 5. DNS + Cloudflare Access cho `adminvatengine.tourdao.vn`

`wrangler.jsonc` của `vat-admin` khai `custom_domain: true` ⇒ **wrangler tự tạo bản ghi DNS proxied**. Xác nhận trong Cloudflare dashboard → zone `tourdao.vn` → DNS.

Sau đó gắn **Cloudflare Zero Trust (Access)** cho hostname này — nợ bàn giao từ U18 (QĐ-4 / `COMMERCIAL-LAYER-plan.md` P5):

> Zero Trust → Access → Applications → Add → Self-hosted
> Domain: `adminvatengine.tourdao.vn` · Policy: Allow, email = email chủ dự án

⚠️ **Access là lớp THÊM, không thay `requireSuperAdmin`.** Ca smoke §6.2 (401 khi thiếu token) phải pass **kể cả khi** Access đang bật — nếu ai đó gỡ Access sau này, backend vẫn phải tự đứng vững.

---

## 6. Smoke test

### 6.1 🔴 Đối xứng hai cửa — chạy TRƯỚC mọi thứ khác

```bash
# Từ hostname KHÁCH: đường quản trị phải KHÔNG tồn tại.
curl -s -o /dev/null -w '%{http_code}\n' https://vatengine.tourdao.vn/api/admin/auth/me
# ✅ 404

# Từ hostname ADMIN: đường của khách phải KHÔNG tồn tại.
curl -s -o /dev/null -w '%{http_code}\n' https://adminvatengine.tourdao.vn/api/invoices
# ✅ 404

# App khách vẫn chạy bình thường (không hồi quy).
curl -s -o /dev/null -w '%{http_code}\n' https://vatengine.tourdao.vn/api/health
# ✅ 200
```
❌ Ca đầu ra **khác 404** ⇒ đường đăng nhập super-admin đang phơi trên hostname khách. Rollback `vat-web`.

### 6.2 Miền admin

```bash
# Chưa đăng nhập.
curl -s -o /dev/null -w '%{http_code}\n' https://adminvatengine.tourdao.vn/api/admin/auth/me
# ✅ 401  ❌ 503 ⇒ ADMIN_JWT_SECRET thiếu hoặc TRÙNG JWT_SECRET → làm lại §3

# Sai mật khẩu → 401 (KHÔNG phải 500 — 401 chứng minh Hyperdrive→Neon→admin_lookup thông).
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'content-type: application/json' -d '{"email":"khong-ai@x.vn","password":"sai"}' \
  https://adminvatengine.tourdao.vn/api/admin/auth/login
# ✅ 401   ❌ 500 ⇒ hàm admin_lookup không gọi được → quay lại §2.4

# SPA tải được.
curl -s -o /dev/null -w '%{http_code}\n' https://adminvatengine.tourdao.vn/
# ✅ 200
```

### 6.3 Seed super-admin

```bash
export DATABASE_URL='postgres://...'
export ADMIN_EMAIL='chu@vatengine.vn'
export ADMIN_PASSWORD='<mật khẩu ≥12 ký tự>'   # KHÔNG truyền qua argv (lộ ở `ps` + history)
node scripts/seed-super-admin.mjs
# ✅ "Đã TẠO super-admin: ... (id=...)"
```

### 6.4 🔴 Nghiệm thu đầu-cuối — đúng chỗ kẹt mà U18 sinh ra để gỡ

Trên trình duyệt, tại `https://adminvatengine.tourdao.vn`:

1. Đăng nhập bằng tài khoản vừa seed → vào thẳng tab **Chờ duyệt**.
2. Thấy tenant `cho_duyet` ghi ở §1.6 (tenant smoke `mst=9999999901`).
3. Bấm **Duyệt** → hiện hộp thoại mật khẩu tạm 6 số → chép lại.
4. Sang `https://vatengine.tourdao.vn`, đăng nhập bằng email của tenant đó + mã 6 số → **vào được**.
5. Quay lại Cổng Admin → tab **Nhật ký** → thấy `Duyệt doanh nghiệp` và `Cấp mật khẩu tạm`.
6. Bấm **Khóa** tenant đó → thử đăng nhập lại phía khách → **401**.

> ✅ Bước 4 là bằng chứng duy nhất chứng minh **toàn bộ chuỗi** hoạt động: RLS + hàm `SECURITY DEFINER` + băm PBKDF2 giữa Worker và DB + cổng trạng thái login. Không bước nào thay được nó.
>
> ⚠️ Bước 6 **chỉ chặn đăng nhập MỚI** — phiên đang sống của khách vẫn dùng được tới 8 giờ. Đây là hạn chế **đã biết và đã ghi nợ** (`BACKLOG` mục *[2026-07-21] Khoá tenant KHÔNG cắt phiên khách đang sống*), không phải lỗi deploy.

### 6.5 Dọn
```sql
-- Xoá tenant smoke sau khi nghiệm thu xong (cascade sẽ dọn nguoi_dung + audit của nó).
DELETE FROM tenants WHERE mst = '9999999901';
```

---

## 7. Rollback

| Hỏng ở đâu | Cách lùi |
|---|---|
| §2.2(a) — ACL `auth_lookup_user` đổi | 🔴 **Nguy cấp, login khách có thể đang hỏng.** Cấp lại ngay: `GRANT auth_lookup TO CURRENT_USER; SET ROLE auth_lookup; GRANT EXECUTE ON FUNCTION public.auth_lookup_user(text) TO vat_app; RESET ROLE;` rồi smoke `POST /api/auth/login` sai mật khẩu → phải 401 (không 500). |
| §2.2(b)(c) — quyền sai | Chưa deploy gì thì chưa ai dùng được. Sửa theo §2.4 hoặc `REVOKE` thủ công rồi kiểm lại. |
| §6.1 — cửa khách lộ `/api/admin/*` | `cd apps/web && npx wrangler rollback` — cổng chặn nằm ở đây. |
| §6.2 — 503 | Đặt lại `ADMIN_JWT_SECRET` (§3), deploy lại `vat-api`. Không cần đụng DB. |
| Muốn gỡ hẳn `0011` | **Không có down-migration.** `0011` chỉ THÊM (bảng, role, hàm, 2 cột) — không sửa/xoá gì sẵn có, nên để nguyên là **vô hại**: không code cũ nào tham chiếu tới chúng. Nếu buộc phải gỡ, dùng **Neon branch restore** về thời điểm trước migrate, đừng viết SQL gỡ tay. |

---

## 8. Sau khi xong — cập nhật tài liệu

- [ ] Ghi **nhật ký deploy** vào đầu `docs/plans/production-deploy.md` theo đúng khuôn các mục trước: version deploy của từng worker, kết quả từng ca smoke, và **mọi gotcha mới gặp**.
- [ ] Cập nhật dòng trạng thái đầu file đó: bỏ *"màn duyệt tenant `cho_duyet` (U18 — chưa có, nên tenant đăng ký mới hiện KHÔNG ai duyệt được)"* khỏi mục còn treo.
- [ ] Ghi vào `CHECKLIST-NGHIEM-THU.md` kết quả §6.4.

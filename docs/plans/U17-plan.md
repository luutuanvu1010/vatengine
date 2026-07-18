# U17 — Đăng ký công khai + Cổng duyệt + Bảng gói dịch vụ (BE)

> **Đơn vị đầu của cụm "U Plus"** (lớp thương mại U17→U21, chủ dự án gọi chung là *Bảng điều khiển*).
> Thứ tự phụ thuộc: **U17** → U18 (Admin API xuyên-tenant) → U19 (FE cổng `/admin`) → U21 (FE dashboard giám sát).
>
> **Trạng thái spec nguồn (2026-07-18):** bản `U17-plan.md` và `COMMERCIAL-LAYER-plan.md` cũ **đã mất** — chúng để *untracked* ở MAIN worktree (`U23-tien-do.md:31`) và không còn ở worktree nào. File này **tái lập** spec từ `docs/plans/U-PLUS-prompt-U17.md` (bản duy nhất còn lại, đã tự đối chiếu schema thật 2026-07-17) + 4 quyết định chủ dự án 2026-07-18 ghi ở §2. **File này tracked trong git** để không lặp lại việc mất nguồn sự thật.
>
> **Luật áp dụng:** `multi-tenant.md`, `security.md`, `testing.md`. **KHÔNG** đụng `gdt-adapter.md` (đơn vị này không gọi GDT).

## 1. Mục tiêu

Mở **cổng đăng ký công khai có kiểm soát**: khách tự đăng ký → tenant ở trạng thái `cho_duyet`, **chưa đăng nhập được** cho tới khi Admin duyệt (U18). Đồng thời dựng **nền bảng gói dịch vụ linh hoạt** thay hạn mức hardcode, và siết **rate-limit + consent**.

**Điểm chuyển sang U18:** tenant `cho_duyet` tồn tại trong DB + bảng gói sẵn sàng để Admin duyệt & gán gói.

## 2. Quyết định chủ dự án (2026-07-18)

### QĐ-1 — Đường ghi tenant mới: thử `withTenant(UUID tự sinh)` TRƯỚC

**Đính chính §0b điểm 1 của `U-PLUS-prompt-U17.md`.** §0b khẳng định *"Đã chắc chắn cần"* hàm SECURITY DEFINER `dang_ky_tenant()` vì FORCE RLS chặn INSERT tenant mới. **Khẳng định này chưa được kiểm chứng và có thể sai.**

Bằng chứng (đọc mã 2026-07-18, nhánh `7f5ceae`):

- `packages/db/src/schema/_rls.ts:16` — policy `tenants` là `id = nullif(current_setting('app.tenant_id', true), '')::uuid`, áp cho **cả `USING` lẫn `WITH CHECK`**.
- `packages/db/src/tenantContext.ts:21` — `withTenant(db, tenantId, fn)` chạy `set_config('app.tenant_id', tenantId, true)` rồi mở transaction.

⇒ Nếu tầng ứng dụng **tự sinh UUID trước**, gọi `withTenant(db, idMoi, …)` rồi `INSERT tenants{id: idMoi}`, mệnh đề `WITH CHECK` **khớp** và INSERT lọt — không cần hàm BYPASSRLS nào. Cùng transaction đó ghi tiếp `nguoi_dung{tenant_id: idMoi}` và `audit_log{tenant_id: idMoi}`.

**Quyết định:** viết integration test dưới **role production non-superuser** (khung có sẵn ở `packages/db/test/integration/constraints.test.ts`) để **chứng minh** đường ghi này. Test xanh ⇒ **không thêm** hàm SECURITY DEFINER nào. Test đỏ ⇒ mới làm `dang_ky_tenant()` theo §0b.

**Lý do:** đây đúng câu chữ §2.2 của prompt (*"kiểm con đường ghi… **nếu** bị chặn → dùng SECURITY DEFINER"*) và đúng "Nguyên tắc bằng chứng" của Hiến pháp. Mỗi hàm BYPASSRLS thêm vào là một đường bỏ-qua-cách-ly-tenant vĩnh viễn; chỉ mở khi có bằng chứng buộc phải mở.

### QĐ-2 — Rate-limit `/dang-ky`: Durable Object **mới** `SignupLimiter`, 5 lượt/IP/giờ

`LoginLimiter` hiện tại (`apps/api/src/loginLimiter.ts`) là **đếm-lần-SAI rồi khóa**: `recordSuccess()` xoá sạch bộ đếm, `resolveLoginLockConfig()` đọc ngưỡng từ env **toàn cục**. Đăng ký cần ngữ nghĩa khác: **đếm MỌI lượt** (kể cả thành công) trong cửa sổ trượt, ngưỡng riêng.

**Quyết định:** class DO riêng `SignupLimiter` + binding `SIGNUP_LIMITER` + wrangler migration **tag `v5`** kiểu `new_sqlite_classes` — **thuần cộng dồn** giống `v4`, **không đụng tag cũ** (tránh lặp sự cố `v2 deleted_classes` từng xoá `LoginLimiter` production, xem `wrangler.jsonc:46-50`). Ngưỡng qua env riêng, mặc định **5 đăng ký/IP/giờ**. Logic thuần tách file → test 100% không cần runtime DO.

### QĐ-3 — §2.5 (rate-limit mọi endpoint khách): **LÀM trong U17**

Ngoài `/dang-ky`, áp rate-limit cơ bản cho các endpoint khách chính (tra cứu, kết xuất). Login **đã có** khóa per-account nên không làm lại. Ngưỡng **rộng rãi** — chỉ chống lạm dụng, không chặn nhầm người dùng bình thường.

*Ghi nhận đánh đổi:* việc này cắt ngang nhiều route nên làm đơn vị to hơn và tăng rủi ro chặn nhầm; chủ dự án chọn làm luôn thay vì tách đơn vị riêng.

### QĐ-4 — Allowlist đuôi tên miền

Ngoài `gmail.com` / `yahoo.com`, chấp nhận: `com`, `com.vn`, `vn`, `net`, `net.vn`, `org`, `org.vn`, `edu.vn`, `gov.vn`, `biz`, `info`, `co`. Danh sách tĩnh một chỗ, bổ sung sau dễ.

## 3. Phạm vi

### 3.1 Migration `0007_dang_ky_va_goi_dich_vu.sql`

> Số hiệu **0007** — hiện có tới `0006_unique_mst_username`.

- `tenants.trang_thai`: CHECK ∈ `('cho_duyet','active','khoa','tu_choi')`. **Giữ default `'active'`** (tương thích tenant cũ); đăng ký mới ghi tường minh `'cho_duyet'`. Index trên `(trang_thai)`.
- Bảng **`goi_dich_vu`**: `ma text PK`, `ten`, `so_mst_toi_da int`, `so_hoa_don_thang int NULL`, `cho_tai_khoan_con bool`. Seed hàng `free` (01 MST, không tài khoản con). `tenants.goi_dich_vu` tham chiếu `ma`, mặc định `'free'`.
- `nguoi_dung.phai_doi_mat_khau boolean NOT NULL DEFAULT false` (dùng ở U18/U20; đặt sẵn để migration gọn).
- **Sửa `auth_lookup_user(text)`** trả thêm `tenant_trang_thai` — xem §3.3.

### 3.2 `POST /dang-ky` — công khai, rate-limited

```
Body: { email, tenDoanhNghiep, mst, dongYDieuKhoan: boolean }
201 { ok: true, trangThai: "cho_duyet" }
400 { error: "email_khong_hop_le" | "mst_khong_hop_le" | "chua_dong_y_dieu_khoan" | "bad_request" }
409 { error: "da_ton_tai" }
429 { error: "qua_nhieu_yeu_cau" }
```

- **Consent:** `dongYDieuKhoan` bắt buộc `=== true`; thiếu/false → 400 `chua_dong_y_dieu_khoan`. **Không** lưu lịch sử phiên bản consent (v1.0).
- Validate email qua `validateEmailDangKy` (§3.4); validate MST 10 hoặc 13 chữ số.
- Tạo `tenants(trang_thai='cho_duyet', goi_dich_vu='free')` + `nguoi_dung(vai_tro='quan_tri', password_hash=NULL, phai_doi_mat_khau=false)` trong **một transaction** → ghi audit `dang_ky` (che `chi_tiet` bằng `maskSensitive`).
- Trùng lặp: dựa vào UNIQUE index sẵn có (`tenants_mst_unique`, `nguoi_dung_email_unique`) → 409 `da_ton_tai`. UNIQUE index vẫn hiệu lực dưới RLS.
- Rate-limit theo `CF-Connecting-IP` (QĐ-2).

### 3.3 Sửa `POST /auth/login` — cổng trạng thái

`auth_lookup_user` (migration `0001`, OWNER `auth_lookup` BYPASSRLS) trả **cố định** `(id, tenant_id, vai_tro, password_hash)` — **không có** trạng thái tenant. Không thể query `tenants` ngoài `withTenant` (FORCE RLS chặn).

**Cách làm:** migration `0007` `CREATE OR REPLACE` hàm này trả thêm `tenant_trang_thai`, **giữ nguyên OWNER + GRANT** hiện có. Trong `auth.ts`, thêm điều kiện `tenant_trang_thai === 'active'` vào **đúng nhánh 401 gọn đang có** (`apps/api/src/routes/auth.ts:122`) — cùng mã lỗi với sai mật khẩu, chống dò tài khoản.

**Bất biến phải giữ** (đã có, không được phá):

- verify PBKDF2 **luôn chạy đúng một lần** kể cả nhánh hỏng (`DUMMY_HASH`) → độ trễ đồng nhất, chống dò qua timing (`auth.ts:119`).
- `limiter.recordFailure()` gọi **uniform** cho mọi nhánh sai (`auth.ts:125`).
- Audit ghi qua `settle()` off-critical-path (`auth.ts:98`).

Audit trạng thái ≠ active: `login_fail_chua_duyet`.

**Đây là thay đổi hàm bảo mật ⇒ bắt buộc review chéo `security-reviewer`.**

### 3.4 `validateEmailDangKy(email)` — hàm thuần, trọng tâm test

Thứ tự kiểm: (1) dạng hợp lệ → (2) chặn alias `+` → (3) blocklist miền dùng-1-lần (`disposableDomains.ts`, ~50 miền, tĩnh, offline) → (4) allowlist: `gmail.com`/`yahoo.com` **hoặc** đuôi tên miền theo QĐ-4.

### 3.5 Hạn mức tài khoản thuế đọc từ bảng gói

`getGioiHanTkThue(tenant: { goiDichVu })` (`apps/api/src/routes/taxAccounts.ts:52`) đang hardcode `return 1`. Thay **thân hàm** bằng tra cứu `goi_dich_vu`; **giữ nguyên chữ ký** để không vỡ call-site (`taxAccounts.ts:132`). Cờ `SUB_ACCOUNT_MODULE_ENABLED` (`taxAccounts.ts:58`) chuyển sang lấy theo gói.

**Nợ TOCTOU** (`task_230e0541`): đếm-rồi-insert chưa khóa. Hiện **an toàn** cho tài khoản chính vì đều dùng `mst` → `UNIQUE(tenant_id, username)` chặn. Chỉ thành rủi ro **khi bật tài khoản con** → khi đó cần `SELECT … FOR UPDATE`.

### 3.6 Rate-limit cơ bản các endpoint khách (QĐ-3)

Middleware Hono dùng chung, tái dùng cơ chế DO của §3.2 nhưng **khóa theo `tenantId`** (đã có trong context sau `requireTenant`), không theo IP — khách hợp lệ luôn có tenant, và khóa theo tenant không phạt oan nhiều người sau cùng một NAT.

Áp cho các route **đọc/kết xuất tốn tài nguyên**, ngưỡng **rộng rãi**:

| Nhóm route | Mount | Ngưỡng đề xuất |
|---|---|---|
| Tra cứu hóa đơn | `/invoices` | 120 req/tenant/phút |
| Kết xuất | `/exports` | 20 req/tenant/phút |
| Đối chiếu | `/reconcile` | 20 req/tenant/phút |

**Không áp** cho: `/auth` (đã có khóa per-account, và chưa biết tenant tại thời điểm login), `/me` (rẻ, gọi mỗi lần tải trang), `/health`. `/tax-accounts` và `/backfill` **giữ nguyên** — đã có lớp chống dồn riêng qua `sync_busy`/`BACKFILL_LINES_PACE_MS` (sự cố Queue 429 2026-07-17); chồng thêm lớp nữa dễ gây chặn nhầm khó truy.

Vượt ngưỡng → **429** kèm `Retry-After`, thân `{ error: "qua_nhieu_yeu_cau" }`.

**Rủi ro đã ghi nhận:** đây là phần dễ chặn nhầm người dùng thật nhất trong U17. Ngưỡng phải kiểm lại bằng số thật của tenant đang chạy production trước khi deploy; nếu chưa có số, deploy với ngưỡng nới gấp đôi rồi siết sau.

## 4. Ngoài phạm vi

UI đăng ký (U20) · Admin API/duyệt (U18) · gửi email (U18) · 2FA (sau, Cloudflare Access) · gói trả phí (v1.0 chỉ `free`, nhưng **bảng gói phải linh hoạt sẵn**).

## 5. Kiểm thử (TDD, coverage ≥ 80% tầng nghiệp vụ)

**unit**

- `validateEmailDangKy` — toàn ma trận: dạng sai, alias `+`, miền dùng-1-lần, đuôi ngoài allowlist, các ca hợp lệ.
- Validate MST 10/13 số.
- Logic thuần `SignupLimiter` (cửa sổ trượt, đếm cả lượt thành công, hết hạn).
- Đọc hạn mức từ bảng gói.

**integration** (Hono + PGlite, **role production non-superuser**)

- `/dang-ky` hợp lệ → 201; tạo đúng `tenants(cho_duyet, free)` + `nguoi_dung(quan_tri, password_hash NULL)` + audit `dang_ky`.
- Thiếu `dongYDieuKhoan` → 400, **không tạo hàng nào**.
- Email rác → 400 · email/MST trùng → 409 · vượt ngưỡng → 429.
- **QĐ-1 — quyết định:** INSERT tenant chạy được dưới RLS qua `withTenant(UUID tự sinh)` với role production. Đây là test **chốt hướng đi**, chạy trước khi hiện thực route.
- **Cách ly:** đăng ký không chạm dữ liệu tenant khác.
- `/auth/login` với `cho_duyet` / `khoa` / `tu_choi` → 401 + audit `login_fail_chua_duyet`; `active` → 200 (**không hồi quy U8**).
- Hạn mức tài khoản thuế đọc từ bảng gói — `free` = 1.
- **QĐ-3:** vượt ngưỡng `/invoices` → 429 + `Retry-After`; tenant A vượt ngưỡng **không** ảnh hưởng tenant B (bộ đếm tách theo `tenantId`); `/me` và `/auth` **không** bị middleware này chạm.

## 6. Định nghĩa hoàn thành

`make lint` sạch · `make test` xanh · coverage không tụt · không log bí mật/mật khẩu · audit `dang_ky` + `login_fail_chua_duyet` đủ · `make migrate` chạy sạch · **review chéo `security-reviewer`** (chạm cách ly + cổng công khai + sửa hàm SECURITY DEFINER) · commit nhỏ.

## 7. Vận hành

- Worktree: `/Users/tuanbao/Documents/Projects/vat-u17`, nhánh `feat/u17-dang-ky-goi-dich-vu`, cắt từ **`origin/feat/cloudflare-stack-u0` (`7f5ceae`)** — bản local của trunk đang **chậm 11 commit**, không dùng.
- Worktree mới **cần `npm ci`** trước khi tin `make lint`/`make test` (đã chạy, exit 0).
- **Deploy:** migration `0007` **PHẢI `make migrate` TRƯỚC** khi deploy `apps/api` (mã đọc ràng buộc mới). Smoke-test đúng đường `POST /dang-ky`, không chỉ `/health`.

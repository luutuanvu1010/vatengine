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

### QĐ-5 — Ngưỡng rate-limit sửa được từ bảng điều khiển Admin: **phân ba hạng**

Yêu cầu chủ dự án 2026-07-18: ngưỡng phải sửa được từ bảng điều khiển, không còn là env var. Khảo sát mã cho thấy "rate-limit" trong dự án này là **ba thứ khác nhau về bản chất**; gộp chung vào một bảng Admin sửa được là nguy hiểm.

| Hạng | Gồm | Nơi lưu | Admin sửa? |
|---|---|---|---|
| **A — hạn mức thương mại** | `/invoices`, `/exports`, `/reconcile` mỗi phút; `so_mst_toi_da`; `so_hoa_don_thang` | cột của `goi_dich_vu` | ✅ tự do, theo gói |
| **B — chống tấn công** | đăng ký/IP (§3.2) | `cau_hinh_he_thong` | ⚠️ sửa được nhưng **kẹp biên cứng trong mã** |
| **B′ — chống dò mật khẩu** | `LoginLimiter` (`LOGIN_MAX_FAILURES`…) | **giữ nguyên env** | ❌ không đưa lên UI |
| **C — tôn trọng máy chủ thuế** | token-bucket ra GDT (`apps/sync-worker`) | **giữ nguyên env** | ❌ không đưa lên UI |

**Lý do loại B′ và C khỏi UI:**

- Hạng C là **ranh giới đạo đức trong Hiến pháp** (*"Tôn trọng máy chủ thuế… Không gọi dồn dập"*). Một nút bấm nới được nhịp gọi GDT là nút bấm vi phạm được cam kết với cơ quan thuế. `rateLimiter.ts:33-35` đã ghi nguyên tắc *"không tắt limiter vì cấu hình sai"*.
- Hạng B′ là cơ chế chống chiếm tài khoản (`H-A.5b`). Nếu chính tài khoản admin bị chiếm, việc đầu tiên kẻ tấn công làm là tắt nó.

**Kẹp biên (bắt buộc).** Mọi giá trị đến từ DB phải qua hàm kẹp trước khi dùng, mở rộng pattern `positiveOr` sẵn có (`loginLimiter.ts:36`). **Tách hai hàm** — `clampInt` cho số đếm (`maxFailures`, `capacity`, req/phút) và `clampNumber` cho tốc độ/thời lượng (`refillPerSec`, các `*Ms`). Ép số nguyên cho *mọi* trường sẽ khiến không thể siết `refillPerSec` xuống dưới `1/s` (mặc định là `2/s`) — đúng hành vi Hiến pháp mong muốn nhất.

Biên cho đăng ký/IP: **1..50 lượt/giờ**. Giá trị ngoài biên → kẹp về biên + phát log có cấu trúc (mẫu `limiterEvent`, `rateLimiter.ts:70`) để phân biệt *"admin đặt vậy"* với *"DB hỏng"*.

**Fail-safe khi đọc config hỏng:** rơi về `DEFAULT_*` trong mã — **không** fail-open, **không** fail-closed. Đây là hạng thứ ba mã hiện chưa có (nay chỉ có fail-open `loginLimiterDO.ts:54` và guard thiếu binding `taxAccounts.ts:469`).

### QĐ-6 — Audit cấu hình toàn cục: **bảng `audit_log_admin` riêng**

**Hard stop đã gỡ.** `audit_log.tenant_id` là `NOT NULL` + FK cascade (`auditLog.ts:13`), lại thêm policy RLS `for:'all'` và trigger append-only (migration `0002`). Ba lớp cùng chặn ⇒ thay đổi cấu hình **toàn cục** không có chỗ ghi audit hợp lệ, trong khi `security.md:21` bắt buộc audit việc đổi cấu hình.

**Quyết định:** tạo bảng `audit_log_admin` riêng cho hành động xuyên-tenant — không có `tenant_id`, append-only theo đúng mẫu trigger `0002`. Không đụng `audit_log` của khách (đang chạy đúng trên production, sửa là rủi ro hồi quy). Tách nhật ký super-admin khỏi nhật ký tenant cũng hợp với ranh giới bảo mật U18.

Ghi **giá trị CŨ → MỚI + ai đổi**, không chỉ tên trường như tiền lệ `me.ts:89`. Thiếu giá trị cũ thì audit vô dụng khi điều tra sự cố. Ngưỡng không phải bí mật nên không vướng luật che dữ liệu ở `security.md:19` — nhưng **vẫn qua `maskSensitive`** phòng thủ, đồng nhất với đường audit hiện có.

*U17 chỉ TẠO bảng. Đường ghi vào nó là U18.*

### QĐ-7 — `tenants.goi_dich_vu`: backfill về mã + FK, FE hiển thị `ten`

Cột này đang chứa **nhãn** chứ không phải mã — bằng chứng `me.route.test.ts:38` dùng `goiDichVu: "Miễn phí"`. Thêm FK tới `goi_dich_vu.ma` mà không xử lý sẽ vỡ.

Migration `0007` theo thứ tự: tạo `goi_dich_vu` + seed → `UPDATE tenants SET goi_dich_vu='free' WHERE goi_dich_vu IS NULL OR goi_dich_vu NOT IN (SELECT ma FROM goi_dich_vu)` → mới thêm FK (`ON DELETE RESTRICT`). `GET /me` trả thêm nhãn từ `goi_dich_vu.ten`; `SettingsPage.tsx:93` hiển thị nhãn đó.

*Đánh đổi đã chấp nhận:* U17 là đơn vị BE nhưng phải đụng `apps/web` một chỗ để không mất nhãn tiếng Việt trên FE.

### QĐ-8 — Đường đọc config (rút ra từ vòng phản biện)

- **Không cần cache.** `checkLock` **không dùng** tham số `cfg` — `loginLimiter.ts:60` khai nó là `_cfg`, thân hàm chỉ đọc `state.lockedUntilMs`. Nên đường nóng `/check` không đụng config; chỉ `/failure` cần, mà lúc đó DB đã mở sẵn (`auth.ts:113`) ⇒ đọc trên kết nối đang mở, thêm đúng một round-trip. **Bỏ được cả tầng cache lẫn TTL** — và bỏ luôn câu hỏi "admin sửa xong bao lâu có hiệu lực".
- **Chi phí thật cần biết trước:** `getLoginLimiter` trong `types.ts:89` là hàm **đồng bộ**. Cho `SignupLimiter` đọc config từ DB sẽ kéo theo `types.ts`, `index.ts`, `test/helpers.ts`, `test/integration/auth.hardening.test.ts`. Không "rẻ".
- **Không đọc config trong constructor DO.** Cả 4 DO trong repo đọc config một lần lúc dựng (`loginLimiterDO.ts:21`, `tenantLimiter.ts:23`) — đúng với env var, **sai với DB**: DO sống lâu nên sửa xong không rõ bao giờ hiệu lực. Config truyền theo request.
- **Bảng mới PHẢI được GRANT tường minh.** `app-role.sql:28` là `GRANT … ON ALL TABLES` chạy **một lần**, và toàn repo **không có** `ALTER DEFAULT PRIVILEGES` (đã grep, = 0). Bảng tạo ở `0007` sẽ **không có quyền nào** cho role app ⇒ API lỗi `permission denied` sau deploy nếu quên. Migration phải `GRANT SELECT` tường minh.
- **Cạm bẫy cho đường ghi U18:** hàm `SECURITY DEFINER` do role **không có BYPASSRLS** sở hữu **vẫn bị FORCE RLS chặn** — migration `0001:4-8` đã ghi thẳng bài học này. U18 làm đường ghi phải theo đúng mẫu `auth_lookup` (role NOLOGIN **BYPASSRLS** riêng), không phải chỉ "SECURITY DEFINER là xong".

### QĐ-9 — Ranh giới U17/U18 = ranh giới ĐỌC/GHI

| | U17 (đơn vị này) | U18 |
|---|---|---|
| Bảng `goi_dich_vu`, `cau_hinh_he_thong`, `audit_log_admin` | ✅ tạo + seed | — |
| Hàm thuần phân giải ngưỡng + kẹp biên | ✅ | — |
| Limiter nhận config theo-request | ✅ | — |
| Endpoint Admin **ghi** cấu hình | ❌ | ✅ |
| Danh tính super-admin, xác thực | ❌ | ✅ |
| Ghi `audit_log_admin` | ❌ | ✅ |

**Ràng buộc bảo mật cốt lõi:** `rbac.ts:8` chỉ có 3 vai `ke_toan | ke_toan_truong | quan_tri` — **tất cả đều trong phạm vi một tenant**; `grep 'admin'` trong `apps/api/src` trả **0 kết quả**. Nghĩa là **`quan_tri` là admin CỦA TENANT, không phải super-admin**. Tuyệt đối không để `quan_tri` sửa được ngưỡng của chính tenant mình — khách sẽ tự nâng hạn mức, vô hiệu hóa cả lớp gói dịch vụ. Vì vậy **không đặt cột ngưỡng lên bảng `tenants`** (`PATCH /me` đã ghi được bảng đó với vai `quan_tri`, `me.ts:60`).

Theo `security.md:20`, khu vực quản trị dùng **Cloudflare Access** — bảng điều khiển Admin không đi qua `/auth` của khách.

## 3. Phạm vi

### 3.1 Migration `0007_dang_ky_va_goi_dich_vu.sql`

> Số hiệu **0007** — hiện có tới `0006_unique_mst_username`.

- `tenants.trang_thai`: CHECK ∈ `('cho_duyet','active','khoa','tu_choi')`. **Giữ default `'active'`** (tương thích tenant cũ); đăng ký mới ghi tường minh `'cho_duyet'`. Index trên `(trang_thai)`.
- Bảng **`goi_dich_vu`** (hạng A, QĐ-5) — `ma text PK` · `ten` · `so_mst_toi_da int` · `so_hoa_don_thang int NULL` · `cho_tai_khoan_con bool` · `gh_invoices_moi_phut int` · `gh_exports_moi_phut int` · `gh_reconcile_moi_phut int` · `cap_nhat_luc`. Seed hàng `free`.
- Bảng **`cau_hinh_he_thong`** (hạng B, QĐ-5) — `khoa text PK` · `gia_tri text` · `mo_ta` · `cap_nhat_luc`. Dùng `text` **có chủ ý**: mọi `resolveXxxConfig` hiện nhận `Record<string, string|undefined>` và đã có fail-safe, nên giữ text cho phép **tái dùng nguyên các hàm thuần đã test**, chỉ đổi *nguồn nạp*. Seed khóa `dangky_max_moi_ip_gio = '5'`.
- Bảng **`audit_log_admin`** (QĐ-6) — không `tenant_id`, append-only theo mẫu trigger `0002`.
- **Backfill + FK `tenants.goi_dich_vu`** theo đúng thứ tự ở QĐ-7.
- `nguoi_dung.phai_doi_mat_khau boolean NOT NULL DEFAULT false` (dùng ở U18/U20; đặt sẵn để migration gọn).
- **Sửa `auth_lookup_user(text)`** trả thêm `tenant_trang_thai` — xem §3.3.
- **RLS + quyền cho 3 bảng mới (bắt buộc, dễ quên):** drizzle **không** phát `ENABLE RLS` cho bảng không khai báo policy (bằng chứng `0000`: chỉ 7 bảng có policy mới được ENABLE) — nên làm tay: `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy **chỉ SELECT** (`USING (true)` cho `goi_dich_vu`/`cau_hinh_he_thong`), **không** tạo policy INSERT/UPDATE/DELETE ⇒ ghi bị chặn ở tầng RLS. Kèm `GRANT SELECT` tường minh cho role app (QĐ-8 — bảng mới không thừa hưởng grant cũ).

  > **Ghi chú thi hành:** khuyến nghị `REVOKE` kèm theo có thể **không thi hành được trên Neon** — migration `0002:4-7` đã tự dán nhãn giả định tương tự là *"CHƯA KIỂM CHỨNG trên DB thật"* và cuối cùng dự án phải chuyển sang **trigger**. Nếu `REVOKE` không ăn, dùng trigger chặn ghi như `0002` đã làm cho `audit_log`.

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
| Tra cứu hóa đơn | `/invoices` | `goi_dich_vu.gh_invoices_moi_phut` (seed 120) |
| Kết xuất | `/exports` | `goi_dich_vu.gh_exports_moi_phut` (seed 20) |
| Đối chiếu | `/reconcile` | `goi_dich_vu.gh_reconcile_moi_phut` (seed 20) |

Ngưỡng **đọc từ gói dịch vụ của tenant** (QĐ-5 hạng A), không hardcode — Admin đổi một hàng `goi_dich_vu` là áp cho toàn bộ tenant dùng gói đó. Giá trị đọc lên phải qua `clampInt` trước khi dùng.

**Không áp** cho: `/auth` (đã có khóa per-account, và chưa biết tenant tại thời điểm login), `/me` (rẻ, gọi mỗi lần tải trang), `/health`. `/tax-accounts` và `/backfill` **giữ nguyên** — đã có lớp chống dồn riêng qua `sync_busy`/`BACKFILL_LINES_PACE_MS` (sự cố Queue 429 2026-07-17); chồng thêm lớp nữa dễ gây chặn nhầm khó truy.

Vượt ngưỡng → **429** kèm `Retry-After`, thân `{ error: "qua_nhieu_yeu_cau" }`.

**Rủi ro đã ghi nhận:** đây là phần dễ chặn nhầm người dùng thật nhất trong U17. Các con số seed ở trên là **ĐỀ XUẤT CHƯA KIỂM CHỨNG** — không tìm được số liệu sử dụng thật nào trong mã hay tài liệu. Phải đo bằng số thật của tenant production trước khi deploy; chưa có số thì seed nới gấp đôi rồi siết sau. Nay ngưỡng nằm trong DB nên siết/nới **không cần deploy** — rủi ro này rẻ hơn hẳn so với bản trước.

## 4. Ngoài phạm vi

UI đăng ký (U20) · Admin API/duyệt (U18) · gửi email (U18) · 2FA (sau, Cloudflare Access) · gói trả phí (v1.0 chỉ `free`, nhưng **bảng gói phải linh hoạt sẵn**).

## 5. Kiểm thử (TDD, coverage ≥ 80% tầng nghiệp vụ)

**unit**

- `validateEmailDangKy` — toàn ma trận: dạng sai, alias `+`, miền dùng-1-lần, đuôi ngoài allowlist, các ca hợp lệ.
- Validate MST 10/13 số.
- Logic thuần `SignupLimiter` (cửa sổ trượt, đếm cả lượt thành công, hết hạn).
- Đọc hạn mức từ bảng gói.
- **`clampInt` / `clampNumber` (QĐ-5)** — ma trận biên: dưới biên, trên biên, `0`, số âm, `0.5`, `NaN`, chuỗi rỗng, `undefined`. Khẳng định `clampNumber` **giữ được** `refillPerSec = 0.5` (siết) trong khi `clampInt` làm tròn — đây chính là chỗ hai ràng buộc từng triệt tiêu nhau.
- Phân giải config theo thứ tự **DB → env → `DEFAULT_*`**; DB hỏng/trống → rơi về `DEFAULT_*` (không fail-open, không fail-closed) + phát log có cấu trúc.

**integration** (Hono + PGlite, **role production non-superuser**)

- `/dang-ky` hợp lệ → 201; tạo đúng `tenants(cho_duyet, free)` + `nguoi_dung(quan_tri, password_hash NULL)` + audit `dang_ky`.
- Thiếu `dongYDieuKhoan` → 400, **không tạo hàng nào**.
- Email rác → 400 · email/MST trùng → 409 · vượt ngưỡng → 429.
- **QĐ-1 — quyết định:** INSERT tenant chạy được dưới RLS qua `withTenant(UUID tự sinh)` với role production. Đây là test **chốt hướng đi**, chạy trước khi hiện thực route.
- **Cách ly:** đăng ký không chạm dữ liệu tenant khác.
- `/auth/login` với `cho_duyet` / `khoa` / `tu_choi` → 401 + audit `login_fail_chua_duyet`; `active` → 200 (**không hồi quy U8**).
- Hạn mức tài khoản thuế đọc từ bảng gói — `free` = 1.
- **QĐ-3:** vượt ngưỡng `/invoices` → 429 + `Retry-After`; tenant A vượt ngưỡng **không** ảnh hưởng tenant B (bộ đếm tách theo `tenantId`); `/me` và `/auth` **không** bị middleware này chạm.
- **QĐ-5:** đổi `goi_dich_vu.gh_invoices_moi_phut` → ngưỡng áp dụng đổi theo, **không cần deploy lại**. Giá trị phi lý trong DB (`0`, số âm, rác) → bị kẹp về biên, **không** khóa sạch khách và **không** vô hiệu hóa limiter.
- **QĐ-5 cách ly:** tenant dùng gói `free` **không** đọc được ngưỡng gói khác qua bất kỳ endpoint nào; vai `quan_tri` của tenant **không** sửa được ngưỡng của chính mình (không có đường ghi nào trong U17).
- **QĐ-7:** tenant có `goi_dich_vu` là nhãn cũ `"Miễn phí"` → sau migration thành `'free'`; `GET /me` vẫn trả nhãn tiếng Việt (nay lấy từ `goi_dich_vu.ten`), **không hồi quy** `me.route.test.ts`.
- **QĐ-8:** role app **đọc được** 3 bảng mới sau migration (bắt lỗi quên `GRANT` — nếu không, lỗi chỉ lộ ra sau khi deploy production).

## 6. Định nghĩa hoàn thành

`make lint` sạch · `make test` xanh · coverage không tụt · không log bí mật/mật khẩu · audit `dang_ky` + `login_fail_chua_duyet` đủ · `make migrate` chạy sạch · **review chéo `security-reviewer`** (chạm cách ly + cổng công khai + sửa hàm SECURITY DEFINER) · commit nhỏ.

## 7. Tách đơn vị giao hàng (QĐ-10, 2026-07-18)

Sau khi tích hợp QĐ-5..9, U17 nặng ~3 đơn vị — vi phạm kỷ luật *"mỗi lần chỉ một đơn vị"* của Hiến pháp và tạo khối review quá lớn cho `security-reviewer` (cổng công khai mới + hàm bỏ-qua-RLS sửa đổi + 3 bảng RLS tay + middleware chặn được toàn bộ khách, cùng lúc). **Giữ nguyên spec này**, chia làm ba lần giao:

| Đơn vị | Nội dung | Phụ thuộc |
|---|---|---|
| **U17a** | §3.1 migration `0007` (3 bảng mới, backfill+FK, RLS/GRANT tay) · `clampInt`/`clampNumber` · phân giải config DB→env→`DEFAULT_*` · §3.5 `getGioiHanTkThue` theo gói · nhãn gói ở `GET /me` + `SettingsPage` | — |
| **U17b** | §3.2 `POST /dang-ky` · `SignupLimiter` + wrangler `v5` · §3.4 `validateEmailDangKy` · §3.3 cổng trạng thái login + sửa `auth_lookup_user` | U17a |
| **U17c** | §3.6 middleware rate-limit `/invoices` `/exports` `/reconcile`, ngưỡng đọc từ gói | U17a |

Mỗi đơn vị: một nhánh, một PR, qua `make lint` + `make test` + review chéo trước khi sang đơn vị kế. **U17a xong là nền cho "Admin sửa ngưỡng" đã đủ** (đường ghi vẫn thuộc U18).

## 8. Vận hành

- Worktree: `/Users/tuanbao/Documents/Projects/vat-u17`, nhánh `feat/u17-dang-ky-goi-dich-vu`, cắt từ **`origin/feat/cloudflare-stack-u0` (`7f5ceae`)** — bản local của trunk đang **chậm 11 commit**, không dùng.
- Worktree mới **cần `npm ci`** trước khi tin `make lint`/`make test` (đã chạy, exit 0).
- **Deploy:** migration `0007` **PHẢI `make migrate` TRƯỚC** khi deploy `apps/api` (mã đọc ràng buộc mới). Smoke-test đúng đường `POST /dang-ky`, không chỉ `/health`.

# Prompt thực thi "U Plus" — U17: Backend Đăng ký công khai + Cổng duyệt + Bảng gói dịch vụ

> **Dành cho phiên thực thi (Claude Code).** Đây là đơn vị **đầu tiên** của cụm "U Plus" (lớp thương mại U17→U21). Chạy đúng kỷ luật dự án: **một đơn vị nhỏ, TDD, coverage ≥80% tầng nghiệp vụ, commit nhỏ, review chéo trước khi coi xong.**
>
> **Spec nguồn (đọc trước khi code):** `docs/plans/U17-plan.md` + `docs/plans/COMMERCIAL-LAYER-plan.md` (đặc biệt §0b — Quyết định chốt 2026-07-17). **Luật:** `multi-tenant.md`, `security.md`, `testing.md`. **KHÔNG** đụng `gdt-adapter.md` (không gọi GDT).
> **Bộ nhớ:** `quyet-dinh-u-plus-2026-07-17.md`.

## 0. Mục tiêu đơn vị

Mở **cổng đăng ký công khai có kiểm soát** cho khách tự đăng ký → trạng thái `cho_duyet` (chưa đăng nhập được tới khi Admin duyệt ở U18). Đồng thời dựng **nền bảng gói dịch vụ linh hoạt** thay cho hạn mức hardcode, và siết **rate-limit + consent** theo chuẩn đã chốt.

## 0b. ĐỐI CHIẾU SCHEMA THẬT (kiểm 2026-07-17 từ mã) — ĐỌC TRƯỚC

> Đã đọc `packages/db/src/schema/*` + migration `0000–0006` + `apps/api/src/routes/{auth,taxAccounts}.ts`. Các điều chỉnh dưới **thay thế** mô tả cũ khi mâu thuẫn — plan gốc viết trước khi có U22–U27, vài giả định đã lỗi thời.

**KHỚP (giữ nguyên):**
- `tenants` có sẵn `trang_thai text default 'active'`, `goi_dich_vu text` (nullable), `ngay_tao`. RLS keyed theo `id`, **FORCE RLS** (migration `0000`) → INSERT tenant mới dưới role app **bị chặn** ⇒ ĐÚNG như plan lo: **bắt buộc** dùng hàm SECURITY DEFINER `dang_ky_tenant(...)` (pattern `auth_lookup_user` migration `0001`). Đã chắc chắn cần, không phải "kiểm rồi mới biết".
- `nguoi_dung`: `password_hash` **nullable** sẵn, `email` UNIQUE toàn cục, `vai_tro default 'ke_toan'`. Đăng ký ghi `vai_tro='quan_tri'`, `password_hash=null` — khớp.
- `audit_log`: append-only (trigger migration `0002`), `tenant_id NOT NULL`, cột `hanh_dong/doi_tuong/chi_tiet(jsonb)`. Ghi audit `dang_ky` phải qua `withTenant`. Có `maskSensitive` (@vat/crypto) — dùng che chi_tiet.

**LỆCH (SỬA prompt theo đây):**

1. **Migration số hiệu = `0007`** (đã có tới `0006_unique_mst_username`). Plan gốc viết `0004/0005` là SAI (đó là migration việc khác). Đặt tên `0007_dang_ky_va_goi_dich_vu.sql`.

2. **Rate-limit KHÔNG cần đấu nối từ sync-worker.** `apps/api` **ĐÃ CÓ Durable Object** `LoginLimiter` (`apps/api/src/loginLimiterDO.ts`, binding `LOGIN_LIMITER`, migrations tag v1–v3 trong `wrangler.jsonc`). Đăng ký **tái dùng chính pattern `LoginLimiter`** (thêm DO/binding tương tự cho IP đăng ký), KHÔNG import từ `apps/sync-worker`. Plan gốc nói "DO chỉ ở sync-worker" — LỖI THỜI.

3. **Cổng trạng thái login — sửa `auth_lookup_user`.** Hàm này (migration `0001`, OWNER `auth_lookup`, BYPASSRLS) trả **CỐ ĐỊNH** `(id, tenant_id, vai_tro, password_hash)` — **không có** `tenant_trang_thai`. Muốn chặn tenant ≠ active phải **sửa hàm SQL** trả thêm `tenant_trang_thai` (migration mới, giữ OWNER + GRANT cũ), HOẶC query trạng thái sau khi có `tenant_id` (dưới `withTenant`). KHÔNG query `tenants` ngoài withTenant (FORCE RLS chặn). Thay đổi hàm bảo mật → cần `security-reviewer`.

4. **Chống dò mật khẩu ĐÃ CÓ, không phải "để sau".** Login hiện đã có **khóa per-account** `getLoginLimiter` → **429 `too_many_attempts` + Retry-After** (`auth.ts` dòng 76, DO `LoginLimiter`) + verify PBKDF2 dummy chống timing (`DUMMY_HASH`). ⇒ Quyết định P8 đã đáp ứng sẵn cho login. U17 chỉ cần: (a) KHÔNG phá cơ chế này khi thêm cổng trạng thái; (b) áp khóa/limit tương tự cho `/dang-ky`. Đừng mô tả như tính năng tương lai.

5. **Hạn mức tài khoản thuế — điểm nối chính xác.** `getGioiHanTkThue(tenant: {goiDichVu})` ở `apps/api/src/routes/taxAccounts.ts:52` **hardcode return 1**, có sẵn `// TODO (U17): lấy theo GÓI DỊCH VỤ`. Bảng gói mới cấp hàm tra cứu để thay thân hàm này (**giữ nguyên chữ ký** để không vỡ call-site dòng 132). Cờ `SUB_ACCOUNT_MODULE_ENABLED=false` (dòng 58) bật theo gói khi U17 xong. Nợ TOCTOU (`task_230e0541`): đếm-rồi-insert chưa khóa — khi bật tài khoản con cần `SELECT … FOR UPDATE`.

**Chưa có (đúng — U17 tạo mới):** `trang_thai='cho_duyet'/'tu_choi'` chưa dùng đâu; `phai_doi_mat_khau`, bảng gói, `dang_ky_tenant()`, `disposableDomains.ts`, `validateEmailDangKy.ts` — tất cả mới.

---

## 1. Điểm khởi đầu — kiểm chứng từ mã (KHÔNG giả định)

Trước khi viết, đọc & xác nhận trong mã thật:
- `apps/api/src/routes/auth.ts` — `POST /auth/login`, hàm `auth_lookup_user`, hành vi khi `password_hash` null.
- `packages/db/src/schema/tenants.ts`, `nguoiDung.ts` — cột hiện có, RLS FORCE trên `tenants` keyed theo `id`.
- `apps/api/src/routes/taxAccounts.ts` — `getGioiHanTkThue` đang **hardcode** (nợ kỹ thuật chip `task_230e0541`).
- Durable Object token-bucket rate-limit hiện ở `apps/sync-worker` (`rateLimiter.ts`/`tenantLimiter.ts`) — **KHÔNG ở `apps/api`**; muốn dùng cho `/dang-ky` phải đấu nối DO namespace làm **binding mới** cho `apps/api`.

## 2. Phạm vi U17 (đã tích hợp quyết định 2026-07-17)

### 2.1 Migration
- Mở rộng `tenants.trang_thai` CHECK ∈ `('cho_duyet','active','khoa','tu_choi')`; mặc định cột giữ `active` (tương thích tenant cũ); đăng ký mới ghi tường minh `cho_duyet`. Index `(trang_thai)`.
- **Bảng gói dịch vụ linh hoạt (quyết định P13):** dựng bảng `goi_dich_vu(ma text PK, ten, so_mst_toi_da int, so_hoa_don_thang int|null, cho_tai_khoan_con bool, ...)` + seed hàng `free` (01 MST, hỗ trợ Email+cộng đồng). `tenants.goi_dich_vu` tham chiếu `ma` (mặc định `'free'`). Hạn mức đọc từ bảng này — **thay hardcode** `getGioiHanTkThue`.
- Cột `nguoi_dung.phai_doi_mat_khau boolean NOT NULL DEFAULT false` (buộc đổi MK lần đầu — dùng ở U18/U20; đặt sẵn ở U17 để migration gọn).

### 2.2 Endpoint `POST /dang-ky` (công khai, rate-limited)
```
Body: { email, tenDoanhNghiep, mst, dongYDieuKhoan: boolean }
201 { ok:true, trangThai:"cho_duyet" }
400 { error:"email_khong_hop_le" | "mst_khong_hop_le" | "chua_dong_y_dieu_khoan" | "bad_request" }
409 { error:"da_ton_tai" }
429 { error:"qua_nhieu_yeu_cau" }
```
- **Consent (P10):** `dongYDieuKhoan` **bắt buộc = true**, nếu thiếu/false → 400 `chua_dong_y_dieu_khoan`. **KHÔNG** lưu lịch sử phiên bản consent (v1.0).
- Validate email `validateEmailDangKy` (§2.4). Validate MST 10/13 số.
- Tạo `tenants(cho_duyet, goi_dich_vu='free')` + `nguoi_dung(email, quan_tri, password_hash=null, phai_doi_mat_khau=false)` trong 1 giao dịch → audit `dang_ky`.
- **INSERT tenant dưới RLS:** kiểm con đường ghi bằng integration test role production; nếu bị FORCE RLS chặn → dùng hàm SECURITY DEFINER bề mặt hẹp `dang_ky_tenant(...)` (pattern `auth_lookup_user`). **Không giả định INSERT chạy được.**
- **Rate-limit (P12):** đấu nối DO token-bucket cho `apps/api`; khóa theo IP (`CF-Connecting-IP`), ngưỡng đề xuất 5 đăng ký/IP/giờ (chốt khi code).

### 2.3 Sửa `POST /auth/login` — cổng trạng thái
- Bổ sung đọc `tenant_trang_thai`; nếu ≠ `active` → **401 gọn** (cùng mã với sai MK, chống dò). Audit `login_fail_chua_duyet`.

### 2.4 Hàm thuần `validateEmailDangKy(email)` — trọng tâm test
Thứ tự kiểm: (1) dạng hợp lệ; (2) chặn alias `+`; (3) blocklist miền dùng-1-lần (`lib/disposableDomains.ts`, danh sách tĩnh ~50 miền, offline); (4) allowlist: `gmail.com`/`yahoo.com` HOẶC đuôi tên-miền-DN hợp lệ (`.com/.com.vn/.vn/.net/.net.vn/.org`… — chốt danh sách khi code).

### 2.5 Rate-limit cơ bản mọi endpoint khách (P12)
Ngoài `/dang-ky`, áp rate-limit cơ bản (theo tenant/IP) cho các endpoint khách chính (login, tra cứu, kết xuất). Tái dùng cùng cơ chế DO. Ngưỡng rộng rãi, chỉ chống lạm dụng — chốt khi code, không chặn nhầm dùng bình thường.

## 3. Ngoài phạm vi U17
UI đăng ký (U20), Admin API/duyệt (U18), gửi email (U18), 2FA (để sau — Cloudflare Access), khóa login sai (để sau v1.0), gói trả phí (v1.0 chỉ Free — nhưng **bảng gói phải linh hoạt sẵn**).

## 4. Kiểm thử (TDD, coverage ≥80% nghiệp vụ)
- **unit:** `validateEmailDangKy` toàn ma trận; validate MST; đọc hạn mức từ bảng gói.
- **integration (Hono + PGlite, role production non-superuser):**
  - `/dang-ky` hợp lệ → 201, tạo đúng `tenants(cho_duyet,free)` + `nguoi_dung(quan_tri,null pass)` + audit.
  - Thiếu `dongYDieuKhoan` → 400, không tạo hàng.
  - Email rác → 400; email/MST trùng → 409; rate-limit vượt → 429.
  - **Cách ly:** đăng ký không chạm dữ liệu tenant khác; INSERT tenant chạy đúng dưới RLS (kiểm con đường ghi thật).
  - `/auth/login` với `cho_duyet`/`khoa`/`tu_choi` → 401 + audit; `active` → 200 (không hồi quy U8).
  - Hạn mức tài khoản thuế đọc từ **bảng gói** (không hardcode) — cho `free` = 1.

## 5. Định nghĩa hoàn thành
`make lint` sạch; `make test` xanh; coverage không tụt; không log bí mật/mật khẩu; audit `dang_ky` + `login_fail_chua_duyet` đủ; migration chạy sạch (`make migrate`); **review chéo `security-reviewer`** (chạm cách ly + cổng công khai) trước khi coi xong; commit nhỏ.
**Điểm chuyển U18:** tenant `cho_duyet` tồn tại trong DB + bảng gói linh hoạt sẵn sàng cho Admin duyệt & gán gói.

## 6. Lưu ý vận hành
- Worktree mới CẦN `npm ci` trước khi tin `make lint`/`make test`.
- Deploy: migration mới **PHẢI `make migrate` TRƯỚC** khi deploy `apps/api` (code đọc ràng buộc mới). Smoke-test đúng đường `POST /dang-ky`, không chỉ `/health`.

---
*Sau U17 xong: tiếp tục "U Plus" theo thứ tự U18 → U19 → U20 → U21 (mỗi U một prompt riêng, cùng khung này).*

# Kế hoạch triển khai Production — `vatengine.tourdao.vn`

> Trạng thái: **🟢 PRODUCTION LIVE — đã deploy U23 (2026-07-16).** Site chạy tại `https://vatengine.tourdao.vn` (same-origin, SPA U23, đủ 4 security header). Còn treo: HSTS+WAF tầng zone (Bước 5), onboarding tenant tự phục vụ (O1), verify đồng bộ HĐ thật (cần token GDT + captcha của chủ dự án).
>
> **Nhật ký deploy U23 — 2026-07-16 (đã kiểm chứng):** PR #5 (U23) squash-merge vào trục (`0c0873d`). Thứ tự đúng luật `deploy.md` (migrate TRƯỚC, deploy SAU): (1) `make migrate` áp `0006_unique_mst_username.sql` lên Neon — xác minh DB: migration #7, 2 index UNIQUE `tenants_mst_unique` + `tai_khoan_thue_tenant_username_unique` tồn tại; 0 bản trùng `mst`/`(tenant_id,username)` trước khi áp. (2) Deploy `vat-api` (Version `853b5984`, DO `LoginLimiter` v1→v2→v3 — **KHÔNG** dính `10074`), `sync-worker` (`49d7c992`), `vat-web` (`5b79b880`). (3) SPA phải **build lại** trước deploy (`vite build` không tự chạy trong `wrangler deploy`; `dist/` cũ trước U23) → bundle `index-BptFAtCS.js` đã live. (4) Smoke: `/api/health` 200 `env=production`; `POST /api/auth/login` giả → 401 (Hyperdrive→Neon thông); 4 security header đủ. **Gotcha ghi lại:** sau khi xoay mật khẩu `neondb_owner`, `packages/db/.dev.vars` (`DATABASE_URL`) phải cập nhật mật khẩu mới, nếu không `make migrate` fail `password authentication failed` (Hyperdrive dùng `vat_app` nên site KHÔNG ảnh hưởng, chỉ đường migrate CLI bị chặn).
>
> ~~KẾ HOẠCH — CHƯA THỰC THI~~ · Đưa VATCrawlbot lên production thật trên một domain, same-origin (SPA + API cùng gốc, không CORS). Tối đa **2 phase**.
>
> Nguồn "làm gì/thế nào": `CLAUDE.md` §Ngăn xếp + §Kiến trúc; ADR-0001 (Cloudflare), ADR-0003 (React+Vite). Luật áp dụng: `security.md`, `multi-tenant.md`. Quyết định hạ tầng: [[vat-quyet-dinh-ha-tang-2026-07-14]].

---

## 1. Trạng thái hiện tại (đã kiểm chứng, 2026-07-15)

| Hạng mục | Trạng thái |
|---|---|
| Backend `vat-api` + `vat-sync-worker` | ĐÃ deploy **staging** trên Workers Free, `.workers.dev`. Smoke + **login GDT thật HTTP 200** đã pass. |
| Neon (Hyperdrive `1011ff82…`, role app `vat_app` NOBYPASSRLS) | Sống, RLS kiểm chứng thật. **Có dữ liệu test** (tenant `mst=9999999999` + token MST thật). |
| Frontend `apps/web` (SPA 8 màn) + backend A1 `GET /me`, A2 `GET /tax-accounts` | XONG (`make lint` sạch, `make test` 453 xanh, security-reviewer ĐẠT) nhưng **CHƯA commit** (untracked/uncommitted). |
| Mật khẩu `neondb_owner` | **Đã lộ trong chat** → phải xoay. |
| Dry-run build (chuẩn bị deploy, không chạm production) | ✅ **Sạch 2026-07-16** trên nhánh `fordex-hardening`: `vat-api` (`wrangler deploy --dry-run`, 763 KiB), `vat-sync-worker` (506 KiB), SPA (`vite build`, 278 KiB), front-door `vat-web` (`--dry-run`, đọc 14 asset). Xác nhận binding khớp cấu hình: cả `vat-api` và `vat-sync-worker` bind **cùng** Hyperdrive `1011ff82…` (liên quan H-A.4 tách 2 config), `PBKDF2_ITERATIONS="100000"` (Free; flip 600k khi Paid — O2). |

**Điểm mấu chốt kiến trúc:** `vat-web` là SPA **tĩnh thuần** (Workers Static Assets), không route API. `vat-api` là Worker riêng ⇒ khác origin. Chọn **same-origin qua Cloudflare Worker Routes** để KHÔNG cần CORS.

## 2. Quyết định đã chốt (chủ dự án)

| Mã | Quyết định |
|---|---|
| D1 | Domain = **`vatengine.tourdao.vn`** |
| D2 | **Same-origin** qua Cloudflare Routes: `…/api/*` → `vat-api`, `…/*` → `vat-web`. Không CORS. |
| D3 | **Giữ Workers Free** (nâng Paid + khôi phục `limits` CHỈ KHI sync đụng trần CPU 10ms) |
| D4 | **Tái dùng Neon hiện tại**, dọn dữ liệu test (không tạo DB mới) |

## 3. Cách làm same-origin (kỹ thuật, không CORS) — Front-door trên `vat-web`

> **Vì sao KHÔNG dùng Routes + mount `/api`:** Cloudflare Worker Routes cần **1 bản ghi DNS proxied tạo tay** cho hostname (wrangler KHÔNG tự tạo cho `routes`). Cách dưới dùng **Custom Domain** (wrangler TỰ tạo DNS) + service binding ⇒ thực thi trọn bằng wrangler, KHÔNG đụng code/test `apps/api`, và ẩn được API.

- **`vat-web` thành Worker front-door** (thay vì assets thuần): thêm `main` + `fetch` handler + **service binding** `API` → `vat-api` + `assets` binding `ASSETS`.
  - `fetch`: `pathname` bắt đầu `/api/` → **strip `/api`** → `env.API.fetch(...)` (vat-api giữ gốc `/auth`,`/invoices`… KHÔNG đổi); còn lại → `env.ASSETS.fetch(...)` (SPA fallback).
- **Frontend build với `VITE_API_BASE=/api`** ⇒ SPA gọi `/api/...` cùng gốc.
- **Custom Domain** `vatengine.tourdao.vn` gán lên `vat-web` (wrangler tự tạo DNS proxied).
- **Ẩn `vat-api`**: `"workers_dev": false` ⇒ chỉ gọi được qua service binding (không lộ hostname công khai).

> **Điều kiện hạ tầng:** zone `tourdao.vn` đã nằm trong tài khoản Cloudflare `luutuanvu.gl@gmail.com` (chủ dự án xác nhận 2026-07-15).

## 4. Điều kiện tiên quyết (trước Phase 1)

- [ ] **U15 đã commit + merge** (apps/web + apps/api A1/A2), `make lint` + `make test` **xanh trên nhánh** → deploy từ trạng thái sạch, không phải WIP.
- [ ] Zone `tourdao.vn` sẵn trong Cloudflare (điều kiện hạ tầng ở trên).

---

## PHASE 1 — Backend production-ready

**Mục tiêu:** `vat-api` (+A1/A2) + `vat-sync-worker` chạy đúng ở chế độ production, DB sạch + an toàn. (Vẫn qua `.workers.dev` để verify; ẩn API để Phase 2.)

**Bước:**
1. **⚠️ PRECHECK Hyperdrive = `vat_app` (CHẶN — bỏ qua có thể SẬP dịch vụ).** Xác nhận cả 2 binding Hyperdrive (`1011ff82e7154531883f0f2e62d344f0`, dùng chung ở `apps/api` **và** `apps/sync-worker`) trỏ chuỗi `postgresql://vat_app:...`, KHÔNG phải `neondb_owner`. **Cách kiểm:** `wrangler hyperdrive get 1011ff82e7154531883f0f2e62d344f0` (hoặc xem trong dashboard). Nếu là owner → tạo lại config trỏ `vat_app` (`packages/db/provisioning/app-role.sql`) trước khi deploy. *(Lý do: H-A.2 `roleGuard.ts` TỪ CHỐI khởi động nếu role có `rolsuper`/`rolbypassrls`/sở-hữu-bảng — kiểm chứng ADR-0004 E1–E2: `neondb_owner` CÓ BYPASSRLS. Sai role ⇒ Worker fail-fast **mọi** request.)*
2. **⚠️ PRECHECK migration Drizzle đang chờ (CHẶN — xem `.claude/rules/deploy.md`, sự cố thật 2026-07-16).** `wrangler deploy` KHÔNG tự chạy migration DB. So `packages/db/migrations/meta/_journal.json` với lần `make migrate` gần nhất đã chạy trên production; nếu có migration mới hơn (kể cả migration mang theo từ nhánh khác merge vào) → **chạy `make migrate` TRƯỚC bước 5 (deploy code)**, không phải sau. Mọi migration trong repo cộng dồn/idempotent (`ADD COLUMN IF NOT EXISTS`) nên chạy lại luôn AN TOÀN kể cả khi không chắc đã áp — không suy đoán.
3. **Dọn DB:** `delete from tenants where mst='9999999999';` (cascade xoá user/tài khoản thuế/token test).
4. **Xoay mật khẩu `neondb_owner`** trên Neon console (chủ dự án) → cập nhật `DATABASE_URL` trong `packages/db/.dev.vars`. Chỉ ảnh hưởng credential migrate; Hyperdrive dùng `vat_app` — KHÔNG đổi. *(Không chặn deploy — có thể làm song song.)*
5. Thêm `"vars": { "ENVIRONMENT": "production" }` vào `apps/api/wrangler.jsonc` (KHÔNG đụng code app — same-origin xử lý ở `vat-web`).
6. **Deploy** `vat-api` + `vat-sync-worker` (bản đã commit, có A1/A2) — **CHỈ sau khi bước 2 đã xong**. **Lưu ý migration Durable Object:** `vat-api` mang DO `LOGIN_LIMITER` (migration `v1`, H-A.5b) và `vat-sync-worker` mang `TENANT_LIMITER`/`EGRESS_HEALTH` — `wrangler deploy` tự áp migration DO; xác nhận log **không lỗi migration**.

**Definition of Done (bằng chứng bắt buộc):**
- [ ] **roleGuard qua:** Worker khởi động được (không fail-fast) ⇒ Hyperdrive role hợp lệ (`vat_app`). Nếu deploy xong `/health` trả 5xx đồng loạt + log báo role → precheck bước 1 sai.
- [ ] `curl https://vat-api.<...>.workers.dev/health` → **200** `{"status":"ok","env":"production"}`. *(Lưu ý: `/health` KHÔNG đụng schema mới — 200 ở đây KHÔNG chứng minh migration đã áp, xem mục DoD kế tiếp.)*
- [ ] `POST /auth/login` email giả → **401** (Hyperdrive→Neon thông).
- [ ] **`GET /me` với session thật ngay sau một lượt đăng nhập thật** (không chỉ JWT seed dựng tay) → 200, không 500. *(Đây là smoke test đụng đúng cột schema mới nhất — JWT seed dựng tay có thể né qua cột mới nếu seed cũ; sự cố 2026-07-16 chỉ lộ ra khi đăng nhập thật.)*
- [ ] `GET /tax-accounts` (A1/A2) trả đúng.
- [ ] Query DB: KHÔNG còn tenant `mst=9999999999`.

---

## PHASE 2 — Front-door same-origin + Frontend + go-live đầu-cuối

**Mục tiêu:** SPA + API cùng gốc `https://vatengine.tourdao.vn`, dùng được đầu-cuối qua trình duyệt.

**Bước:**
1. **Build SPA:** `VITE_API_BASE=/api npm run build -w apps/web` → `apps/web/dist/`.
2. **`vat-web` thành front-door** (§3): thêm `main` `src/index.ts` (fetch: `/api/*`→strip→`env.API.fetch`; else `env.ASSETS.fetch`) + `wrangler.jsonc` thêm `assets.binding=ASSETS`, `services:[{binding:API,service:vat-api}]`, `routes`/`custom_domains` = `vatengine.tourdao.vn`.
3. **Ẩn API:** `"workers_dev": false` ở `apps/api/wrangler.jsonc` → redeploy `vat-api`.
4. **Deploy** `vat-web` (tự tạo DNS cho custom domain).
5. **Onboarding tenant thật đầu tiên:** seed 1 tenant + user thật (SQL tay tạm — xem mục treo O1).
6. **Kiểm chứng đầu-cuối trên trình duyệt:** mở `https://vatengine.tourdao.vn` → SPA load → đăng nhập nội bộ → màn Kết nối thuế → login GDT (UI hoặc `scripts/gdt-login.cjs` trỏ domain) → **đồng bộ hóa đơn thật** → thấy hóa đơn trên UI.

**Definition of Done (bằng chứng bắt buộc):**
- [ ] Mở domain trên trình duyệt: SPA render (không màn trắng), gọi `/api/...` cùng gốc **không lỗi CORS**.
- [ ] Đăng nhập nội bộ → thấy Dashboard + danh sách (dữ liệu tenant thật).
- [ ] **Đồng bộ hóa đơn thật thành công** → hóa đơn hiện trên S1/S2. *(Nếu đụng trần CPU 10ms → kích hoạt mục treo O2.)*
- [ ] **Bảo mật biên (H-A.6):** `curl -I https://vatengine.tourdao.vn` thấy đủ `content-security-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy` (do front-door `vat-web` phát — tự động).
- [ ] **HSTS ở TẦNG ZONE Cloudflare** (front-door CỐ Ý không phát HSTS — chỉ bật trên HTTPS, phủ cả redirect): bật `SSL/TLS → Edge Certificates → Always Use HTTPS` **và** `HSTS` (`max-age ≥ 15552000`, `includeSubDomains`) cho zone `tourdao.vn`; xác minh `curl -I` thấy `strict-transport-security`. *(Không có bước này ⇒ site chạy HTTPS nhưng KHÔNG có HSTS ở bất kỳ tầng nào — rủi ro SSL-stripping.)*
- [ ] **WAF Rate-limit per-IP cho login (H-A.5b — lớp EDGE của phòng thủ 2 lớp):** Cloudflare `Security → WAF → Rate limiting rules` cho `tourdao.vn`: match `http.request.uri.path eq "/api/auth/login" and http.request.method eq "POST"`, ngưỡng ví dụ **10 req / 1 phút / IP**, action **Block** (hoặc Managed Challenge), thời gian chặn ~1 phút. *(Lớp app đã có: Durable Object `LoginLimiter` khóa per-account — chặn dò 1 tài khoản qua nhiều IP mà WAF per-IP không thấy. Hai lớp bù nhau: WAF chặn 1 IP dò nhiều tài khoản; DO chặn nhiều IP dò 1 tài khoản.)* Xác minh: gửi >ngưỡng POST/phút từ 1 IP → nhận 429 từ Cloudflare (trước cả khi chạm Worker).

---

## 5. Mục treo & rủi ro (ngoài 2 phase, quyết khi gặp)

| Mã | Mục | Xử lý |
|---|---|---|
| **O1** | **Onboarding tenant tự phục vụ CHƯA có** — tạo tenant/user bằng SQL tay. Tầm nhìn 100k khách cần luồng đăng ký/admin. | **Hạng mục sản phẩm riêng**, không thuộc deploy. Tạm: seed SQL cho khách đầu. **⚠️ Khi xây luồng tạo user/đặt mật khẩu (H-A.5a):** PHẢI gọi `hashPassword(pw, resolvePbkdf2Iterations(c.env))` (KHÔNG dùng mặc định) để var `PBKDF2_ITERATIONS` (flip 600k khi Paid) thực sự có tác dụng. |
| **O2** | **Trần CPU 10ms (Free)** — sync HĐ nặng có thể vượt. | Nếu Phase 2 DoD sync fail vì CPU → **nâng Workers Paid ($5)** + bỏ comment `limits` ở 2 `wrangler.jsonc` → deploy lại. **Kèm khi lên Paid (H-A.5a):** đổi `PBKDF2_ITERATIONS` trong `apps/api/wrangler.jsonc` từ `"100000"` → `"600000"` (OWASP) — 600k ~42ms vượt trần Free 10ms nên chỉ bật sau Paid; hash cũ vẫn verify (định dạng tự mô tả số vòng). |
| **O3** | A3 remember-me (cookie HttpOnly) + A4 quên-mật-khẩu(email) còn treo (S0 hiện "sắp có"). | Tách unit sau go-live. **Ghi chú H-A.5b:** khóa đăng nhập per-account (DO) đánh đổi có chủ đích — kẻ xấu biết email nạn nhân có thể khóa TẠM ~15' (khóa tự hết hạn, không vĩnh viễn). Khi làm **A4 (reset-password qua email)**, đó cũng là **kênh tự mở khóa** cho chủ tài khoản hợp lệ → hạ rủi ro account-lockout DoS. |
| **O4** | Test tự động chạy PGlite, KHÔNG đụng Neon thật (bài học migration 0001). | Cân nhắc nhóm test `db-real` trên Neon branch — hạng mục riêng. |

## 6. Rollback

- **Route:** gỡ Worker Routes → traffic ngừng vào domain; các Worker vẫn truy cập được qua `.workers.dev` (staging).
- **Worker:** `wrangler rollback` về version trước (Phase 1/2 độc lập version).
- **DB:** dọn test data là thao tác không hồi — nhưng chỉ xoá dữ liệu test, không đụng schema/role.

## 7. Ranh giới (không vượt)

- Thanh toán/nâng Paid, đổi nameserver zone, nhập mật khẩu thuế/captcha: **chủ dự án tự làm** (Claude không nhập credential/không giải captcha — `security.md`).
- Mọi secret qua `wrangler secret` / Neon console, KHÔNG commit.

## Phụ lục A — Chuỗi lệnh (CHỦ DỰ ÁN chạy; Claude soạn, KHÔNG chạy production)

> Soạn 2026-07-16 (HANDOFF-DEPLOY §26.3). Chạy **tuần tự** từ gốc repo; mỗi bước có kiểm chứng — **dừng nếu kiểm chứng fail**. `<...>` = giá trị điền theo tài khoản. KHÔNG chạy khi nhánh chưa hợp nhất về nhánh chính sạch (§4 điều kiện tiên quyết).

**Bước 0 — build sạch (an toàn, lặp lại được, không chạm production):**
```sh
npm run -w apps/api  deploy -- --dry-run --outdir /tmp/dr-api     # → EXIT 0, in bindings
npm run -w apps/sync-worker deploy -- --dry-run --outdir /tmp/dr-sync  # → EXIT 0
VITE_API_BASE=/api npm run -w apps/web build                      # → dist/ dựng xong
```
_Kiểm chứng:_ cả 3 EXIT 0 (đã xác nhận 2026-07-16 trên `fordex-hardening`).

**Bước 1 — PRECHECK Hyperdrive = `vat_app` (CHẶN):**
```sh
wrangler hyperdrive get 1011ff82e7154531883f0f2e62d344f0
```
_Kiểm chứng:_ connection string là `vat_app@...`, KHÔNG `neondb_owner`. Nếu sai → tạo lại config (`packages/db/provisioning/app-role.sql`) rồi lặp lại.

**Bước 1b — ⚠️ PRECHECK + áp migration Drizzle đang chờ (CHẶN — `.claude/rules/deploy.md`):**
```sh
DATABASE_URL="$(grep '^DATABASE_URL=' packages/db/.dev.vars | cut -d= -f2-)" npm run migrate -w packages/db
```
_Kiểm chứng:_ `[✓] migrations applied successfully!`. **Chạy TRƯỚC Bước 2 mọi lần**, kể cả khi không chắc đã có migration mới — an toàn để chạy lại (idempotent). Bỏ qua bước này là nguyên nhân sự cố "đăng nhập vỡ" 2026-07-16 (`/me` 500 vì cột `ban_quyen`/`ghi_chu` chưa có trên DB dù code đã deploy).

**Bước 2 — Phase 1 backend (sau khi dọn DB + xoay owner theo §PHASE 1):**
```sh
npm run -w apps/api deploy            # áp DO migration LOGIN_LIMITER v1 — xem log KHÔNG lỗi
npm run -w apps/sync-worker deploy    # DO TENANT_LIMITER / EGRESS_HEALTH
curl -s https://vat-api.<subdomain>.workers.dev/health   # → 200 {"status":"ok","env":"production"}
```
_Kiểm chứng:_ `/health` 200 ⇒ roleGuard qua (role hợp lệ). 5xx đồng loạt + log role ⇒ Bước 1 sai. **Sau đó đăng nhập thật qua UI → xác nhận `/me` KHÔNG 500** (`/health` không đụng schema, không đủ để kết luận an toàn).

**Bước 3 — Phase 2 front-door + ẩn API (chi tiết §PHASE 2 bước 2–4):**
```sh
# (đã build SPA ở Bước 0 với VITE_API_BASE=/api)
# apps/api/wrangler.jsonc: "workers_dev": false   → rồi:
npm run -w apps/api deploy
npm run -w apps/web deploy             # front-door + tự tạo DNS custom domain
curl -I https://vatengine.tourdao.vn   # → 200 + CSP/XFO/nosniff/Referrer (H-A.6)
```
_Kiểm chứng đầu-cuối:_ theo DoD Phase 2 (SPA render, login, đồng bộ HĐ thật).

**Bước 4 — Sau go-live (dashboard Cloudflare, không phải wrangler):** bật HSTS + Always-HTTPS zone (H-A.6) và WAF rate-limit `/api/auth/login` (H-A.5b) — xem DoD Phase 2. Xác minh: `curl -I` thấy `strict-transport-security`; POST login >ngưỡng/phút từ 1 IP → 429.

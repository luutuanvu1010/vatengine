# Kế hoạch triển khai Production — `vatengine.tourdao.vn`

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA THỰC THI.** Đưa VATCrawlbot lên production thật trên một domain, same-origin (SPA + API cùng gốc, không CORS). Tối đa **2 phase**.
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
1. **Dọn DB:** `delete from tenants where mst='9999999999';` (cascade xoá user/tài khoản thuế/token test).
2. **Xoay mật khẩu `neondb_owner`** trên Neon console (chủ dự án) → cập nhật `DATABASE_URL` trong `packages/db/.dev.vars`. Chỉ ảnh hưởng credential migrate; Hyperdrive dùng `vat_app` — KHÔNG đổi. *(Không chặn deploy — có thể làm song song.)*
3. Thêm `"vars": { "ENVIRONMENT": "production" }` vào `apps/api/wrangler.jsonc` (KHÔNG đụng code app — same-origin xử lý ở `vat-web`).
4. **Deploy** `vat-api` + `vat-sync-worker` (bản đã commit, có A1/A2).

**Definition of Done (bằng chứng bắt buộc):**
- [ ] `curl https://vat-api.<...>.workers.dev/health` → **200** `{"status":"ok","env":"production"}`.
- [ ] `POST /auth/login` email giả → **401** (Hyperdrive→Neon thông).
- [ ] `GET /me` (kèm JWT seed) + `GET /tax-accounts` (A1/A2) trả đúng.
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

---

## 5. Mục treo & rủi ro (ngoài 2 phase, quyết khi gặp)

| Mã | Mục | Xử lý |
|---|---|---|
| **O1** | **Onboarding tenant tự phục vụ CHƯA có** — tạo tenant/user bằng SQL tay. Tầm nhìn 100k khách cần luồng đăng ký/admin. | **Hạng mục sản phẩm riêng**, không thuộc deploy. Tạm: seed SQL cho khách đầu. |
| **O2** | **Trần CPU 10ms (Free)** — sync HĐ nặng có thể vượt. | Nếu Phase 2 DoD sync fail vì CPU → **nâng Workers Paid ($5)** + bỏ comment `limits` ở 2 `wrangler.jsonc` → deploy lại. |
| **O3** | A3 remember-me (cookie HttpOnly) + A4 quên-mật-khẩu(email) còn treo (S0 hiện "sắp có"). | Tách unit sau go-live. |
| **O4** | Test tự động chạy PGlite, KHÔNG đụng Neon thật (bài học migration 0001). | Cân nhắc nhóm test `db-real` trên Neon branch — hạng mục riêng. |

## 6. Rollback

- **Route:** gỡ Worker Routes → traffic ngừng vào domain; các Worker vẫn truy cập được qua `.workers.dev` (staging).
- **Worker:** `wrangler rollback` về version trước (Phase 1/2 độc lập version).
- **DB:** dọn test data là thao tác không hồi — nhưng chỉ xoá dữ liệu test, không đụng schema/role.

## 7. Ranh giới (không vượt)

- Thanh toán/nâng Paid, đổi nameserver zone, nhập mật khẩu thuế/captcha: **chủ dự án tự làm** (Claude không nhập credential/không giải captcha — `security.md`).
- Mọi secret qua `wrangler secret` / Neon console, KHÔNG commit.

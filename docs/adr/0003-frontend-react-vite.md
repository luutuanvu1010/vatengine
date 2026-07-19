# ADR-0003 — Ngăn xếp Frontend: React + Vite SPA trên Cloudflare Workers Static Assets

- **Trạng thái:** 🟢 **Đã chốt (Accepted)** — 2026-07-14, chủ dự án duyệt cả 3 điểm theo đề xuất (#1 React+Vite · #2 gồm màn kết nối thuế · #3 JWT in-memory). Dự thảo do Claude (vai Orchestrator) soạn; quyết định thuộc chủ dự án (CLAUDE.md §3). · **Sửa đổi 2026-07-19 — Amendment #1 (DỰ THẢO, chờ duyệt): #3 chuyển JWT in-memory → cookie `HttpOnly`.**
- **Liên quan:** cụ thể hoá **ADR-0001 mục 6** ("Frontend: React/Next.js hoặc SvelteKit trên Cloudflare Pages / Workers Static Assets" — để mở) và giải 3 điểm mơ hồ trong `docs/plans/U15-plan.md` (#1 ngăn xếp · #2 phạm vi · #3 lưu JWT). Điều kiện tiên quyết để lập `docs/06-BINDING_MAP.md` và chạy Claude Design (hard-stop CLAUDE.md §3 vai Design).
- **Người quyết định:** Chủ dự án (luutuanvu.gl@gmail.com).
- **Phạm vi ảnh hưởng:** thêm service `apps/web` (chưa có); `Makefile`/CI (đưa test web vào `make lint`/`make test`); `README.md`; đánh dấu `frontend/index.html` là PoC lịch sử. **Không** đụng `apps/api`, `packages/*` (trừ import kiểu chia sẻ an toàn).

---

## Amendment #1 (2026-07-19) — DỰ THẢO, CHỜ DUYỆT: #3 chuyển từ JWT in-memory sang cookie `HttpOnly`

> **Trạng thái: 🟡 DỰ THẢO.** Chưa được chủ dự án duyệt ⇒ **chưa có hiệu lực**, **chưa được viết code**. Quyết định thuộc chủ dự án (CLAUDE.md §3). Mục §A.8 là nơi ghi quyết định.
>
> **Kích hoạt:** chủ dự án báo "mỗi lần tải lại trang với Reload thì phải đăng nhập lại" (2026-07-19). Điều tra xác nhận **đây không phải lỗi** — đúng hành vi mà quyết định #3 bản gốc mô tả. Amendment này **không đính chính một tiền đề sai**; nó xét lại một **đánh đổi** khi bối cảnh đã đổi.

### A.1 Vì sao xét lại một quyết định đã chốt

Quyết định #3 (2026-07-14) chốt khi `apps/web` **chưa tồn tại** và sản phẩm còn là app nội bộ chưa có người dùng. Nay (2026-07-19) hệ đã **production LIVE** trên `vatengine.tourdao.vn` với người dùng thật. Chi phí của "đăng nhập lại mỗi lần tải trang" đã chuyển từ *lý thuyết* sang *ma sát vận hành đo được*: mỗi lần F5 là một lần gõ lại mật khẩu.

Quan trọng: **phương án thay thế nằm sẵn trong chính quyết định gốc**, không phải phát minh mới. Nguyên văn bảng §2 dòng #3:

> **In-memory + đăng nhập lại khi tải trang**; nếu cần nhớ phiên → **cookie `HttpOnly` do Worker phát**, KHÔNG `localStorage`

Amendment này **kích hoạt nhánh đã dự phòng** đó. Nguyên tắc bảo mật nền (`security.md`: tối thiểu lộ bí mật, chống XSS-exfil) **giữ nguyên, không nới lỏng** — xem §A.5.

### A.2 Bằng chứng mới (kiểm chứng 2026-07-19) — địa hình cho phép cấu hình cookie mạnh nhất

Năm 2026-07-14 chưa có `apps/web` nên **chưa ai biết topology triển khai thật**. Nay đã có, và nó quyết định tính khả thi:

| Câu hỏi | Kết quả | Nguồn (đọc file, tái lập được) |
|---|---|---|
| Web và API có **cùng origin**? | ✅ **Có** — SPA và `/api/*` cùng phục vụ từ `vatengine.tourdao.vn`; front-door bóc tiền tố `/api` rồi gọi `vat-api` qua **service binding** | `apps/web/worker.ts:46-51`; `apps/web/wrangler.jsonc` (`services: [{binding:"API", service:"vat-api"}]`, `routes: vatengine.tourdao.vn`) |
| `vat-api` có **lộ ra public**? | ✅ **Không** — `workers_dev: false` và **không khai báo `routes`** ⇒ không có hostname công khai, chỉ tới được qua service binding | `apps/api/wrangler.jsonc` |
| Có **CORS** phải xử lý? | ✅ **Không** — `grep -rn "cors\|Access-Control" apps/api/src` (trừ test) = **0 kết quả**; comment `worker.ts:3` ghi rõ "Same-origin ⇒ KHÔNG cần CORS" | `apps/api/src/**` |
| TTL token nội bộ hiện tại | **8 giờ** (`TOKEN_TTL_SEC = 8 * 60 * 60`) | `apps/api/src/auth.ts:14` |
| Đã có cơ chế refresh/cookie nào chưa? | ❌ **Chưa** — `grep -rn "refresh\|Set-Cookie\|HttpOnly" apps/api/src` (trừ test) = **0 kết quả** | `apps/api/src/**` |

**Hệ quả:** vì same-origin, cookie dùng được **`SameSite=Strict`** — mức chặt nhất. Đây là điểm khác biệt lớn so với kịch bản cross-origin (buộc `SameSite=None`, mở lại bề mặt CSRF). Địa hình hiện tại là **kịch bản thuận lợi nhất có thể** cho HttpOnly cookie.

### A.3 Quyết định đề xuất

**Thay #3: JWT chuyển từ biến in-memory sang cookie `HttpOnly` do `vat-api` phát. Thời hạn phiên giữ nguyên 8 giờ, khớp đúng `exp` của JWT hiện có.**

Chủ dự án đã chọn phương án **8 giờ** (2026-07-19) trong ba phương án được trình: 8h khớp JWT · nhớ dài ngày (7–30 ngày) · đến khi đóng trình duyệt.

**Vì sao 8 giờ, không phải dài hơn:** giải quyết **trọn vẹn** phàn nàn thực tế (reload không mất phiên) mà **không** phải dựng hạ tầng refresh-token (bảng lưu, xoay vòng, thu hồi, phát hiện tái sử dụng token đánh cắp). TTL không đổi ⇒ cửa sổ rủi ro nếu rò token **không tăng một giây nào** so với hiện tại. Đây là thay đổi **nhỏ nhất** đạt được mục tiêu — đúng tinh thần "giữ thay đổi nhỏ, đúng phạm vi" (CLAUDE.md §8).

### A.4 Hợp đồng kỹ thuật (ràng buộc cho spec U-tiếp-theo, chưa phải code)

| # | Ràng buộc | Lý do |
|---|---|---|
| C1 | Cookie: `HttpOnly` · `Secure` · `SameSite=Strict` · `Max-Age=28800` (= 8h, khớp `exp` JWT) | `HttpOnly` ⇒ JS **không đọc được** ⇒ XSS không exfil được token (đúng mục tiêu gốc của #3). `Strict` khả thi nhờ §A.2. |
| C2 | `POST /auth/login` **ngừng trả token trong body**; chỉ `Set-Cookie` + body `{ok:true}` | Nếu vẫn trả token trong body thì JS lại cầm token ⇒ **triệt tiêu toàn bộ lợi ích** của C1. Đây là điểm dễ làm hỏng nhất. |
| C3 | `requireTenant` đọc token theo thứ tự: **cookie trước**, `Authorization: Bearer` sau (fallback) | Giữ test hiện có xanh + cho client không-trình-duyệt. **Không** làm yếu C1: kẻ tấn công vẫn không có đường lấy token. |
| C4 | Thêm **`POST /auth/logout`** — `Set-Cookie` với `Max-Age=0` | Hiện logout chỉ xoá biến in-memory (`auth-context.tsx:69`). Với cookie, **không có endpoint này thì logout không thực sự đăng xuất** — cookie vẫn sống. Bắt buộc, không tuỳ chọn. |
| C5 | Cookie `Path=/` (khuyến nghị), **không** `Path=/auth` | ⚠️ **Bẫy:** `vat-api` thấy path `/auth/login`, nhưng **trình duyệt** thấy `/api/auth/login` (front-door bóc `/api` — `worker.ts:49`). Đặt `Path=/auth` ⇒ trình duyệt **không bao giờ gửi cookie**, tính năng hỏng câm. |
| C6 | Kiểm **`Origin`/`Sec-Fetch-Site`** trên mọi method đổi trạng thái (POST/PATCH/DELETE) | Phòng thủ nhiều lớp. `SameSite=Strict` đã chặn CSRF gần như trọn vẹn; đây là lớp thứ hai, rẻ, vì API chỉ nhận same-origin (§A.2). |
| C7 | Thêm **proxy `/api` vào `vite.config.ts`** (dev → `http://localhost:8787`) | ⚠️ **Bẫy:** dev hiện chạy `vite` cổng 5173 **không có proxy**; `make run` chỉ chạy `apps/api`. Nếu dev là cross-origin thì `SameSite=Strict` **chặn cookie ⇒ hỏng dev cục bộ** dù production chạy tốt. Proxy làm dev same-origin **giống hệt** production. |
| C8 | SPA thêm trạng thái khởi động thứ ba: `checking` (ngoài `anon`/`authed`); boot → gọi `/me`; 401 → `anon` | Hiện `useState<AuthStatus>("anon")` (`auth-context.tsx:24`) là nhị phân. Không có `checking`, router sẽ **nháy màn Login** rồi mới nhảy vào app — trải nghiệm tệ hơn cả vấn đề đang sửa. |
| C9 | Ranh giới phiên **MỚI** (boot-với-cookie-sẵn-có) phải gọi đủ bước dọn H-B.3: `queryClient.clear()` + `clearInvoiceFilter()` khi `/me` trả 401 | **Bắt buộc bởi `.claude/rules/multi-tenant.md`** — luật ghi rõ *"Bất kỳ luồng đổi tenant MỚI nào bắt buộc gọi cùng bước dọn này"*. Bỏ qua ⇒ rò dữ liệu tenant trên máy dùng chung (rủi ro pháp lý cao nhất của SaaS này). |

### A.5 Nguyên tắc bảo mật: giữ nguyên, không nới lỏng

Cần nói rõ để không ai hiểu nhầm amendment này là "hạ chuẩn bảo mật đổi lấy tiện lợi":

- **`localStorage` vẫn bị cấm tuyệt đối** cho token — quyết định gốc không hề bị lật ở điểm này.
- **`sessionStorage` cũng bị loại** — JS đọc được nên vi phạm **đúng lý do** khiến `localStorage` bị cấm; nó chỉ đổi "reload" thành "đóng tab", không giải quyết gốc.
- Cookie `HttpOnly` **an toàn hơn hiện trạng ở một điểm quan trọng**: hôm nay token nằm trong biến JS ⇒ XSS đọc được; sau amendment JS **không có đường chạm vào token**.
- Đánh đổi thật (không giấu): cookie tự động gửi kèm request ⇒ mở bề mặt **CSRF** vốn không tồn tại với Bearer thủ công. Vá bằng C1 (`SameSite=Strict`) + C6 (kiểm `Origin`). Đây là đánh đổi **đã biết và đã có biện pháp**, không phải rủi ro bỏ ngỏ.
- TTL **không đổi** (8h) ⇒ cửa sổ rủi ro nếu token rò **không tăng**.

### A.6 Phạm vi ảnh hưởng

- `apps/api`: `src/routes/auth.ts` (phát cookie ở login, thêm logout), `src/auth.ts` (`requireTenant` đọc cookie), middleware kiểm `Origin`.
- `apps/web`: `src/lib/apiClient.ts` (bỏ token in-memory, thêm `credentials: "same-origin"`), `src/features/auth/auth-context.tsx` (trạng thái `checking`, boot gọi `/me`, logout gọi endpoint), `vite.config.ts` (proxy dev).
- Test: bổ sung ca cookie/logout/CSRF/boot-restore; ca `Bearer` hiện có **phải vẫn xanh** (C3).
- **Không đụng:** `packages/*`, `apps/sync-worker`, schema DB, `vat-api` wrangler config.

### A.7 Giới hạn của bằng chứng (không phóng đại)

- Bằng chứng §A.2 là **đọc cấu hình + mã nguồn** (tái lập bằng `grep`/`cat` đã dẫn), **không phải** probe HTTP thật vào production. Kết luận "same-origin, không CORS, api không public" suy từ file cấu hình đã deploy — mức tin cậy cao nhưng **chưa** có phép thử runtime xác nhận `Set-Cookie` thực sự đi xuyên service binding tới trình duyệt.
- **Phép kiểm chứng bắt buộc trước khi coi là xong:** một test tích hợp (hoặc probe thủ công trên môi trường triển khai) xác nhận `Set-Cookie` do `vat-api` phát **đi qua** `withSecurityHeaders` (`worker.ts:34-41`, tạo `new Response(res.body, res)`) và tới được trình duyệt với domain `vatengine.tourdao.vn`. Đây là mắt xích **chưa kiểm chứng** duy nhất của thiết kế — nếu nó gãy, C1–C5 vô nghĩa.
- Hành vi cụ thể của trình duyệt với `SameSite=Strict` sau reload/điều hướng ngoài **chưa được kiểm trên môi trường thật của dự án** — cần E2E xác nhận.

### A.8 Quyết định của chủ dự án

- [x] **Thời hạn phiên: 8 giờ**, khớp `exp` JWT hiện tại (chọn 2026-07-19).
- [x] **A#1** — Duyệt chuyển #3 từ JWT in-memory sang cookie `HttpOnly` theo hợp đồng §A.4 (C1–C9). **(Chủ dự án duyệt 2026-07-19.)**
- [x] **A#2** — Duyệt `Path=/` (C5) thay vì scope hẹp `/api` (đổi lại: cookie gửi kèm cả request asset — chi phí băng thông nhỏ, không ảnh hưởng bảo mật). **(Chủ dự án duyệt 2026-07-19.)**

**A#1 đã được tick (2026-07-19) ⇒ Amendment #1 CÓ HIỆU LỰC.** Hợp đồng §A.4 (C1–C9) đóng vai trò spec cho đơn vị hiện thực; §A.7 là phép kiểm chứng bắt buộc trước khi coi là xong.

---

## 1. Bối cảnh

U0–U14 là backend headless (API Worker `apps/api` + sync-worker). Tầng trình bày (lớp 3 trong kiến trúc) **chưa có** — chỉ còn PoC một file `frontend/index.html` không nối API Cloudflare. U15 khép lỗ hổng này bằng một SPA tiêu thụ API nội bộ đã kiểm thử (U6–U14).

Trước khi lập **`06-BINDING_MAP`** (ánh xạ dữ liệu API → bề mặt) và trước khi dùng **Claude Design** (thiết kế UI), Hiến pháp buộc chốt ngăn xếp — nếu không, mọi quyết định bề mặt sẽ treo trên một nền chưa xác định. ADR này đề xuất chốt để mở khoá bước tiếp.

## 2. Quyết định đề xuất

**Ngăn xếp: React + TypeScript + Vite (SPA client-render), triển khai bằng Cloudflare Workers Static Assets, cùng account với `apps/api`.**

- **Dữ liệu:** TanStack Query (cache/retry/trạng thái tải).
- **Validate/form:** Zod (tái dùng kiểu từ `@vat/query`/`packages/*` khi chia sẻ an toàn).
- **i18n:** tiếng Việt trước (`lang="vi"`), khung đa ngữ để mở rộng.
- **Kiểm thử:** Vitest + Testing Library (unit/component, jsdom) + Playwright (E2E happy-path) — nối vào `make lint`/`make test` sẵn có (Biome + `tsc --noEmit`).
- **Kết nối API:** SPA gọi thẳng `apps/api` qua HTTPS; dùng **Service Binding** nếu sau này gộp origin. Không thêm endpoint backend trong U15.

### Giải các điểm mơ hồ của U15-plan

| Điểm | Quyết định đề xuất | Lý do |
|---|---|---|
| **#1 Ngăn xếp** | **React + Vite SPA** | Dữ liệu per-tenant nằm SAU đăng nhập → không cần SSR/SEO; SPA đơn giản nhất trên Static Assets. Next.js chỉ cần nếu có trang marketing SSR; SvelteKit nếu tối ưu bundle. |
| **#2 Phạm vi** | **Gồm luôn màn "Kết nối tài khoản thuế" (login GDT + captcha)** | Điểm mơ hồ #2 cũ fence màn này vì "chưa có backend ghi token" — **U14 đã giải** (4 endpoint `/tax-accounts/*`). Nay đủ điều kiện đưa vào. Captcha **do người dùng nhập** (Hiến pháp — không tự giải). |
| **#3 Lưu JWT** | **In-memory + đăng nhập lại khi tải trang**; nếu cần nhớ phiên → **cookie `HttpOnly` do Worker phát**, KHÔNG `localStorage` | `security.md`: tối thiểu lộ bí mật, chống XSS-exfil; token nội bộ 8h. |

## 3. Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **React + Vite SPA** (đề xuất) | Đơn giản nhất cho app sau đăng nhập; hệ sinh thái React/TanStack/Zod trưởng thành; build tĩnh hợp Workers Static Assets; rủi ro thấp | Không SSR (không cần cho app nội bộ); tự lo routing/guard |
| **Next.js** | SSR/SEO, routing sẵn, React Server Components | Thừa cho app per-tenant sau login; nặng hơn; phức tạp deploy trên Cloudflare |
| **SvelteKit** | Bundle nhỏ, DX tốt | Hệ sinh thái nhỏ hơn; đội phải học; ít ví dụ Cloudflare hơn |

**Khuyến nghị:** React + Vite cho giai đoạn đầu (rủi ro thấp nhất, đúng nhu cầu). Mở đường đổi sang Next.js **chỉ khi** phát sinh trang marketing công khai cần SSR/SEO.

## 4. Hệ quả

- **Tích cực:** mở khoá `06-BINDING_MAP` + Claude Design; một ngôn ngữ (TS) toàn monorepo; test nối vào cổng DoD sẵn có; giao được "sản phẩm đọc + kết xuất + đối chiếu + kết nối tài khoản thuế" hoàn chỉnh.
- **Chi phí/nợ:** thêm service `apps/web` (build/CI); phải tự dựng routing + RBAC guard client; E2E thật cần backend deploy được (test U15 dùng API giả/PGlite để không bị chặn).
- **Vẫn fenced (chờ đơn vị backend khác, KHÔNG thuộc U15):** Cổng Admin (quản lý tenant/người dùng), nút "Đồng bộ ngay" (chưa có endpoint HTTP trigger sync), màn lịch sử đồng bộ (`lan_dong_bo` chưa có route đọc), webhook/pull kế toán.

## 5. Quyết định của chủ dự án (2026-07-14)

- [x] **#1** — **React + Vite SPA** (duyệt theo đề xuất).
- [x] **#2** — **Có**, đưa màn "Kết nối tài khoản thuế" (login GDT + captcha) vào U15 (U14 đã có backend `/tax-accounts/*`).
- [x] **#3** — **JWT in-memory** + đăng nhập lại khi tải trang (duyệt theo đề xuất). · ⚠️ **2026-07-19: đang có Amendment #1 (DỰ THẢO, chờ duyệt)** đề xuất chuyển sang cookie `HttpOnly` — quyết định này **vẫn đang có hiệu lực** cho tới khi §A.8 được tick.

**Hệ quả:** `docs/06-BINDING_MAP.md` chuyển thành **nguồn chính thức cho vai Design / Claude Design**. Bước tiếp: nghiên cứu định dạng đầu vào Claude Design (CHƯA KIỂM CHỨNG — tra tài liệu Anthropic chính thức trước), rồi thiết kế, rồi U15.0 (dựng `apps/web`).

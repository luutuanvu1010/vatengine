# ADR-0003 — Ngăn xếp Frontend: React + Vite SPA trên Cloudflare Workers Static Assets

- **Trạng thái:** 🟢 **Đã chốt (Accepted)** — 2026-07-14, chủ dự án duyệt cả 3 điểm theo đề xuất (#1 React+Vite · #2 gồm màn kết nối thuế · #3 JWT in-memory). Dự thảo do Claude (vai Orchestrator) soạn; quyết định thuộc chủ dự án (CLAUDE.md §3).
- **Liên quan:** cụ thể hoá **ADR-0001 mục 6** ("Frontend: React/Next.js hoặc SvelteKit trên Cloudflare Pages / Workers Static Assets" — để mở) và giải 3 điểm mơ hồ trong `docs/plans/U15-plan.md` (#1 ngăn xếp · #2 phạm vi · #3 lưu JWT). Điều kiện tiên quyết để lập `docs/06-BINDING_MAP.md` và chạy Claude Design (hard-stop CLAUDE.md §3 vai Design).
- **Người quyết định:** Chủ dự án (luutuanvu.gl@gmail.com).
- **Phạm vi ảnh hưởng:** thêm service `apps/web` (chưa có); `Makefile`/CI (đưa test web vào `make lint`/`make test`); `README.md`; đánh dấu `frontend/index.html` là PoC lịch sử. **Không** đụng `apps/api`, `packages/*` (trừ import kiểu chia sẻ an toàn).

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
- [x] **#3** — **JWT in-memory** + đăng nhập lại khi tải trang (duyệt theo đề xuất).

**Hệ quả:** `docs/06-BINDING_MAP.md` chuyển thành **nguồn chính thức cho vai Design / Claude Design**. Bước tiếp: nghiên cứu định dạng đầu vào Claude Design (CHƯA KIỂM CHỨNG — tra tài liệu Anthropic chính thức trước), rồi thiết kế, rồi U15.0 (dựng `apps/web`).

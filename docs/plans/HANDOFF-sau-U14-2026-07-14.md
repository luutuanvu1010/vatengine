# Bàn giao phiên — sau U14 (2026-07-14)

> Mục đích: mở phiên mới với 3 workstream đã chốt. Trạng thái nền: **U14 (backend login/token GDT) đã XONG, merge vào `feat/cloudflare-stack-u0` (`04c418c`) và push lên `origin`.** U0–U14 backend hoàn tất.

## 0. Trạng thái đã kiểm chứng (2026-07-14)

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| U14 backend login/token | XONG, 9 task TDD (subagent-driven), review chéo + review cuối (security-reviewer + contract-guardian) ĐẠT | `docs/plans/U14-design.md`, `docs/plans/U14-plan.md` |
| `make test` | **376 test / 9 nhóm xanh, exit 0** | chạy trên `feat/cloudflare-stack-u0` sau merge |
| `make lint` | Sạch (Biome + tsc 9 workspace) | |
| Git | `feat/cloudflare-stack-u0` @ `04c418c`, đã push `origin` | fast-forward |

Endpoint U14 (đều sau `requireTenant` + `requireRole('ke_toan_truong','quan_tri')`, trong `withTenant`): `POST /tax-accounts` · `POST /tax-accounts/:id/authorize` · `GET /tax-accounts/:id/captcha` · `POST /tax-accounts/:id/login`. Migrations: `0000`–`0003` (`0003` = `uy_quyen_luc`). Secret mới: `TOKEN_KEK` (cả `apps/api` và `apps/sync-worker`).

---

## Workstream 1 — CỔNG VẬN HÀNH: chạy thử login với thông số THẬT (ưu tiên cao nhất)

**Vì sao:** `deriveTokenExpiry` (`packages/gdt-client/src/tokenExpiry.ts`) đang dựa giả định **CHƯA KIỂM CHỨNG** "token GDT là JWT có claim `exp`". Không được bật login production tới khi kiểm chứng bằng bằng chứng tái lập (Hiến pháp — Nguyên tắc bằng chứng). Nếu sai, login thật trả `502 token_shape_unexpected` (đã fail có kiểm soát, KHÔNG lưu token).

**Cần chủ dự án cung cấp trực tiếp:** MST + mật khẩu tài khoản thuế thật + tự gõ captcha. **Claude KHÔNG được nhập credential thay** (ranh giới cứng) — chủ dự án tự đặt biến môi trường + chạy lệnh.

**Các bước (theo `docs/plans/U14-plan.md` Task 1 — file test probe CHƯA tạo vì Task 1 đã hoãn):**
1. Tạo `packages/gdt-client/test/contract/authenticate.contract.test.ts` (mã có sẵn trong U14-plan Task 1 Step 1) — gated bằng env, tự skip nếu thiếu.
2. Bước A lấy captcha: `GDT_TEST_USERNAME=<mst> GDT_TEST_PASSWORD=<mk> make test-contract` → in `CAPTCHA_KEY`; chủ dự án xem ảnh + gõ.
3. Bước B: thêm `GDT_TEST_CKEY=<key> GDT_TEST_CVALUE=<captcha>` → chạy lại → in `TOKEN_PARTS`, `TOKEN_PAYLOAD`, `HAS_EXP`.
4. **Ghi kết quả** (ngày + dạng token + có/không `exp`) vào `docs/plans/U14-design.md` mục "Kết quả probe".
5. Quyết định:
   - Có `exp` → giữ `deriveTokenExpiry`; cập nhật mô tả schema `authenticate` trong `packages/gdt-client/gdt-contract-schema.json` ("token = JWT có exp, kiểm chứng ngày…"); nâng contract test thành assertion.
   - KHÔNG có `exp` → đổi cơ chế `deriveTokenExpiry` theo bằng chứng (ví dụ TTL quan sát được) + sửa test Task 3.
6. **Smoke test đầu-cuối THẬT** (mục tiêu "chạy thử với thông số thật"): sau khi probe xanh, gọi `POST /tax-accounts/:id/login` thật (qua `wrangler dev` hoặc môi trường đã deploy) → xác nhận token mã hóa được lưu (`v1$…`) → chạy một job đồng bộ → xác nhận kéo được hóa đơn thật của MST đó. Đây là điều kiện "toàn hệ thống chạy được".

---

## Workstream 2 — DEPLOY hạ tầng (A)

**Điều kiện tiên quyết (cần quyết định + chi phí của chủ dự án):** chọn nhà cung cấp Postgres (Neon/Supabase, region gần VN) + xác nhận gói **Workers Paid** (cho Queues). Xem thêm `docs/plans/HANDOFF-phien-2026-07-14.md` mục 2.

**Thứ tự:**
1. Postgres ngoài → có `DATABASE_URL`.
2. `make migrate` — áp **4 migration** Drizzle (`0000`, `0001`, `0002_audit_append_only`, `0003_uy_quyen_luc`). *Lưu ý: role app kết nối Hyperdrive KHÔNG được là superuser (RLS FORCE — `.claude/rules/multi-tenant.md`).*
3. `wrangler hyperdrive create …` → thay `REPLACE_WITH_HYPERDRIVE_ID` ở **cả hai** `wrangler.jsonc` (`apps/api`, `apps/sync-worker`).
4. `wrangler r2 bucket create vat-raw`.
5. `wrangler queues create vat-sync && wrangler queues create vat-sync-dlq` (cần Workers Paid).
6. Secrets: `wrangler secret put JWT_SECRET` + **`wrangler secret put TOKEN_KEK`** (sinh `openssl rand -base64 32`) — **cho CẢ `apps/api` lẫn `apps/sync-worker`** (mới ở U14; `apps/sync-worker` cần TOKEN_KEK để giải mã token khi đồng bộ).
7. `wrangler deploy` cho cả hai app.
8. **Giữ login sau feature-flag / chưa mở cho người dùng cuối tới khi Workstream 1 đóng cổng** (probe `exp` xong).

Sửa nhỏ đã làm ở U14: `.dev.vars.example` đã thêm `TOKEN_KEK` (placeholder) + sửa tiền tố Hyperdrive `WRANGLER_`→`CLOUDFLARE_` (Wrangler 4.110).

---

## Workstream 3 — U15 FRONTEND: thiết kế qua Claude Design rồi dịch ngược ra code

> **KHÔNG sinh giao diện trong phiên bàn giao này.** Đây là workstream tách riêng, bắt đầu bằng nghiên cứu + đặc tả, KHÔNG vẽ UI ngay.

**Hard-stop Hiến pháp (CLAUDE.md §3 vai Design):** Design KHÔNG được chạy trước khi có `06-BINDING_MAP`. Vì vậy bước đầu của U15 **luôn là**: ADR frontend (chốt ngăn xếp — đề xuất React+Vite theo `docs/plans/U13-plan.md` §Điểm mơ hồ #1) + `06-BINDING_MAP` (ánh xạ dữ liệu API → bề mặt). Hai artifact này **hiện CHƯA có**.

**Yêu cầu cụ thể của chủ dự án cho phiên sau — quy trình 4 bước:**

1. **Nghiên cứu tài liệu CHÍNH THỨC của Anthropic** để xác định cách chuẩn nhất đưa đầu vào cho **Claude Design** (thiết kế giao diện).
   - ⚠️ **CHƯA KIỂM CHỨNG:** đặc điểm/định dạng đầu vào của "Claude Design" chưa được xác nhận trong phiên này. Phiên sau **phải tra tài liệu chính thức Anthropic** (docs.anthropic.com / claude.ai) trước, KHÔNG suy đoán quy trình. Ghi rõ nguồn + ngày.
   - Xác định: Claude Design nhận đầu vào dạng gì (design brief? component inventory? data/API contract? design tokens? ảnh tham chiếu?), và định dạng bàn giao khuyến nghị.

2. **Tạo đầu vào chuẩn từ artifact của dự án** — đây chính là nội dung `06-BINDING_MAP` (khớp với hard-stop trên): hợp đồng API (endpoint U6–U14), ràng buộc dữ liệu (`EXPORT_COLUMNS`, bộ lọc chuẩn `packages/query/src/filters.ts`, nhãn `ttxly`/`tthai` chỉ mã đã kiểm chứng — xem `U13-plan.md` §4B), ma trận RBAC 3 vai, ràng buộc tiền=chuỗi-numeric + ngày giờ VN. Đóng gói theo đúng định dạng Claude Design đòi (bước 1).

3. **Thiết kế trước bằng Claude Design** — tạo mockup/bề mặt từ đầu vào bước 2. Đây là "thiết kế UI trước", chưa code.

4. **Dịch ngược ra Frontend thật** — chuyển thiết kế đã duyệt thành mã frontend (React/Vite trên Cloudflare Pages/Workers Static Assets), **nối vào API thật** đã có. Toàn bộ nội dung màn hình (đọc/lọc/kết xuất/đối chiếu + màn login thuế nhập captcha tiêu thụ API U14) đã đặc tả sẵn trong `docs/plans/U13-plan.md` (frontend) — **tái dùng** đặc tả đó.

**Dọn dẹp số treo:** `docs/plans/U13-plan.md` hiện chứa nội dung *frontend* nhưng mang số U13 (đã dùng cho Giám sát). Đổi số thành **U15** khi mở workstream này.

---

## Ghi chú kỹ thuật

- Nhánh làm việc: `feat/cloudflare-stack-u0` (đã push). U14 thi công trong worktree cách ly rồi merge fast-forward (worktree đã dọn).
- `.git/refs/heads/` còn vài file `…lock.stuck-…` (cảnh báo vô hại, git chạy bình thường) — dọn được nếu muốn, cẩn trọng vì đụng `.git`.
- Bộ nhớ dự án đã cập nhật: `memory/vat-huong-di-sau-u12.md` (U14 xong + cổng vận hành + lộ trình A→U15).

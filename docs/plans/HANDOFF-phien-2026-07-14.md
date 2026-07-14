# Bàn giao phiên — 2026-07-14

> Mục đích: chốt trạng thái để mở phiên mới. Chủ đề phiên này: **kiểm tra điều kiện deploy + chạy thử**, và làm rõ **khoảng trống frontend / login**.

## 1. Trạng thái mã nguồn (đã kiểm chứng hôm nay)

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| `make lint` | Sạch | Biome 174 files + `tsc --noEmit` cho 9 workspace |
| `make test` | **344 test / 50 file — xanh toàn bộ** | PGlite (Postgres nhúng), end-to-end |
| Build worker | OK | `wrangler deploy --dry-run` cho `vat-api` (730 KiB) + `vat-sync-worker` (499 KiB) |
| Tooling | Node v22.22, npm 10.9, Wrangler 4.110 | |
| Wrangler auth | Đã đăng nhập `luutuanvu.gl@gmail.com`, account `Lưu Tuấn Vũ` (`381557e4...`), quyền `workers:write` | `wrangler whoami` |

Các đơn vị **U0–U12 đã hoàn thành** (theo git log). Toàn bộ U0–U12 là **backend** — adapter GDT, mô hình dữ liệu, API tra cứu, đồng bộ nền, đối chiếu, xuất kế toán, bảo mật.

## 2. Điều kiện deploy còn thiếu (hạ tầng — cần quyết định của chủ dự án)

Deploy sẽ FAIL cho tới khi provision xong. Thứ tự:

1. **Postgres ngoài** (Neon/Supabase, region gần VN) → có `DATABASE_URL`. *Điều kiện tiên quyết.*
2. `make migrate` — áp 3 migration Drizzle (`0000`, `0001`, `0002_audit_append_only`).
3. `wrangler hyperdrive create ...` → thay `REPLACE_WITH_HYPERDRIVE_ID` ở **cả hai** `wrangler.jsonc` (`apps/api`, `apps/sync-worker`).
4. `wrangler r2 bucket create vat-raw`.
5. `wrangler queues create vat-sync && wrangler queues create vat-sync-dlq` — **cần gói Workers Paid**.
6. `wrangler secret put JWT_SECRET` (+ `SECRET_KEK` khi bật lưu token runtime).
7. `wrangler deploy` cho `apps/api` và `apps/sync-worker`.

**Chưa tồn tại trên cloud (đã kiểm `wrangler ... list`):** Hyperdrive (trống), R2 `vat-raw` (chưa có), Queue `vat-sync`/`vat-sync-dlq` (chưa có).

## 3. Hai phát hiện phụ

- **Local dev không boot được nếu không có Postgres cục bộ:** `wrangler dev` (apps/api) từ chối khởi động vì Hyperdrive cần một Postgres đang chạy. Máy hiện không có `psql`; Docker daemon đang tắt. Logic vẫn được test suite (PGlite) phủ, nhưng không smoke-test được `/health` qua HTTP.
- **Sai lệch tài liệu:** `apps/api/.dev.vars.example` ghi tiền tố `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_...`, nhưng Wrangler 4.110 đòi tiền tố **`CLOUDFLARE_`**. → Nên sửa file example. (CHƯA sửa.)

## 4. Khoảng trống lớn: Frontend & Login/Captcha (CÂU HỎI CHÍNH CỦA PHIÊN)

**Hiện KHÔNG có frontend thật.** Hệ thống chạy như **API headless** — tương tác bằng HTTP (JWT + `/invoices*`), không có UI. `frontend/index.html` chỉ là PoC MVP cũ một file, **không nối** vào API Cloudflare (CLAUDE.md xác nhận).

Để thành sản phẩm chạy được cho người dùng cuối, cần **2 workstream MỚI, ngoài U0–U12** (cần plan/ADR trước khi code — chưa có):

- **(A) Đường login GDT + captcha + ghi token:** U12 mới giao *seam + fixture*; đường `login → lưu token mã hóa` **chưa xây**. Không có nó thì không có token để đồng bộ thật. Captcha **bắt buộc người dùng nhập** (ranh giới đạo đức) → gắn chặt với UI.
- **(B) Frontend UI:** CLAUDE.md định hướng React/Next.js hoặc SvelteKit trên Cloudflare Pages. **Chưa có ADR, chưa có đơn vị U, chưa có `06-BINDING_MAP`.** Theo Hiến pháp, Design KHÔNG được chạy trước khi có BINDING_MAP → bước đầu tiên là lập BINDING_MAP + ADR frontend, không phải vẽ UI ngay.

## 5. Việc treo (chờ quyết định) cho phiên mới

Chọn hướng đi tiếp:
- **[a]** Provision hạ tầng cloud + deploy backend (mục 2) — cần chọn nhà cung cấp Postgres + xác nhận gói Workers Paid.
- **[b]** Mở workstream **login/token-write path** (A) — điều kiện để đồng bộ dữ liệu thật.
- **[c]** Mở workstream **frontend** (B) — bắt đầu bằng ADR + `06-BINDING_MAP`, chưa code UI.
- **[d]** Việc nhỏ dọn dẹp: sửa `.dev.vars.example` (`WRANGLER_` → `CLOUDFLARE_`).

## 6. Ghi chú kỹ thuật

- Đã tạo `apps/api/.dev.vars` (giá trị placeholder, đã `.gitignore`) để thử boot dev. Có thể xóa.
- `make test-contract` (gọi GDT thật để kiểm egress) **chưa chạy** trong phiên này.
- Không có thay đổi mã sản phẩm nào trong phiên này — chỉ chẩn đoán + tạo file bàn giao này.

# Kế hoạch — U1: GDT Adapter (captcha + authenticate)

> Sản phẩm của bước `/plan-unit U1`. **Không viết code hiện thực** — chỉ kế hoạch để rà soát trước khi `/write-prompt U1` → `/start-unit U1`.
> Ngày: 2026-07-13. Tiền đề egress: ADR-0001 **Amendment #3** (T0 thuần Cloudflare CHẠY với `/api/captcha`).

## Phạm vi

Hiện thực hai thao tác đầu của lớp adapter GDT trong `packages/gdt-client`, port từ `backend/gdt_client.py`: **(1)** `getCaptcha()` lấy ảnh captcha cho người dùng nhập, **(2)** `authenticate()` đăng nhập bằng MST + mật khẩu + captcha do người dùng nhập, trả JWT. Mọi lời gọi đi qua interface `GdtTransport`. Kèm việc **sửa `BASE`** (bỏ `:30000` sai) và **tạo `gdt-contract-schema.json`**.

**NGOÀI phạm vi:** truy vấn hóa đơn purchase/sold + phân trang + gộp sco (U2); detail dòng hàng (U3); lưu trữ/DB (U4+); relay VN/T1 (đang TREO). Không đụng `backend/` (giữ làm tài liệu nghiệp vụ).

## File sẽ tạo/sửa

- `packages/gdt-client/src/endpoints.ts` — sửa `BASE` `:30000` → `https://hoadondientu.gdt.gov.vn` (:443); xoá 3 dòng chú thích tiền đề sai (`:30000` / "biên Cloudflare KHÔNG tới được"); thêm hằng `AUTH_PATH`, `CAPTCHA_PATH` (giải quyết điểm mơ hồ tiền tố `/api` bên dưới trước khi chốt giá trị).
- `packages/gdt-client/src/captcha.ts` — `getCaptcha(transport): Promise<{ key: string; content: string }>`.
- `packages/gdt-client/src/auth.ts` — `authenticate(transport, { username, password, ckey, cvalue }): Promise<{ token: string }>`; ném `GdtError` khi 401/hết phiên; phân biệt **lỗi nghiệp vụ** (200 không `token`) vs lệch hợp đồng.
- `packages/gdt-client/src/errors.ts` — `GdtError`, `GdtContractDriftError` (nếu chưa có).
- `packages/gdt-client/gdt-contract-schema.json` — **tạo mới** (chưa tồn tại): schema kỳ vọng cho `captcha` `{key, content}` và `authenticate` `{token}`.
- `packages/gdt-client/src/index.ts` — export API công khai.
- `packages/gdt-client/test/unit/auth.test.ts` — nhóm `unit` (mock transport).
- `packages/gdt-client/test/contract/captcha.contract.test.ts` — nhóm `contract` (gọi thật `/api/captcha`).

## Test viết trước (TDD)

**unit** (mock `GdtTransport`, không mạng thật):
1. `getCaptcha()` trả `{key, content}` khi transport trả JSON hợp lệ.
2. `getCaptcha()` **không** tự giải/bypass — chỉ trả nguyên ảnh (khẳng định không có nhánh OCR/giải mã).
3. `authenticate()` trả `token` khi GDT trả 200 + `{token}`.
4. `authenticate()` với 200 **không** `token` (sai captcha/mật khẩu) → ném lỗi **nghiệp vụ**, **không** đánh dấu lệch hợp đồng, **không** mở circuit breaker.
5. `authenticate()` gặp **401** → ném `GdtError("hết phiên")`, **không** retry bằng credential cũ.
6. Lỗi tạm (5xx/timeout) → retry có backoff; 401 → không retry (khẳng định số lần gọi transport).
7. Mọi lời gọi đi qua `GdtTransport` — không `fetch()` trực tiếp (khẳng định qua mock, không có global fetch).

**contract** (`make test-contract`, gọi thật endpoint công khai):
8. `GET {BASE}/api/captcha` từ biên Cloudflare trả `200` + khớp schema `captcha` trong `gdt-contract-schema.json`. Lệch → **dừng**, cập nhật schema tường minh (không nới assertion).

## Tiêu chí nghiệm thu

- 5 mục checklist U1 xanh: mọi gọi qua `GdtTransport`; `getCaptcha()` không bypass; đăng nhập thành công khi có `token` + xử lý sai captcha (200 không token); 401 → dừng báo hết phiên; contract test `/api/captcha` khớp schema.
- `make lint` sạch (`biome` + `tsc --noEmit`); `make test` xanh; `make test-contract` xanh.
- Coverage tầng nghiệp vụ `packages/gdt-client` ≥ 80%.
- `BASE` không còn `:30000`; không còn chú thích tiền đề sai trong repo.
- `gdt-contract-schema.json` tồn tại và được contract test dùng.
- Review chéo: `contract-guardian` (đụng adapter GDT) + `security-reviewer` (đụng token/xác thực) + `dod-auditor` (luôn) — hoặc `/qa-unit U1`.

## Ràng buộc bắt buộc chạm tới

Cô lập adapter: mọi HTTP tới `hoadondientu.gdt.gov.vn` chỉ từ `packages/gdt-client`, qua `GdtTransport` (`gdt-adapter.md`). Xử lý 401 → dừng, không retry credential cũ. Không phá captcha. Không lưu mật khẩu thô, không log `password`/`cvalue`/`token` (`security.md`). Timeout tường minh (`AbortController`) + retry backoff cho lỗi tạm, không cho 401. Cổng hợp đồng: `gdt-contract-schema.json` là nguồn kỳ vọng; lệch → dừng + cập nhật tường minh.

## Rủi ro & phụ thuộc

- **Egress:** T0 đã kiểm chứng cho `/api/captcha` (Amendment #3). Contract test phải chạy trên biên thật (`wrangler`/CI), không giả lập egress.
- **`GdtTransport`:** kiểm tra interface hiện có trong `src/transport.ts` đã đủ cho `authenticate` (POST + headers) chưa; nếu thiếu, mở rộng interface là một phần U1.
- **Giới hạn Workers** (CPU 5'/wall 15') — không ảnh hưởng U1 (2 lời gọi ngắn).

## ✅ Quyết định đã chốt (2026-07-13) — gỡ mục "Điểm mơ hồ"

Amendment #3 **chỉ kiểm chứng** `GET /api/captcha` (200 + `{key,content}`, 3/3). Hai quyết định của chủ dự án:

**QĐ-1 — Chốt quy ước URL.** `BASE = "https://hoadondientu.gdt.gov.vn"` (:443); **mọi** endpoint mang tiền tố `/api`: `CAPTCHA_PATH = "/api/captcha"` (ĐÃ KIỂM CHỨNG), `AUTH_PATH = "/api/security-taxpayer/authenticate"` (**CHƯA KIỂM CHỨNG**), `INVOICE_ENDPOINTS = "/api/query/invoices/*"` + `"/api/sco-query/invoices/*"` (**CHƯA KIỂM CHỨNG**). Trong mã: gắn chú thích `// CHƯA KIỂM CHỨNG (2026-07-13) — chờ probe đăng nhập thật` cho các hằng chưa test; **không** ghi vào ADR như "đã chốt kiểm chứng" cho tới khi probe xanh (bài học `:30000`).

**QĐ-2 — Kiểm chứng `authenticate` bằng probe đăng nhập thật, credential ephemeral trong Cloudflare.** Chủ dự án cung cấp một tài khoản MST hợp pháp (của chính DN). Ràng buộc bảo mật (trích `security.md` dòng 16–18, 39):

- **Sản phẩm KHÔNG lưu mật khẩu thuế** — chỉ giữ JWT (`token`), vòng đời ngắn, mã hoá tại nghỉ. Đây là ranh giới Hiến pháp, không ngoại lệ.
- Credential dùng cho probe nạp **ephemeral**: `wrangler secret put GDT_TEST_USERNAME` / `GDT_TEST_PASSWORD` (Workers Secrets) **hoặc** `.dev.vars` (chỉ local, đã có trong `.gitignore` dòng 19). **Không** hard-code, **không** commit, **không** dán vào chat/PR.
- Probe là **contract test bán thủ công một lần** (không vào CI tự động): lấy `/api/captcha` → **người dùng đọc SVG + nhập `cvalue`** (không phá captcha) → POST `AUTH_PATH` → khẳng định `200 + {token}`. Ghi bằng chứng (ngày + status, **che** token/password) vào `docs/adr/` hoặc `docs/CHECKLIST-NGHIEM-THU.md`.
- **Sau probe: xoá secret ngay** (`wrangler secret delete ...`); nếu dùng `.dev.vars` thì xoá dòng credential. Chỉ khi probe xanh mới gỡ nhãn CHƯA KIỂM CHỨNG cho `AUTH_PATH` + cập nhật `gdt-contract-schema.json`.
- CI (`make test-contract`) **chỉ** giữ contract công khai `/api/captcha` (không có captcha-gated auth trong CI tự động).

## Bước kế tiếp

`/write-prompt U1` (sinh prompt thực thi tự chứa, đã phản ánh QĐ-1 & QĐ-2) → `/start-unit U1` trong phiên có người trực để nhập captcha cho probe `authenticate`.

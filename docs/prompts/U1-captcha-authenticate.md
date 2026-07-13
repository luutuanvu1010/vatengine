# PROMPT — Thực thi U1: GDT Adapter (captcha + authenticate)

> Dán nguyên khối dưới đây vào một phiên thực thi của dự án VATCrawlbot (`/start-unit U1`).
> Đây là phiên **THỰC THI TDD một đơn vị** — sản phẩm là mã production trong `packages/gdt-client` + test xanh. Sinh từ `docs/plans/U1-plan.md` (đã chốt QĐ-1, QĐ-2 ngày 2026-07-13).

---

Bạn đang tiếp nối dự án **VATCrawlbot**. Nhiệm vụ: thực thi **đơn vị U1 — GDT Adapter: captcha + authenticate** theo đúng vòng lặp TDD của dự án. **Chỉ một đơn vị này**, không làm lấn U2+.

## 0. Đọc trước (theo nhu cầu, KHÔNG tự import cả file vào ngữ cảnh)

- `CLAUDE.md` — Hiến pháp: ranh giới pháp lý, quy tắc cứng, **Nguyên tắc bằng chứng**, Definition of Done.
- `docs/plans/U1-plan.md` — kế hoạch đã duyệt cho chính U1 (phạm vi, file, test, **QĐ-1 & QĐ-2**). **Nguồn chân lý cho phiên này.**
- `docs/adr/0001-nen-tang-cloudflare.md` **Amendment #3** — bằng chứng T0 thuần Cloudflare CHẠY với `/api/captcha`.
- `.claude/rules/gdt-adapter.md` (cô lập adapter + cổng hợp đồng), `.claude/rules/security.md` (bí mật, không lưu mật khẩu thuế), `.claude/rules/testing.md` (nhóm test, coverage ≥ 80%).
- `backend/gdt_client.py` — tham chiếu nghiệp vụ để **port sang TS** (không phát triển tiếp trên đó): `get_captcha` (dòng ~145), `login` (dòng ~158) — chú ý nhánh 200-không-token là lỗi nghiệp vụ, KHÔNG phải lệch hợp đồng.

## 1. Bối cảnh & mục tiêu (tiêu chí nghiệm thu U1)

Hiện thực hai thao tác đầu của adapter trong `packages/gdt-client`, mọi lời gọi qua interface `GdtTransport`:

- [ ] `getCaptcha()` trả `{key, content}` cho người dùng nhập — **không** tự giải/bypass captcha.
- [ ] `authenticate()` thành công (nghiệp vụ) khi GDT trả `{token}`; xử lý **sai captcha/mật khẩu** (GDT có thể trả **200 kèm `message` lỗi, không có `token`**) như lỗi nghiệp vụ, **không** mở circuit breaker.
- [ ] **401 → dừng**, báo hết phiên; **không** tự retry bằng credential cũ.
- [ ] Contract test với endpoint công khai `/api/captcha` khớp `gdt-contract-schema.json`.
- [ ] Mọi gọi GDT đi qua `GdtTransport` — không `fetch()` trực tiếp ngoài `packages/gdt-client`.

## 2. Quy ước URL đã chốt (QĐ-1) — điền vào `endpoints.ts`

- `BASE = "https://hoadondientu.gdt.gov.vn"` (:443). **XOÁ** `:30000` và 3 dòng chú thích tiền đề sai ("biên Cloudflare KHÔNG tới được :30000").
- `CAPTCHA_PATH = "/api/captcha"` — **ĐÃ KIỂM CHỨNG** (Amendment #3).
- `AUTH_PATH = "/api/security-taxpayer/authenticate"` — gắn chú thích `// CHƯA KIỂM CHỨNG (2026-07-13) — chờ probe đăng nhập thật (QĐ-2)`.
- `INVOICE_ENDPOINTS`: thêm tiền tố `/api/` (`/api/query/invoices/*`, `/api/sco-query/invoices/*`) — cũng gắn `// CHƯA KIỂM CHỨNG` (dùng ở U2, không test trong U1).
- **Không** ghi các path CHƯA KIỂM CHỨNG vào ADR như "đã chốt" cho tới khi probe xanh (bài học `:30000`).

## 3. Ràng buộc bắt buộc (trích Hiến pháp/Luật)

- **Cô lập adapter:** mọi HTTP tới `hoadondientu.gdt.gov.vn` chỉ từ `packages/gdt-client`, qua `GdtTransport`. Kiểm tra `src/transport.ts` đủ cho POST authenticate chưa; thiếu thì mở rộng interface (một phần U1).
- **401:** ném `GdtError("hết phiên")`, dừng, không retry credential cũ. Lỗi tạm (5xx/timeout): retry có backoff. Timeout tường minh bằng `AbortController`.
- **Không phá captcha.** `getCaptcha()` chỉ trả ảnh.
- **Bí mật (security.md):** KHÔNG lưu mật khẩu thuế trong sản phẩm — chỉ giữ `token`. Không hard-code/không commit secret. Không log `password`/`cvalue`/`token`/`raw_json`; cần debug thì **mask**.
- **Cổng hợp đồng:** `gdt-contract-schema.json` là nguồn kỳ vọng. Response lệch schema → **DỪNG**, cập nhật schema tường minh sau khi xác nhận thủ công, **không** nới assertion để test xanh. Nhánh 200-không-token khi đăng nhập KHÔNG phải lệch hợp đồng.

## 4. Yêu cầu TDD (viết test TRƯỚC, đỏ → xanh)

**Nhóm `unit`** (`packages/gdt-client/test/unit/`, mock `GdtTransport`):
1. `getCaptcha()` trả `{key, content}` khi transport trả JSON hợp lệ.
2. `getCaptcha()` không có nhánh tự giải/OCR — chỉ trả nguyên ảnh.
3. `authenticate()` trả `token` khi 200 + `{token}`.
4. `authenticate()` 200 **không** `token` → lỗi **nghiệp vụ**, không đánh dấu lệch hợp đồng, không mở breaker.
5. `authenticate()` **401** → `GdtError("hết phiên")`, không retry credential cũ (khẳng định số lần gọi transport).
6. Lỗi tạm (5xx/timeout) → retry backoff; 401 → không retry.
7. Không `fetch()` trực tiếp — mọi lời gọi qua `GdtTransport` (khẳng định qua mock).

**Nhóm `contract`** (`packages/gdt-client/test/contract/`, `make test-contract`, gọi thật):
8. `GET {BASE}/api/captcha` từ biên Cloudflare trả `200` + khớp schema `captcha`. Lệch → dừng + cập nhật schema tường minh.

**Tạo mới** `packages/gdt-client/gdt-contract-schema.json`: schema `captcha` `{key, content}` và `authenticate` `{token}` (phần authenticate đánh dấu CHƯA KIỂM CHỨNG cho tới probe).

## 5. Probe kiểm chứng `authenticate` (QĐ-2) — bán thủ công MỘT lần, có người trực

Chạy **sau khi** unit + contract captcha xanh, để xác nhận `AUTH_PATH` thật:

1. Nạp credential **ephemeral**: `wrangler secret put GDT_TEST_USERNAME` + `GDT_TEST_PASSWORD` (hoặc `.dev.vars` local — đã gitignore). **Không** commit, **không** in ra log/chat.
2. Lấy `/api/captcha` → **người dùng đọc SVG, nhập `cvalue`** (không tự giải) → POST `AUTH_PATH` với `{username, password, ckey, cvalue}`.
3. Khẳng định `200 + {token}`. Ghi bằng chứng (ngày + status, **mask** token/password) vào `docs/CHECKLIST-NGHIEM-THU.md` (U1) hoặc ADR.
4. **Xoá secret ngay:** `wrangler secret delete GDT_TEST_USERNAME GDT_TEST_PASSWORD` (hoặc xoá dòng trong `.dev.vars`).
5. Probe xanh → gỡ nhãn `CHƯA KIỂM CHỨNG` khỏi `AUTH_PATH`, cập nhật `gdt-contract-schema.json` phần `authenticate`.
   Nếu probe **không** thực hiện được trong phiên (thiếu credential/không người trực): giữ `AUTH_PATH` ở trạng thái CHƯA KIỂM CHỨNG, unit test (mock) vẫn đủ để đóng U1; ghi rõ nợ kiểm chứng.

## 6. Lệnh tự kiểm chứng

`make lint` (Biome + `tsc --noEmit`) sạch · `make test` (unit + integration) xanh · `make test-contract` (`/api/captcha`) xanh · coverage `packages/gdt-client` ≥ 80%.

## 7. Cổng review chéo (trước khi commit)

`contract-guardian` (đụng adapter GDT) + `security-reviewer` (đụng token/xác thực/credential) + `dod-auditor` (luôn) — hoặc `/qa-unit U1`. Rò rỉ secret hoặc lưu mật khẩu thuế = **Critical**.

## 8. Definition of Done

Tất cả test U1 xanh; `make lint` sạch; coverage không dưới ngưỡng; `BASE` không còn `:30000` và không còn chú thích tiền đề sai; `gdt-contract-schema.json` tồn tại + được contract test dùng; không lộ/không lưu mật khẩu thuế thô; secret probe đã xoá; cập nhật `docs/CHECKLIST-NGHIEM-THU.md` (U1) + trạng thái kiểm chứng `AUTH_PATH`; commit nhỏ, rõ, không trộn đơn vị khác. Stop-hook ép lint + test.

## 9. Khi gặp mơ hồ

Nếu response thật của `/api/captcha` hoặc `AUTH_PATH` lệch cấu trúc kỳ vọng, hoặc `GdtTransport` hiện có không đủ cho POST: viết một contract/unit test thất bại ghi rõ kỳ vọng, **DỪNG và hỏi** kèm phương án — không đoán rồi code tiếp (Nguyên tắc bằng chứng).

# U14 — Thiết kế: Đường login GDT + ghi/đọc token (backend, API-only)

> **Trạng thái: THIẾT KẾ ĐÃ DUYỆT** (brainstorm 2026-07-14, chủ dự án chốt 4 quyết định lớn + RBAC). Bước tiếp: viết plan hiện thực (U14-plan) rồi code theo TDD.
>
> **Vị trí & thứ tự chạy (chốt 2026-07-14):** U14 là **backend login/token, tiền đề của U15 (Frontend, gồm màn Login)** — chạy TRƯỚC U15. Số khớp thứ tự chạy: **U13 (Giám sát) → U14 (đơn vị này) → A (deploy) → U15 (Frontend tiêu thụ API của U14)**. Chủ dự án chọn "Cách 1": backend login là đơn vị RIÊNG, không gộp vào cụm frontend (giữ quyết định #1 "API-only, không UI").
>
> **Nguồn gốc:** nối tiếp nghiên cứu [EXP-vong-doi-token-gdt.md](EXP-vong-doi-token-gdt.md) (mục 2 nêu 4 câu hỏi chờ chốt — nay đã chốt) và bàn giao [HANDOFF-phien-2026-07-14.md](HANDOFF-phien-2026-07-14.md) mục 4A.
>
> **Phối hợp U13 (phiên song song):** U13 dựng 2 vòng giám sát (API GDT đổi; egress biên Cloudflare bị chặn — xem [EXP-giam-sat-rui-ro.md](EXP-giam-sat-rui-ro.md)). U14 có 1 contract test probe `authenticate` — **tái dùng** hạ tầng contract/probe có sẵn (`make test-contract`, `gdt-contract-schema.json`), KHÔNG dựng song song. Lưu ý: probe `authenticate` cần captcha người thật nhập nên là **kiểm chứng thủ công MỘT LẦN**, KHÔNG chạy nền trong vòng lịch của U13 (endpoint captcha/invoices công khai thì chạy nền được, `authenticate` thì không).

## 1. Vấn đề & phạm vi

U12 đã dựng primitive mã hóa (`sealSecret`/`openSecret`) + seam vault (`storeToken`/`readToken`) nhưng **chưa nối vào luồng chạy thật** → không tenant nào có token → hệ thống không tự kéo được hóa đơn mới từ GDT. U14 nối đầu-cuối, **chỉ tầng API (không UI — UI ở U15-Frontend)**.

**Trong phạm vi:** đăng ký tài khoản thuế, ủy quyền tối thiểu, proxy captcha, đường GHI token (login→storeToken), sửa đường ĐỌC (readToken), secret `TOKEN_KEK`, audit.

**Ngoài phạm vi:** UI/frontend (C), consent UX đầy đủ có phiên bản điều khoản (C), tự đăng nhập lại (bị Hiến pháp cấm), KEK theo tenant / xoay vòng thực thi (chỉ chừa sẵn version-tag).

## 2. Quyết định đã chốt (chủ dự án, 2026-07-14)

| # | Quyết định | Chốt |
|---|---|---|
| 1 | Luồng captcha | **Chỉ API, không UI.** GET captcha + POST login qua HTTP; kiểm bằng curl/test. |
| 2 | Mô hình KEK | **1 KEK toàn hệ thống + version-tag** (`v1`), nạp từ `wrangler secret put TOKEN_KEK`. Xoay vòng sau = thêm `v2`, giải mã cả hai trong giai đoạn chuyển. |
| 3 | Credential khi hết hạn | **Không lưu mật khẩu thuế thô; không tự đăng nhập lại** (Hiến pháp + U9). Token hết hạn → `can_dang_nhap_lai` → người dùng nhập lại **mật khẩu + captcha** (username đã lưu). |
| 4 | Ủy quyền tenant (NĐ 13) | **Ghi nhận tối thiểu + audit.** Cột `uy_quyen_luc`; login từ chối nếu chưa ủy quyền; UI consent đầy đủ để C. |
| RBAC | 4 endpoint | **`ke_toan_truong` + `quan_tri`** (không `ke_toan` cơ bản). |

## 3. Endpoint (dưới `/tax-accounts`)

Tất cả sau `requireTenant` + `requireRole('ke_toan_truong','quan_tri')`, trong `withTenant` (RLS lớp 2 + lọc `tenant_id` lớp 1) — theo pattern route `invoices`. Mọi gọi GDT đi qua `@vat/gdt-client` (không `fetch()` trực tiếp — `gdt-adapter.md`).

| Endpoint | Body/Trả về | Việc |
|---|---|---|
| `POST /tax-accounts` | `{username, loai?}` → `{id}` | Đăng ký bản ghi `tai_khoan_thue` (chưa token). |
| `POST /tax-accounts/:id/authorize` | `{}` → `{ok}` | Đặt `uy_quyen_luc = now()`. Audit. |
| `GET /tax-accounts/:id/captcha` | → `{key, content}` | Proxy `getCaptcha()`. Trả ảnh cho người dùng gõ. |
| `POST /tax-accounts/:id/login` | `{password, ckey, cvalue}` → `{ok, tokenHetHan}` | `authenticate()` → `storeToken()`. |

Luồng stateless: `GET captcha` → nhận `{key, content}` → gõ captcha → `POST login` với `ckey=key, cvalue=<đã gõ>`. Server ghép `username` (từ DB) + `password` + captcha. **Không lưu password.**

## 4. Đường GHI token + suy ra `token_het_han` (CỔNG KIỂM CHỨNG)

`POST /login`: nếu `uy_quyen_luc` null → **409**. Ngược lại `authenticate(transport, {username, password, ckey, cvalue})` → `storeToken(db, tenantId, id, token, tokenHetHan, env.TOKEN_KEK)`. 401 từ GDT → **không** lưu token, trả lỗi "hết phiên/sai captcha" (đã có `GdtError`), audit login-fail.

⚠️ **Không giả định TTL (Hiến pháp — nguyên tắc bằng chứng).** `authenticate()` chỉ trả `{token}`; **chưa biết** cách lấy `token_het_han` (JWT claim `exp`? TTL cố định?). **Bước ĐẦU TIÊN của plan** = contract test probe login thật, quan sát dạng token + cách suy ra hạn, **ghi lại kết quả**. Cơ chế đặt sau hàm nhỏ `deriveTokenExpiry(token)`, chỉ hiện thực SAU probe. Không hardcode TTL trước khi có bằng chứng.

## 5. Sửa đường ĐỌC (khử mâu thuẫn ngầm)

`apps/sync-worker/src/recorder.ts` (đọc token, ~line 31–35): thay dùng thẳng `tokenHienTai` bằng `readToken(db, tenantId, id, env.TOKEN_KEK)` (giải mã). Đây là bug ngầm EXP-doc mục 4 cảnh báo — nối GHI mà quên sửa ĐỌC ⇒ sync gửi `v1$aesgcm$…` cho GDT. Làm CÙNG U14 để schema ↔ consumer nhất quán. Giữ nguyên nhánh 401/hết hạn hiện có.

## 6. Consent + audit

- Migration Drizzle mới: thêm cột `uy_quyen_luc timestamptz` (nullable) trên `tai_khoan_thue`.
- Audit log (append-only `auditLog`, đã có): đặt ủy quyền, login thành công, login thất bại. **Không log token/password/captcha** — mask (`security.md`).

## 7. Secret `TOKEN_KEK`

Khai báo `.dev.vars.example` (apps/api + apps/sync-worker) + ghi tài liệu `wrangler secret put TOKEN_KEK`. Cả `storeToken` lẫn `readToken` cần. (Kèm sửa sai lệch tiền tố `WRANGLER_` → `CLOUDFLARE_` mà handoff mục 3 nêu — cùng vùng file, tiện làm chuẩn.)

## 8. Kiểm thử (TDD)

**unit** (mock `GdtTransport`, PGlite):
- Đăng ký tài khoản; captcha proxy trả `{key, content}`.
- Login GHI token mã hóa — assert giá trị lưu bắt đầu `v1$` (KHÔNG phải token thô).
- Đọc giải mã đúng (`readToken` round-trip).
- Chưa ủy quyền → 409.
- Cách ly tenant: tenant A không login được vào account của tenant B (404/403, không rò).
- RBAC: `ke_toan` → 403.
- 401 GDT (sai captcha/mật khẩu) → không lưu token, báo lỗi, audit-fail; **không** coi là lệch hợp đồng.

**contract** (`make test-contract`, GDT thật): probe `authenticate` để chốt `deriveTokenExpiry` (mục 4). Tái dùng hạ tầng U13.

Coverage ≥ 80% tầng nghiệp vụ.

## 9. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh; contract probe đã chạy + ghi kết quả dạng token/TTL; không lộ token/password trong log; audit đủ; commit nhỏ; review chéo bằng subagent (`contract-guardian` + `security-reviewer`) trước khi coi xong.

# Kế hoạch U12 — Bảo mật: mã hóa bí mật, audit log append-only, rate limit client (đơn vị cuối)

> Trạng thái: **✅ ĐÃ HIỆN THỰC (2026-07-14)** — 3 quyết định chốt theo đề xuất (#1 seam+fixture · #2 1 KEK+version-tag · #3 counter/log mask). `make lint`+`make test` xanh; `security-reviewer` PASS (2 phát hiện Medium/Low đã sửa). Xem `docs/CHECKLIST-NGHIEM-THU.md` mục U12.
>
> _(Bên dưới là kế hoạch gốc, giữ nguyên làm hồ sơ.)_ Bước "kế hoạch ngắn" (skill `/plan-unit`).
> Ngày: 2026-07-14. U12 là **đơn vị cuối** (U0–U11 đã xong theo `docs/CHECKLIST-NGHIEM-THU.md`). Bản chất U12 = **làm cứng (harden)** ba thứ mà các đơn vị trước cố ý để "khung tối thiểu → đầy đủ ở U12"; **KHÔNG** dựng tính năng nghiệp vụ mới.
>
> Nguồn "làm gì": `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng 110 (U12: "Bảo mật: mã hóa bí mật, audit log, rate limit client — Test mã hóa/giải mã, ghi audit, chặn vượt ngưỡng") + mục 6 (checklist bảo mật). `CHECKLIST-NGHIEM-THU.md` mục U12 (4 gạch đầu dòng). Luật áp dụng: **`security.md` (trọng tâm)**, `multi-tenant.md`, `testing.md`. **KHÔNG** đụng `gdt-adapter.md` (U12 không đổi hợp đồng GDT; chỉ làm cứng limiter đã có).
>
> **Ba "TODO đã ghi sẵn trong code" mà U12 phải đóng** (bằng chứng, không suy đoán):
> - `packages/db/src/schema/taiKhoanThue.ts:19` — *"Token JWT GDT — mã hóa tại nghỉ … (envelope encryption **thực thi ở U12**)"*; hiện `token_hien_tai` là `text` **thô**.
> - `packages/db/src/schema/auditLog.ts:6-7` — *"Khung tối thiểu ở U4; ghi audit runtime + **ràng buộc không-ghi-đè đầy đủ là U12**"*. Hiện policy RLS là `FOR ALL` (cho cả UPDATE/DELETE nếu khớp tenant) → **chưa** append-only.
> - `apps/sync-worker/src/rateLimiter.ts:4-5` — *"U9 = tối thiểu; **làm cứng (ngưỡng tinh chỉnh, quan sát) ở U12**"*. Token-bucket + circuit breaker đã có (DO `TenantLimiter`), cần cấu hình tiêm được + quan sát + test "chặn vượt ngưỡng" tường minh.

## Tiền đề đã kiểm chứng — TÁI DÙNG, KHÔNG dựng lại

- **PBKDF2 qua WebCrypto** (`apps/api/src/password.ts`, U8): mẫu **`crypto.subtle` tương thích workerd** + định dạng chuỗi **tự mô tả tham số** (`pbkdf2$<iter>$<salt>$<hash>`) + `timingSafeEqual`. U12 mã hóa token **theo cùng khuôn tự mô tả** (`v1$<alg>$<iv>$<wrappedDek>$<ct>`), KHÔNG bịa định dạng mới rời rạc.
- **Token thuế hiện chỉ được ĐỌC và XÓA, CHƯA có đường GHI** (kiểm chứng: `grep tokenHienTai` → chỉ `recorder.ts:25` select, `runJob.ts` đọc, `recorder.ts:69` set `null`; **không** nơi nào insert/update token thật). Hệ quả nặng cho phạm vi → **Điểm mơ hồ #1**.
- **RLS hai lớp + role non-owner** (`multi-tenant.md`, migration `0001`): mẫu `withTenant` (`set_config app.tenant_id` local) + test cách ly cho **role app non-owner** (`app_user2`) đã có. U12 dùng lại đúng mẫu này để test append-only bằng **role app thật**, không phải owner.
- **SECURITY DEFINER + REVOKE FROM PUBLIC** (migration `0001`, sửa từ `security-reviewer`): mẫu least-privilege ở tầng SQL + lưu ý *"role BYPASSRLS/grant cần quyền admin provider — CHƯA KIỂM CHỨNG trên DB thật"*. Append-only của U12 cùng lớp rủi ro vận hành này → gắn nhãn tương tự.
- **Audit runtime đã ghi ở nhiều nơi** (`apps/sync-worker/src/recorder.ts`, `apps/api/src/routes/exports.ts`): `hanh_dong`/`doi_tuong`/`chi_tiet`. U12 **không** đổi các call-site này (trừ khi #2/#3 chốt bổ sung); chỉ thêm **ràng buộc DB** + **masking `chi_tiet`**.
- **Limiter thuần đã test** (`rateLimiter.ts` + `rateLimiter.test.ts`, U9): `tryAcquire`/`recordResult`/`initialState`, `DEFAULT_LIMITER_CONFIG`. U12 làm cứng **quanh** logic này, KHÔNG viết lại.

## Phạm vi (đề xuất — chốt sau 3 quyết định chặn)

Làm cứng bảo mật ở đúng ba trục checklist U12, mỗi trục đóng một TODO đã ghi sẵn:

**A. Mã hóa bí mật tại nghỉ (envelope encryption).** Package thuần mới `@vat/crypto` (`packages/crypto`): `sealSecret(plaintext, kek)` / `openSecret(sealed, kek)` bằng **AES-256-GCM (envelope: KEK bọc DEK ngẫu nhiên mỗi bản ghi)** qua `crypto.subtle`, chuỗi lưu **tự mô tả** (`v1$aesgcm$<iv_b64>$<wrappedDek_b64>$<ct_b64>`). KEK nạp từ **Workers Secret** (`env`), **không** hard-code, **không** commit. Seam `sealToken/openToken` áp cho `tai_khoan_thue.token_hien_tai` (và `secret_ref` nếu #1 chốt). Không lưu mật khẩu thuế thô — **bất biến pháp lý, không đổi**.

**B. Audit log append-only + masking.** (1) Migration ràng buộc **không-ghi-đè**: `REVOKE UPDATE, DELETE ON audit_log FROM <role_app>` (quyền BẢNG, đứng trên RLS `FOR ALL`); giữ `INSERT`+`SELECT`. (2) Helper `maskSensitive(chiTiet)` trong `@vat/crypto` (hoặc `@vat/db`) chặn token/password/`raw_json`/connection-string lọt vào `chi_tiet` — áp tại các call-site audit hiện có (thay đổi tối thiểu). (3) Test: UPDATE/DELETE audit bị DB từ chối bằng role app; INSERT/SELECT vẫn chạy.

**C. Rate-limit client hardening.** (1) `RateLimiterConfig` **tiêm được qua `env`** (ngưỡng theo môi trường, không hardcode `DEFAULT_LIMITER_CONFIG` cứng trong DO). (2) **Quan sát**: phát counter khi acquire bị từ chối / breaker mở (Analytics Engine binding hoặc log có cấu trúc đã mask — theo #3). (3) Test tường minh **"chặn vượt ngưỡng"** ở mức hành vi client: chuỗi acquire vượt `capacity` → bị chặn; đủ lỗi liên tiếp → breaker mở → call bị chặn (một phần đã có ở U9; U12 bổ sung ca "vượt ngưỡng" như tiêu chí nghiệm thu U12 gốc + đường tiêm config).

**NGOÀI phạm vi (fence rõ):**
- ❌ **Không** dựng đường GHI token (authenticate U1 → persist token). U1 trả token nhưng **chưa đơn vị nào** lưu nó; xây flow lưu = đơn vị nghiệp vụ riêng (đăng nhập/refresh token). U12 chỉ cung cấp **seam mã hóa sẵn sàng** + test bằng fixture (**Điểm mơ hồ #1**).
- ❌ **Không** đổi hợp đồng GDT / `GdtTransport` / captcha / xử lý 401 (đã ổn ở U1/U9).
- ❌ **Không** đổi lược đồ nghiệp vụ (không thêm bảng); trục A đổi **kiểu lưu** của `token_hien_tai` (vẫn `text`, nội dung là chuỗi sealed) — không migration cột mới trừ khi #1 cần.
- ❌ **Không** viết lại logic limiter (`tryAcquire`/`recordResult`) — chỉ tiêm config + quan sát + test.
- ❌ **Không** đưa bí mật vào code/log/URL (Hiến pháp §Privacy); KEK chỉ ở Workers Secret.
- ❌ **Không** đụng frontend, không đụng module đối chiếu (U10) / export-kế-toán (U11).

## File sẽ tạo/sửa (đề xuất — phụ thuộc 3 quyết định)

**`@vat/crypto` (package thuần mới):**
| File | Vai trò |
|---|---|
| `packages/crypto/package.json`, `tsconfig.json`, `vitest.config.ts` *(mới)* | Khung package workspace `@vat/crypto` (thuần, không phụ thuộc DB/network) |
| `packages/crypto/src/envelope.ts` *(mới)* | `sealSecret`/`openSecret` (AES-256-GCM envelope, `crypto.subtle`), chuỗi tự mô tả `v1$aesgcm$…`; `timingSafe`-style lỗi (không rò lý do giải mã) |
| `packages/crypto/src/mask.ts` *(mới)* | `maskSensitive(value)` — che token/password/connstr/`raw_json` trước khi ghi log/`chi_tiet` |
| `packages/crypto/src/index.ts` *(mới)* | export công khai |
| `packages/crypto/test/unit/envelope.test.ts`, `mask.test.ts` *(mới)* | unit thuần offline |

**`@vat/db` (seam token + append-only):**
| File | Vai trò |
|---|---|
| `packages/db/migrations/0002_*.sql` *(mới)* | `REVOKE UPDATE, DELETE ON audit_log FROM <role_app>` (append-only ở tầng BẢNG) + ghi chú điều kiện provision role (CHƯA KIỂM CHỨNG trên DB thật, cùng lớp `0001`) |
| `packages/db/src/tokenVault.ts` *(mới — hoặc trong `@vat/crypto`)* | `storeToken`/`readToken` bọc `sealSecret`/`openSecret` quanh `tai_khoan_thue.token_hien_tai`, tenant-scoped (`withTenant`) |
| `packages/db/src/index.ts` *(sửa)* | export seam mới |
| `packages/db/test/{unit,integration}/*.test.ts` *(mới)* | append-only (role app UPDATE/DELETE → từ chối); vòng seal→store→read→open đúng token gốc; token trong DB **không** phải plaintext |

**Call-site áp masking + đọc token đã mã hóa (thay đổi tối thiểu):**
| File | Vai trò |
|---|---|
| `apps/sync-worker/src/recorder.ts` *(sửa)* | `loadAccountToken` → giải mã qua `readToken`; `chi_tiet` audit qua `maskSensitive` |
| `apps/sync-worker/src/runJob.ts` *(sửa)* | dùng token đã giải mã (thay đọc `tokenHienTai` thô) |
| `apps/api/src/routes/exports.ts` *(sửa)* | `chi_tiet` audit qua `maskSensitive` |
| `apps/sync-worker/src/tenantLimiter.ts` + `types.ts` *(sửa)* | nhận `RateLimiterConfig` từ `env`; phát counter quan sát khi từ chối/breaker |
| `apps/*/wrangler.jsonc` + `.dev.vars.example` *(sửa)* | khai báo secret KEK + (nếu #3) Analytics Engine binding — **giá trị không commit** |

**Tài liệu:** `docs/CHECKLIST-NGHIEM-THU.md` (đánh dấu U12 + mục D hoàn thành dự án), `README.md` (biến bí mật KEK, lệnh `wrangler secret put`), `.claude/rules/security.md` nếu cần ghi rõ định dạng sealed (không tạo nguồn sự thật thứ hai).

## Test viết trước (TDD)

Nhóm theo `testing.md`. `make test` = `unit`+`integration` (offline: PGlite; không gọi mạng GDT). U12 **không** có nhóm `contract` mới (không đổi hợp đồng GDT).

**`unit`** (`@vat/crypto`, thuần offline):
1. `envelope`: `openSecret(sealSecret(pt, kek), kek) === pt` (round-trip nhiều giá trị/độ dài, kể cả rỗng & UTF-8 tiếng Việt); ciphertext **khác** plaintext; hai lần seal cùng plaintext → **IV/DEK khác nhau** (không tất định); KEK sai → **giải mã thất bại rõ ràng** (không trả rác, không rò lý do); chuỗi sealed hỏng/thiếu trường → thất bại có kiểm soát.
2. `mask`: token/password/connection-string/`raw_json` bị che (không xuất hiện nguyên văn ở đầu ra); trường vô hại giữ nguyên; lồng nhau (object/array) vẫn che đúng.

**`integration`** (`@vat/db` + `apps`, PGlite + **role app non-owner**; seed ≥ 2 tenant):
3. **Append-only audit**: bằng role app, `INSERT` audit OK; `SELECT` OK; **`UPDATE`/`DELETE` bị từ chối** (quyền BẢNG). Kiểm cho cả owner-role không lọt (đối chiếu mẫu FORCE RLS U8).
4. **Token vault vòng đủ**: `storeToken(tenant A, token)` → hàng DB có `token_hien_tai` **không phải** chuỗi token gốc; `readToken` trả đúng token; **cách ly tenant**: A không đọc được token B (`withTenant`+RLS).
5. **Masking tại call-site**: khi ghi audit ở `recorder`/`exports`, `chi_tiet` **không** chứa token/`raw_json`; test chứng minh masking được áp (không chỉ có helper).
6. **Rate-limit "chặn vượt ngưỡng"** (tiêu chí U12 gốc): với config tiêm, chuỗi `tryAcquire` vượt `capacity` → lời gọi tiếp theo **bị chặn**; `recordResult(fail)` đủ `failureThreshold` → breaker **mở** → acquire bị chặn tới hết `cooldownMs`. (Mở rộng ca U9 sang góc "vượt ngưỡng" + đường config từ env.)

**Ca lỗi/biên bắt buộc:** KEK thiếu trong `env` → khởi tạo báo lỗi rõ (không chạy với mã hóa "rỗng"); token `null` (chưa đăng nhập) → `readToken` trả `null` sạch, không ném; `chi_tiet` rỗng/`null` → masking an toàn.

## Tiêu chí nghiệm thu (đo được)

1. **Mã hóa/giải mã** (checklist U12 gạch 1): `@vat/crypto` round-trip đúng; ciphertext ≠ plaintext; KEK sai → fail; test đỏ→xanh; coverage `@vat/crypto` ≥ 80% (trừ `index.ts`). KEK **chỉ** từ Workers Secret (không literal trong repo — kiểm bằng grep sạch).
2. **Không lưu mật khẩu thuế thô** (gạch 2): 0 đường ghi mật khẩu thuế; `token_hien_tai` khi có giá trị **luôn** là chuỗi sealed (test khẳng định không plaintext). Bất biến pháp lý `security.md` giữ nguyên.
3. **Audit append-only** (gạch 3): role app **không** UPDATE/DELETE được `audit_log`; INSERT/SELECT vẫn chạy; `chi_tiet` đã mask (không token/`raw_json`). Có test chứng minh.
4. **Chặn vượt ngưỡng rate limit** (gạch 4): test tường minh vượt `capacity`/`failureThreshold` → bị chặn; config tiêm được qua `env` (không hardcode cứng trong DO).
5. **Read-mostly hạ tầng**: 0 bảng mới; 1 migration append-only (idempotent, DO-guard như `0001`); mọi giá trị vận hành CHƯA KIỂM CHỨNG (role app cụ thể, provision KEK/Analytics binding trên DB/Cloudflare thật) **gắn nhãn**, không "chốt" khi chưa có bằng chứng.
6. `make lint` sạch; `make test` xanh; **không giảm coverage tổng**; cập nhật checklist U12 + mục D; commit nhỏ. **Đơn vị cuối → chạy toàn bộ hồi quy U0–U12 xanh** (mục 5 quy trình điều phối).

## Ràng buộc bắt buộc chạm tới

- ✅ **Bảo mật (`security.md`) — trọng tâm cả đơn vị**: envelope encryption token tại nghỉ; **không** mật khẩu thuế thô; **không** log token/`raw_json` (masking); audit append-only; bí mật qua Workers Secret, không commit.
- ✅ **`tenant_id`/RLS (`multi-tenant.md`)**: token vault + audit truy cập qua `withTenant`; **test cách ly tenant** cho token vault; append-only test dùng **role app non-owner** (không owner bỏ qua).
- ✅ **Nguyên tắc bằng chứng (bài học `:30000`)**: KHÔNG "chốt" các điều kiện chỉ đúng trên hạ tầng thật (grant REVOKE cho role app cụ thể, provision KEK, Analytics binding) khi chưa kiểm trên DB/CF thật — **gắn nhãn CHƯA KIỂM CHỨNG**, cùng lớp lưu ý role BYPASSRLS ở `0001`.
- ✅ **Không nguồn sự thật thứ hai**: định dạng sealed & tham số crypto khai báo **một chỗ** (`@vat/crypto`); config limiter vẫn quanh `DEFAULT_LIMITER_CONFIG` (tiêm, không nhân đôi).
- ✅ **Testing (`testing.md`)**: TDD đỏ→xanh; offline; ≥ 80% tầng nghiệp vụ.
- ⚪ **Cô lập adapter / captcha / 401**: KHÔNG áp dụng (U12 không đổi hợp đồng GDT).

## Rủi ro & phụ thuộc

- 🔴 **Không có đường GHI token hiện tại** (kiểm chứng ở trên) → mã hóa token dễ thành "seam chết chưa ai gọi". Rủi ro đúng loại `:30000` (xây hạ tầng cho tiền đề chưa dùng). Giảm thiểu: **Điểm mơ hồ #1** — chốt phạm vi trước; nếu chỉ làm seam + fixture, nêu rõ "sẵn sàng, chưa wiring GHI runtime".
- 🟠 **Append-only cần role app non-owner tách bạch owner**; PGlite test phải mô phỏng đúng role như U8. Grant/REVOKE trên DB thật (Neon/Supabase) cần quyền provider → **CHƯA KIỂM CHỨNG**, gắn nhãn.
- 🟠 **KEK ở đâu**: Workers Secret vs Secrets Store; xoay vòng KEK (envelope cho phép re-wrap DEK không giải toàn bộ) — **Điểm mơ hồ #2**. Quản lý vòng đời/rotation KEK có thể là hạng mục vận hành riêng.
- 🟠 **"Quan sát" limiter**: Analytics Engine binding vs log có cấu trúc — bề mặt binding mới, cần cấu hình wrangler thật → **Điểm mơ hồ #3**; đề xuất mức tối thiểu (counter/log đã mask) để không phình.
- 🟠 **Workers CPU 5'**: AES-GCM/PBKDF2 rẻ; không rủi ro. Giữ iteration/kích thước hợp lý.
- ⚪ Dựng trên U8 (password/crypto WebCrypto), U9 (limiter), U4 (schema audit/token). Độc lập U10/U11.

## Điểm mơ hồ — DỪNG và hỏi (Hiến pháp §"Khi gặp mơ hồ" + Nguyên tắc bằng chứng)

> U12 **không** phải đoán cấu trúc phản hồi API thuế. Nhưng ba câu dưới **chặn việc chốt phạm vi** của đơn vị cuối; mỗi câu kèm phương án đề xuất + cách kiểm chứng. (Cùng khuôn 3 quyết định chặn của U11.)

### #1 — Mã hóa token: chỉ **seam + fixture**, hay wiring cả đường GHI token?
- **Bằng chứng**: hiện **không đơn vị nào** persist token thật (`grep tokenHienTai` chỉ đọc/xóa). Xây "authenticate → lưu token mã hóa" là **flow nghiệp vụ mới** (đăng nhập/refresh), vượt "làm cứng".
- **Đề xuất (mặc định)**: U12 hiện thực **`@vat/crypto` + `storeToken`/`readToken` seam đầy đủ + test bằng fixture** (chứng minh mã hóa/giải mã đúng, không plaintext, cách ly tenant) và **đấu vào điểm ĐỌC hiện có** (`recorder`/`runJob`). Đường **GHI runtime** (login lưu token) tách **đơn vị sau**, gắn nhãn rõ "seam sẵn sàng, chưa wiring ghi".
- **Kiểm chứng**: unit round-trip + integration "token trong DB không phải plaintext" trên fixture đã đủ chứng minh trục A, không cần login thật.

### #2 — KEK: **Workers Secret** đơn giản hay **Secrets Store + rotation** ngay từ U12?
- **Bằng chứng**: `security.md` nêu cả "Workers Secrets / Secrets Store"; envelope cho phép rotation KEK bằng re-wrap DEK.
- **Đề xuất (mặc định)**: U12 dùng **một KEK từ Workers Secret** + định dạng sealed **có version** (`v1$…`) để **mở đường rotation** về sau; **rotation/Secrets Store là hạng mục vận hành riêng**, không nhồi vào đơn vị cuối. Nếu chủ dự án muốn rotation ngay → mở rộng test + helper `rewrap`.
- **Kiểm chứng**: version-tag trong chuỗi sealed + test "đọc được `v1`" chứng minh khả năng nâng cấp mà không phá dữ liệu cũ.

### #3 — "Quan sát" rate limit: mức tối thiểu (log đã mask) hay **Analytics Engine binding** đầy đủ?
- **Bằng chứng**: ADR-0001 nêu Analytics Engine cho định lượng theo tenant; nhưng đó là binding mới cần cấu hình wrangler thật (CHƯA KIỂM CHỨNG trong test offline).
- **Đề xuất (mặc định)**: U12 phát **counter/log có cấu trúc đã mask** khi acquire bị chặn/breaker mở (test được offline qua seam), và **tùy chọn** ghi Analytics Engine sau seam (wiring khi deploy, không chặn DoD). Tránh phình binding trong đơn vị cuối.
- **Kiểm chứng**: test seam quan sát (spy) chứng minh sự kiện "vượt ngưỡng" được phát; binding thật là wiring deploy.

---

**Bàn giao.** Kế hoạch tách rạch ròi **cơ chế bảo mật dựng+test được ngay** (envelope crypto, masking, append-only, config tiêm) vs **wiring/vận hành cần hạ tầng thật** (đường GHI token, rotation KEK, Analytics binding, grant role app trên DB thật — gắn nhãn CHƯA KIỂM CHỨNG). **CHỜ 3 quyết định chặn** (#1 phạm vi token, #2 KEK, #3 quan sát) từ chủ dự án. Sau khi chốt: `/write-prompt 12` → `/start-unit 12`.
> ⚠️ Cho `/write-prompt`: nhấn mạnh (a) tái dùng khuôn `crypto.subtle`/chuỗi tự mô tả của `password.ts`, KHÔNG bịa định dạng mới; (b) append-only test bằng **role app non-owner** (mẫu U8), owner-role phải cũng bị chặn UPDATE/DELETE; (c) mọi điều kiện chỉ đúng trên DB/CF thật phải gắn nhãn CHƯA KIỂM CHỨNG; (d) đơn vị cuối → chạy hồi quy U0–U12 trước khi coi là xong.

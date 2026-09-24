# Thiết kế — Giám sát lối vào GDT, đợt 1 (U43)

- **Ngày:** 2026-09-24
- **Trạng thái:** đã duyệt, đang thi công theo docs/superpowers/plans/2026-09-24-giam-sat-loi-vao-gdt-dot-1.md
- **Phạm vi:** `packages/gdt-client` (phân loại + canary), `apps/sync-worker` (cron canary, sức khỏe, sink cảnh báo), package mới `packages/thong-bao` (Telegram dùng chung, chuyển từ `apps/api`), `apps/api` route login thuế (mã lỗi riêng khi WAF chặn), `apps/web` màn Kết nối tài khoản thuế (thông điệp), tài liệu hợp đồng + runbook. Không đụng schema DB, không migration.
- **Nguồn:** mục "Đề xuất phát hiện tự động" trong `docs/BACKLOG-y-tuong-va-de-xuat.md` [2026-09-24]; đợt này lấy biện pháp **1, 2, 6** + phần báo ở web (chủ dự án chốt 2026-09-24). Biện pháp 3, 4, 5 (đợt 2) và 7–10 (đợt 3) KHÔNG thuộc spec này.

## 1. Vấn đề

Từ ~10/09 đến 24/09/2026, WAF của GDT (cookie `TS*`, F5 BIG-IP) trả `403 {"message":"Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn."}` cho mọi `POST /api/security-taxpayer/authenticate` thiếu header `request-id`. Hệ quả đo được trên production: 0 lượt đăng nhập GDT thành công trong 14 ngày, 0/11 tài khoản còn token, đồng bộ nền dừng từ 09/09. Không chuông nào kêu. Đã vá nguyên nhân trực tiếp (merge `aac9499`, deploy 24/09), nhưng bốn khoảng trống giám sát vẫn còn nguyên (đối chiếu mã 24/09):

1. Probe egress mỗi 15 phút (`apps/sync-worker/src/index.ts`, `egressProbe.ts`) chỉ GET `/api/captcha` — WAF không áp lên captcha nên probe luôn `OK`.
2. `classify()` (`packages/gdt-client/src/transport.ts:31`) xếp **mọi** 403/451 vào `GEO_BLOCKED`. Nếu WAF chặn cả captcha, hệ thống hiểu nhầm là chặn địa lý, tính chuyển relay VN (đang treo), nơi cũng bị chặn y hệt vì chặn theo header.
3. Cảnh báo CRITICAL của probe chỉ là `console.error` (`apps/sync-worker/src/deps.ts:60`) — không tới người thật. Telegram có sẵn nhưng nằm trong `apps/api/src/thongBao/telegram.ts`, chỉ báo tenant đăng ký mới; sync-worker không với tới.
4. Khi GDT chặn, người dùng ở màn Kết nối tài khoản thuế thấy "Captcha hoặc mật khẩu không đúng" (sai bản chất) và thử đi thử lại vô ích — mỗi lượt lại đập vào WAF.

Mục tiêu đợt 1: **biết trong vòng một giờ** khi lối vào đăng nhập GDT bị chặn hoặc đổi dạng, **báo tới chủ dự án qua Telegram**, và **nói đúng sự thật với người dùng** ở màn kết nối.

## 2. Đối tượng phục vụ

- **Chủ dự án / vận hành:** nhận một tin Telegram có đủ dữ kiện để hành động (loại sự cố, mã HTTP, thông điệp GDT nguyên văn, giờ, việc cần làm) — không phải đọc log Workers.
- **Người dùng cuối (kế toán):** khi GDT chặn, thấy thông điệp đúng và không bị dụ nhập lại captcha liên tục.

## 3. Quyết định đã chốt

| # | Quyết định | Người chốt |
|---|---|---|
| QĐ-1 | Đợt 1 = biện pháp 1 (canary authenticate), 2 (tách `WAF_BLOCKED`), 6 (Telegram dùng chung) + báo đúng ở web | Chủ dự án, 2026-09-24 |
| QĐ-2 | Canary đặt trong `packages/gdt-client` (`canaryAuthenticate`), không viết ở sync-worker bằng `transport.fetch` thô — kiến thức hợp đồng GDT chỉ nằm trong adapter (`gdt-adapter.md`) | Thiết kế, chủ dự án duyệt 2026-09-24 |
| QĐ-3 | Telegram thành package `@vat/thong-bao`, chuyển nguyên `telegram.ts` + test từ `apps/api`; không gọi endpoint nội bộ, không chép mã | Thiết kế, chủ dự án duyệt 2026-09-24 |
| QĐ-4 | Canary chạy **mỗi giờ, một lời gọi, một nguồn** (cron riêng); MST giả `0000000000`, captcha cố ý sai; **không** giải captcha, **không** né chặn, **không** xoay IP. *Tiền đề chịu lực: GDT kiểm **captcha TRƯỚC** (kiểm chứng 24/09) nên lời gọi không đụng tài khoản nào — việc MST này có tồn tại hay không là **CHƯA KIỂM CHỨNG** và không cần thiết.* | Thiết kế theo ranh giới Hiến pháp |
| QĐ-5 | `WAF_BLOCKED`/`DRIFT` từ canary → **báo ngay lần đầu** (tín hiệu xác định), im cho tới khi hồi phục, hồi phục → báo "đã thông lại". `TIMEOUT`/`ERROR` giữ ngưỡng 3 lần liên tiếp | Thiết kế |
| QĐ-6 | Probe `/captcha` thấy `WAF_BLOCKED` → **chặn enqueue đồng bộ** như `GEO_BLOCKED`, **không** chuyển relay. Canary bị chặn → **chỉ báo**, không chặn đồng bộ (token còn hạn vẫn kéo được; chưa có bằng chứng query bị chặn) | Thiết kế |
| QĐ-7 | Route login thuế gặp WAF → `503 {"error":"gdt_chan"}` + audit lý do `waf_blocked`; web ánh xạ đủ bốn nhánh (409 / 422 / 503 / còn lại) | Chủ dự án, 2026-09-24 |
| QĐ-8 | Hai secret Telegram cho `vat-sync-worker` do **chủ dự án tự đặt** bằng `wrangler secret put` (cùng giá trị với `vat-api`); mã không cầm giá trị | Ranh giới `security.md` |

## 4. Thiết kế

### 4.1 Phân loại lỗi và canary — `packages/gdt-client`

- `ProbeVerdict` thêm `"WAF_BLOCKED"`. Chữ ký WAF là một hằng duy nhất `WAF_BLOCK_SIGNATURE = "hành vi không hợp lệ"` (so khớp không phân biệt hoa thường, sau khi chuẩn hoá Unicode NFC) kèm chú thích ngày kiểm chứng 2026-09-24 và thông điệp đầy đủ đã quan sát.
- `classify(status, timedOut, errored, body?)`: 403 và `body` chứa chữ ký → `WAF_BLOCKED`; 403/451 khác → `GEO_BLOCKED` (giữ nguyên); phần còn lại không đổi. `directTransport.probe()` đọc tối đa 1 KB thân phản hồi khi status là 403 rồi truyền vào `classify`.
- `isWafBlocked(err: unknown): boolean` trong `errors.ts`: `GdtError` có `httpStatus === 403` và `message` chứa chữ ký. API và canary dùng chung, không ai tự so chuỗi.
- `canaryAuthenticate(transport, opts?)` trong `src/canary.ts`:
  - Bước 1 `getCaptcha(transport)` (maxAttempts 1). Lỗi/timeout ở đây → `ERROR`/`TIMEOUT`.
  - Bước 2 `authenticate(transport, { username: "0000000000", password: "canary-khong-dung", ckey, cvalue: "0000" }, { maxAttempts: 1 })`.
  - Phân loại: ném `GdtError` httpStatus 401 → `OK` (GDT vẫn xử lý nghiệp vụ; mong đợi "Mã captcha không đúng."); `isWafBlocked` → `WAF_BLOCKED`; trả về token thành công → `DRIFT` (không thể đúng với MST giả); mọi dạng khác (403 không chữ ký, 4xx/5xx khác, JSON lạ, `GdtContractDriftError`) → `DRIFT` kèm `httpStatus` + `message`; timeout → `TIMEOUT`; lỗi mạng → `ERROR`.
  - Trả `{ verdict, httpStatus?, message?, latencyMs }`. Không retry ở bất kỳ bước nào (QĐ-4).
- Contract test: ca "WAF trên /authenticate" viết ngày 24/09 chuyển sang gọi `canaryAuthenticate` thật và kỳ vọng `OK` — một nguồn chân lý cho cả CI lẫn runtime.

### 4.2 Cron canary, sức khỏe, cổng chặn — `apps/sync-worker`

- `wrangler.jsonc`: thêm cron `"0 * * * *"` (`CANARY_CRON`). Giới hạn Cloudflare: 250 cron trigger/tài khoản trên Workers Paid (tài liệu `workers/platform/limits`, đọc 2026-09-24) — không vướng. `scheduled()` thêm nhánh `event.cron === CANARY_CRON` trước nhánh đồng bộ.
- `canaryHealth.ts` (thuần, không I/O): `CanaryState = { lastVerdict?, consecutiveBad, alerted, since?, daChao? }`; `nextCanaryHealth(prev, result)` trả `{ state, alert: { kind: "chan" | "drift" | "loi_lien_tiep" | "hoi_phuc", ... } | null }` theo QĐ-5. `HEALTHY_CANARY` là trạng thái ban đầu; alert `kind: "bat_giam_sat"` (kiểm cái chuông khi deploy) phát khi **cờ bền `daChao` chưa bật** — KHÔNG phải khi `prev === undefined`. *Sửa sau review cuối U43: neo vào `prev === undefined` thì một tick đầu vướng nhiễu mạng (`TIMEOUT` dưới ngưỡng 3) làm `prev` hết undefined vĩnh viễn ⇒ mất chuông thử-khi-deploy, lặng lẽ.* Cờ `daChao` chỉ bật khi tin **giao được**, và đi xuyên cả nhánh verdict xấu. Kèm `trangThaiKhiGiaoHong(step, prev)` — trạng thái để lưu khi cảnh báo KHÔNG giao được (giữ diễn biến, hạ dấu "đã báo").
- `egressHealth.ts` (DO `EgressHealth`): thêm khoá `"canary"` với hai đường `/canary/load`, `/canary/save`; `egressHealthClient` thêm `loadCanary()/saveCanary()`. Không tạo DO mới.
- `runCanary(deps)` trong `canary.ts` (cùng khuôn `runEgressProbe`): gọi `canaryAuthenticate` → `nextCanaryHealth` → lưu → `emitCanaryAlert` nếu có. Mọi I/O tiêm qua deps để test offline.
- `health.ts`: `isEgressBlocked(state)` trả true khi `lastVerdict` là `GEO_BLOCKED` **hoặc** `WAF_BLOCKED` (QĐ-6). Log gate ghi rõ loại.

### 4.3 Kênh báo người thật — `packages/thong-bao` + sink ở sync-worker

- Package `@vat/thong-bao` (khuôn `packages/crypto`: `main: src/index.ts`, vitest + coverage ≥ 80%). Chuyển nguyên `apps/api/src/thongBao/telegram.ts` và `apps/api/test/unit/telegram.test.ts` sang; `apps/api` import từ package, `types.ts`/`index.ts` của api chỉ đổi đường import. Hành vi tin "đăng ký mới" không đổi.
- Tách cấu hình: `kiemTraCauHinhTelegram(env)` chỉ đòi `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`; `URL_CONG_ADMIN` do riêng `baoDangKyMoi` kiểm (nó là thứ duy nhất cần URL). Trim giữ nguyên (bài học 2026-07-22).
- Thêm `soanTinGiamSatGdt(sk: SuKienGiamSatGdt): string` (HTML, đã escape): tiêu đề theo `kind`; dòng verdict + mã HTTP + thông điệp GDT nguyên văn (không có secret, không có dữ liệu tenant — canary dùng MST giả); giờ Việt Nam; nước egress nếu có; dòng "Việc cần làm" trỏ `docs/runbooks/gdt-doi-phuong-thuc.md`.
- `apps/sync-worker`: `Env` thêm `TELEGRAM_BOT_TOKEN?`, `TELEGRAM_CHAT_ID?` (secret, QĐ-8). Sink cảnh báo (`deps.ts`) cho cả probe egress lẫn canary: **vẫn** `console.error` CRITICAL như cũ, **và** gửi Telegram; thiếu cấu hình → `console.warn` nêu đúng mảnh thiếu, không ném; gửi hỏng → warn, không ném. Cảnh báo probe egress (`GEO_BLOCKED`/`WAF_BLOCKED`/... sau 3 tick) từ nay cũng tới Telegram.

### 4.4 API và web — nói đúng với người dùng

- `apps/api/src/routes/taxAccounts.ts` (`POST /:id/login`), trong `catch`: sau kiểm `GdtContractDriftError`, nếu `isWafBlocked(err)` → audit `dang_nhap_thue_that_bai` với `chiTiet.reason = "waf_blocked"` (không chép thông điệp dài) → `503 {"error":"gdt_chan"}`. Các trường hợp còn lại giữ `422 gdt_tu_choi`. API **không** gửi Telegram (không có chống lặp theo trạng thái ở tầng stateless; canary là đường báo, độ trễ ≤ 1 giờ).
- `apps/web` `LoginStep`: `loginError` theo `status`/`code`: 409 → "Chưa ủy quyền…"; 422 `gdt_tu_choi` → "Captcha hoặc mật khẩu không đúng. Vui lòng nhập lại với captcha mới."; 503 `gdt_chan` → "Tổng cục Thuế đang chặn yêu cầu từ hệ thống. Kỹ thuật đã được báo, vui lòng thử lại sau."; còn lại (0 mạng, 502, 5xx khác) → "Không kết nối được với Tổng cục Thuế. Vui lòng thử lại sau." `onError`: chỉ xin captcha mới khi 422 (captcha cũ đã bị tiêu); 503/khác giữ captcha hiện tại.
- `docs/06-BINDING_MAP.md`: thêm `503 gdt_chan` cho route login thuế + ánh xạ web.

### 4.5 Runbook

`docs/runbooks/gdt-doi-phuong-thuc.md` (ngắn, ≤ 1 trang): dấu hiệu (tin Telegram nào, audit ra sao) → tải bundle portal, tìm interceptor axios (`request-id`/`Action`/`End-Point`), so header → curl tái lập (mẫu lệnh đã dùng 24/09, MST giả) → sửa `withRequestId`/luật `gdt-adapter.md` → contract test → deploy worker → api → web → xác nhận bằng `audit_log` và tin canary "hồi phục".

## 5. Kiểm thử (tiêu chí nghiệm thu, mỗi dòng một test tự động)

- gdt-client: `classify` 403+chữ ký → `WAF_BLOCKED`; 403 không chữ ký → `GEO_BLOCKED`; 451 → `GEO_BLOCKED`; `probe()` đọc thân 403 và phân loại đúng; `isWafBlocked` đúng/sai; `canaryAuthenticate` trên mock: 401 → `OK`, 403+chữ ký → `WAF_BLOCKED`, 200 có token → `DRIFT`, 500 → `DRIFT` kèm httpStatus, captcha lỗi → `ERROR`, timeout → `TIMEOUT`, và **không** gọi quá 2 request (không retry). Contract: `canaryAuthenticate` thật → `OK` (log verdict/status/message).
- sync-worker: `nextCanaryHealth` — `WAF_BLOCKED` lần đầu → alert `chan`, lần hai → null; `OK` sau chặn → `hoi_phuc`; `TIMEOUT` ×2 → null, ×3 → `loi_lien_tiep`; chưa có cờ `daChao` + `OK` → `bat_giam_sat` (một lần cho tới khi tin giao được). `isEgressBlocked` true với `WAF_BLOCKED`. `runCanary` gọi đúng thứ tự **load → emit → save** (*sửa sau review cuối U43: thứ tự cũ load → save → emit làm mất cảnh báo khi Telegram gửi hỏng*); sink trả `false` ⇒ tick sau **báo lại**; sink ném ⇒ cron không chết và cũng coi là chưa giao; mỗi tick ghi một dòng nhịp tim `gdt_canary_tick`. Sink: gửi Telegram khi có cấu hình; thiếu cấu hình → warn, không ném, và **trả "chưa giao"**; nội dung không chứa bot token.
- thong-bao: test cũ của Telegram chạy nguyên; `soanTinGiamSatGdt` escape HTML, có đủ trường, không có secret; `kiemTraCauHinhTelegram` không còn đòi `URL_CONG_ADMIN`.
- api (PGlite): login gặp `GdtError` 403 + chữ ký → `503 gdt_chan`, không lưu token, audit reason `waf_blocked`; 401 sai captcha vẫn `422 gdt_tu_choi` (không hồi quy).
- web: 503 `gdt_chan` → hiện đúng thông điệp, **không** về màn đăng nhập, **không** refetch captcha; 422 → refetch captcha (không hồi quy); lỗi mạng → thông điệp "Không kết nối được".
- `make lint`, `make test` xanh; `make test-contract` xanh; coverage ≥ 80% ở package mới.

## 6. Vận hành

1. Chủ dự án đặt secret: `wrangler secret put TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` trong `apps/sync-worker` (cùng giá trị `vat-api` đang dùng). *Cập nhật sau review cuối U43: đặt secret SAU khi deploy không còn làm MẤT tin — sink phải giao được mới được ghi `alerted`, nên cảnh báo được báo lại mỗi giờ tới khi đặt xong. Đặt trước vẫn gọn hơn, nhưng không còn là điểm mất chuông.*
2. Deploy `vat-sync-worker` → `vat-api` → `vat-web` (grep bundle web trước deploy). Không migration.
3. Nghiệm thu thật: trong ≤ 1 giờ sau deploy, Telegram nhận tin "giám sát GDT đã bật" rồi tin canary đầu (mong `OK`); `wrangler tail` thấy log canary — mỗi tick có một dòng `gdt_canary_tick` (INFO) kèm `verdict`/`httpStatus`/`latencyMs`, kể cả khi không có cảnh báo. Ghi Version ID vào backlog mục [2026-09-24]. *Lưu ý: nếu tick đầu vướng nhiễu mạng (`TIMEOUT`/`ERROR`) thì chưa có tin chào — cờ `daChao` vẫn tắt nên tick `OK` kế tiếp sẽ chào.*
4. Rollback: gỡ cron canary khỏi `wrangler.jsonc` + deploy lại worker; API/web độc lập, rollback riêng.

## 7. Ngoài phạm vi (đợt sau)

Chỉ số tài khoản còn token (3), gom audit 24 giờ (4), nhịp tim đồng bộ/dead-man's switch (5), CI gọi Telegram (7), nhánh drift trong `classifyFailure` của sync (8), theo dõi bundle portal (9), diễn tập định kỳ (10). Không bật relay T1. Không chống lặp Telegram ở tầng API.

## 8. Giả định và rủi ro

- **CHƯA KIỂM CHỨNG — độ ổn định dài hạn của 401 với MST giả:** GDT có thể đổi cách trả cho MST giả (vd 400 "MST không hợp lệ") → canary báo `DRIFT` giả. Xử lý: tin `DRIFT` mang mã + thông điệp để người đọc quyết nhanh; nếu xảy ra, cập nhật bảng phân loại có kiểm chứng.
- **CHƯA KIỂM CHỨNG — WAF có đếm lượt đăng nhập sai theo IP không:** 24 lượt/ngày từ biên Cloudflare là rất thấp; nếu thấy 429 hoặc chặn dạng khác, hạ tần suất (cron 6 giờ) — chỉ đổi một chuỗi cron.
- Chữ ký WAF là chuỗi tiếng Việt do GDT kiểm soát; đổi chữ ngữ → rơi về `GEO_BLOCKED` (vẫn báo, chỉ sai nhãn). Chấp nhận, ghi trong runbook.
- Chuyển `telegram.ts` sang package là di dời mã, không đổi hành vi — rủi ro chính là đường import; test cũ giữ nguyên để bắt.

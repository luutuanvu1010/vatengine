# Kế hoạch U25 — "Cầm máu" 429: tôn trọng Retry-After + backoff + giãn nhịp trong adapter GDT

> Trạng thái (2026-07-17): **B2, B3, B4 ĐÃ HIỆN THỰC + TEST XANH** (AC1/AC2/AC3/AC4/AC5/AC6 phủ test unit+integration, `make lint && make test` xanh). **B1 CHƯA PROBE THẬT** — không có token GDT thật trong phiên này; `retryAfterMs` hiện thực AN TOÀN cho cả hai khả năng (số giây | HTTP-date | không có header → fallback backoff mũ) như plan cho phép khi chưa kiểm chứng được, nhưng định dạng thật **VẪN CHƯA KIỂM CHỨNG** — cần một phiên có token thật để đóng B1 dứt điểm. **B5 (wiring env) HOÃN** — mặc định code (`http.ts`) là nguồn ngưỡng; chưa thêm `GDT_MIN_INTERVAL_MS`/`GDT_MAX_BACKOFF_MS` vào wrangler.jsonc, dời sang khi có nhu cầu tinh chỉnh production thật (U26 hoặc mục backlog riêng). **AC7 (cấu hình hóa qua RetryOptions) hoàn thành ở mức tham số hàm** — chưa hoàn thành ở mức env.
>
> Nguồn gốc: mục backlog `docs/BACKLOG-y-tuong-va-de-xuat.md` — *"[2026-07-16] Đồng bộ DÒNG HÀNG … cần kiến trúc queue 2 pha + backfill"*, phần **"Cập nhật [2026-07-17] — bằng chứng bổ sung"** (lỗ "cầm máu" rẻ nhất chưa vá). Phát hiện lại + chốt phạm vi: phiên Cowork 2026-07-17.
>
> Quan hệ với U26: U25 là **bước cầm máu ĐỘC LẬP, làm TRƯỚC**; U26 (queue 2 pha tách detail) là bản sửa kiến trúc lớn, làm sau. U25 KHÔNG bị U26 làm cho thừa: kể cả sau khi tách pha detail, mỗi message pha 2 vẫn gọi `fetchWithRetry` → cơ chế tôn trọng 429/Retry-After của U25 vẫn được dùng.
>
> Luật áp dụng: `gdt-adapter.md` (mọi gọi ra GDT qua adapter + `GdtTransport`; timeout + retry backoff; **tôn trọng máy chủ thuế** — không gọi dồn dập; 401 → dừng, báo hết phiên), `testing.md` (TDD, coverage ≥ 80% tầng nghiệp vụ), `security.md` (không log token/giá trị hóa đơn). Hiến pháp §Ranh giới đạo đức ("tôn trọng máy chủ thuế: rate limit phía client, backoff, circuit breaker. Không gọi dồn dập") là ràng buộc cứng — U25 chính là hiện thực trực tiếp nguyên tắc này ở lớp adapter.

---

## 1. Tiền đề đã kiểm chứng (đọc từ mã nguồn 2026-07-17 — KHÔNG suy đoán)

Mọi khẳng định dưới đây tái lập được bằng cách đọc file đã dẫn. Đây là bề mặt hiện có mà U25 **sửa tại chỗ, không dựng lại**.

| Thành phần đã có | Sự thật (dẫn nguồn) | Hệ quả cho U25 |
|---|---|---|
| `fetchWithRetry` | `packages/gdt-client/src/http.ts:41-62` — retry CHỈ khi `res.status >= 500 && attempt < maxAttempts` (dòng 49-52) hoặc lỗi mạng/timeout trong `catch` (dòng 54-60). `401` return ngay không retry (dòng 48). **`429` không khớp nhánh nào → rơi vào `return res` (dòng 53)** → KHÔNG chờ, KHÔNG backoff, KHÔNG đọc `Retry-After`. | Đây là điểm sửa CHÍNH: thêm nhánh coi `429` (và `503`) là lỗi tạm → chờ theo `Retry-After` rồi retry. |
| `RetryOptions` | `http.ts:7-18` — `timeoutMs?` (mặc định 10 000), `maxAttempts?` (mặc định 3), `backoffMs?` (mặc định 300, nhân đôi mỗi lần: `backoffMs * 2 ** (attempt-1)`, dòng 50/58). | Mở rộng option (thêm cờ retry 429, trần chờ, giãn nhịp) theo **cùng khuôn tùy chọn có mặc định an toàn** — không đổi chữ ký bắt buộc, tương thích ngược. |
| Phân trang header | `query.ts:92-157` `queryOne` — vòng `while` gọi `fetchWithRetry` mỗi trang (dòng 102-107) rồi lặp ngay khi còn `state` (dòng 155-156), **không nghỉ giữa trang**. `!res.ok` → `throw new GdtError(..., "HTTP_ERROR", res.status)` (dòng 129-133) — **có mang `res.status`**. Comment dòng 63 đã tự ghi nhận: *"Probe cũng gặp HTTP 429 khi gọi dồn — GDT rate-limit phía server."* | Giãn nhịp giữa trang (min interval). 429 sau khi kiệt lượt retry vẫn ném `GdtError` **mang `httpStatus=429`** (đã sẵn) → tầng job phân loại được. |
| Lấy chi tiết | `detail.ts:103-115` `getInvoiceDetail` — cũng qua `fetchWithRetry`; nhưng `!res.ok` → `throw new GdtError(\`… (HTTP ${res.status}).\`)` **KHÔNG truyền `res.status`** làm tham số (dòng 114) → `err.httpStatus` = undefined. | **Lệch với `query.ts`**: 429 ở nhánh detail KHÔNG phân loại được bằng `httpStatus`. U25 sửa để đồng nhất (mang `httpStatus`). |
| Lấy detail tuần tự | `sync.ts:384-395` — khi có `fetchDetail`, lặp `for (const row of rows)` gọi `await opts.fetchDetail(...)` **tuần tự (concurrency 1) nhưng KHÔNG nghỉ giữa hóa đơn**. | Giãn nhịp giữa mỗi lần lấy detail (min interval) — cùng cơ chế với giãn nhịp giữa trang. |
| Phân loại lỗi job | `sync.ts:129-133` `classifyFailure` — chỉ `SESSION_EXPIRED` → `session_expired`; **mọi lỗi khác → `transient`**. `runJob.ts:85-86` — `transient` → `{kind:"retry"}` ⇒ `consumerAction` (`fanout.ts:85-87`) → `message.retry()` **TÍNH vào `max_retries`** (`wrangler.jsonc:37` = 5) → dead-letter khi vượt. | 429 kiệt lượt hiện bị coi `transient` → `retry` thật → **đập lại GDT + tiêu `max_retries`**. Cầm máu: map 429 → **backpressure** (`retry_backpressure`, reenqueue có delay, KHÔNG tính `max_retries` — đường đã có sẵn ở `fanout.ts:78-84`). |
| Backpressure đã có | `types.ts:108-112` `JobOutcome` có sẵn `retry_backpressure`; `fanout.ts:78-84` reenqueue có delay + tăng `bpAttempt`, đạt trần (`FANOUT_MAX_BACKPRESSURE`, mặc định 10) → `retry` thật. `runJob.ts:36-41` đã dùng cho `rate_limited`/`breaker_open` của limiter. | U25 **tái dùng nguyên đường backpressure này** cho 429 runtime — không phát minh cơ chế mới. |

**CHƯA KIỂM CHỨNG (phải xác minh trong bước hiện thực — chưa được chốt ở kế hoạch này):**
- **GDT có trả header `Retry-After` khi 429 không, và ở dạng nào** (số giây hay HTTP-date). Chưa quan sát trực tiếp phản hồi 429 thật. → Bước B1 phải **probe/kiểm chứng** (đọc header 429 thật, ghi lại), thiết kế fallback: **không có `Retry-After` → dùng backoff mũ** (không giả định định dạng).
- **Ngưỡng giãn nhịp (min interval) + trần chờ hợp lý** để vừa giảm 429 vừa không kéo dài vô ích. Đặt mặc định thận trọng, **đánh dấu là trần an toàn chưa tối ưu**, tinh chỉnh bằng đo tải thật (liên quan mục backlog "rate limit toàn cục" + U26).

---

## 2. Vấn đề & mục tiêu

**Vấn đề (triệu chứng người dùng):** đồng bộ hóa đơn liên tục **thất bại với HTTP 429**. Bằng chứng định lượng đã ghi ở backlog (đọc DB production 2026-07-16): 188 lần đồng bộ → 170 FAILED, trong đó **~99 lần là 429**. Gốc rễ kép: (a) adapter **gọi dồn** hàng chục–hàng nghìn request liên tiếp (phân trang header + detail từng hóa đơn) không giãn nhịp; (b) khi GDT trả 429, adapter **không chờ mà ném lỗi ngay**, rồi tầng job **retry thật** → đập lại GDT.

**Mục tiêu U25 (cầm máu — thay đổi tối thiểu, độc lập, tương thích ngược):**
1. Adapter **tôn trọng 429**: chờ theo `Retry-After` (nếu có) rồi thử lại, có trần — thay vì ném lỗi tức thì.
2. Adapter **giãn nhịp**: có khoảng nghỉ tối thiểu giữa các trang và giữa các lần lấy detail — bớt tạo ra 429 ngay từ đầu.
3. Khi vẫn 429 sau khi đã chờ hết trần: **không đập dồn** — tầng job đẩy lùi (backpressure, reenqueue có delay) thay vì retry thật tính `max_retries`.

**Ngoài phạm vi U25 (không làm ở đơn vị này — xem §7):** tách pha detail sang queue (U26), rate-limit TOÀN CỤC giữa các tenant (mục backlog riêng), thay đổi mô hình consumer/producer, đo tải tối ưu ngưỡng.

---

## 3. Tiêu chí nghiệm thu (Definition of Done cho U25)

Mỗi tiêu chí phải có test tự động phủ, toàn bộ xanh; `make lint` sạch; coverage tầng nghiệp vụ không giảm dưới 80%; không lộ bí mật trong code/log; cập nhật tài liệu liên quan; commit nhỏ theo lát cắt.

1. **AC1 — `fetchWithRetry` coi 429 là lỗi tạm.** Khi `res.status === 429` (và `503`) và còn lượt (`attempt < maxAttempts`): **chờ rồi retry**. Ưu tiên **`Retry-After`**: parse dạng số giây; nếu là HTTP-date thì quy ra khoảng chờ; không có/không parse được → **backoff mũ như hiện tại**. Hết lượt vẫn 429 → `return res` (429) để caller ném lỗi có `httpStatus`. *(Test thuần: transport giả trả 429 + header `Retry-After`, rồi 200 → hàm chờ đúng và trả 200; đếm số lần gọi.)*
2. **AC2 — Có trần chờ, không treo Worker.** Khoảng chờ mỗi lần bị **giới hạn bởi `maxBackoffMs`** (option mới, mặc định thận trọng). `Retry-After` lớn bất thường → chờ tối đa `maxBackoffMs` **hoặc** bỏ cuộc trả 429 để tầng job backpressure (chốt cách xử ở B2, không treo). *(Test: `Retry-After: 3600` không làm hàm chờ 1 giờ.)*
3. **AC3 — Giãn nhịp giữa các lần gọi.** `queryOne` (phân trang header) và vòng lấy detail trong `sync.ts` có **khoảng nghỉ tối thiểu (`minIntervalMs`, option mới, mặc định > 0)** giữa hai request liên tiếp. Áp cho CẢ pha header lẫn detail. *(Test: đo có gọi delay giữa các trang/detail; `minIntervalMs = 0` → tắt, để test khác chạy nhanh.)*
4. **AC4 — Đồng nhất mang `httpStatus` ở nhánh detail.** `getInvoiceDetail` (`detail.ts`) ném `GdtError` **kèm `res.status`** như `query.ts` đã làm — để 429 ở detail phân loại được. *(Test: 429 ở detail → `err.httpStatus === 429`.)*
5. **AC5 — 429 kiệt lượt → backpressure, KHÔNG retry thật.** `classifyFailure` (`sync.ts`) phân biệt 429 (từ `GdtError.httpStatus === 429`) → nhãn mới (vd `rate_limited`); `runScheduledSync` (`runJob.ts`) map nhãn đó → `{kind:"retry_backpressure", reason:"rate_limited"}` (reenqueue có delay, KHÔNG tính `max_retries`). *(Test offline runJob: sync trả failed+429 → outcome `retry_backpressure`.)*
6. **AC6 — 401 vẫn KHÔNG retry (regression guard) + không log nhạy cảm.** Giữ nguyên hành vi 401 → return ngay (`http.ts:48`) → `SESSION_EXPIRED`. Không có đường nào khiến 401 bị retry. Backoff/chờ **không log token, không log giá trị hóa đơn**; nếu log để quan sát thì chỉ metadata (status, số lần thử, khoảng chờ). *(Test: 401 → 1 lần gọi duy nhất.)*
7. **AC7 — Cấu hình hóa, mặc định an toàn.** Các ngưỡng mới (`maxBackoffMs`, `minIntervalMs`, cờ retry 429, số lần thử cho 429) qua `RetryOptions` (tiêm từ tầng gọi) với **mặc định thận trọng**; nếu bind qua env ở worker thì theo khuôn `resolveFanoutConfig`/`resolveLimiterConfig` (bỏ trống/không hợp lệ → mặc định). Không hardcode rải rác.

---

## 4. Thiết kế (khối chức năng — chi tiết chốt trong bước hiện thực)

### 4A. `packages/gdt-client/src/http.ts` — trái tim cầm máu
- Mở rộng `RetryOptions`: thêm `retryOn429?: boolean` (mặc định `true`), `maxBackoffMs?: number` (trần mỗi lần chờ), `minIntervalMs?: number` (giãn nhịp — dùng ở caller, xem 4B). Có thể tách số lần thử riêng cho 429 nếu cần (chốt B2).
- Trong vòng `for`, thêm nhánh: `res.status === 429 || res.status === 503` và `attempt < maxAttempts` → tính `wait = retryAfterMs(res) ?? backoffMs * 2 ** (attempt-1)`, `wait = min(wait, maxBackoffMs)`, `await sleep(wait)`, `continue`. Giữ nguyên nhánh `5xx`/`catch` hiện có.
- Hàm thuần `retryAfterMs(res): number | undefined` — đọc header `Retry-After` (số giây | HTTP-date), trả ms hoặc `undefined`. Thuần, dễ test biên.

### 4B. Giãn nhịp giữa các request (min interval)
- Cách tối thiểu, thuần: thêm `sleep(minIntervalMs)` giữa hai vòng lặp trong `queryOne` (`query.ts`) và giữa hai lần `fetchDetail` trong `sync.ts` (chỉ khi `minIntervalMs > 0`). Không cần token-bucket ở đây (đó là U26/limiter). Mục tiêu chỉ là **không bắn liên tiếp không nghỉ**.
- Cân nhắc (chốt B3): gói thành một helper `pace(minIntervalMs)` để không lặp code ở hai nơi.

### 4C. Phân loại + backpressure ở tầng job
- `sync.ts:classifyFailure`: nếu `err instanceof GdtError && err.httpStatus === 429` → trả nhãn mới (mở rộng union `failureKind` thêm `"rate_limited"`), else giữ `transient`/`session_expired`.
- `runJob.ts`: nhánh thất bại, nếu `failureKind === "rate_limited"` → `{kind:"retry_backpressure", reason:"rate_limited"}` (tái dùng đường `fanout.ts:78-84`), vẫn `limiter.recordResult(false)` (đóng góp mở circuit breaker khi 429 dồn — đúng tinh thần "không gọi dồn dập").

### 4D. (Tùy chọn) Wiring env ở worker
- Nếu muốn tinh chỉnh production không cần đổi code: thêm vars `GDT_MIN_INTERVAL_MS`, `GDT_MAX_BACKOFF_MS`, `GDT_MAX_ATTEMPTS` vào `apps/sync-worker/wrangler.jsonc` + `apps/api` (nơi gọi sync "Đồng bộ ngay"), resolve theo khuôn `resolveFanoutConfig`, truyền vào `syncParams.retry`. Có thể để B4 hoặc dời sang U26 nếu làm phình U25 — quyết định khi hiện thực.

---

## 5. Phân rã bước (lát cắt con — mỗi lát tự chạy + tự test, theo vòng lặp U0–U12)

> Mỗi lát: đọc spec → **viết test trước** → hiện thực tối thiểu → `make lint && make test` → review chéo subagent → commit nhỏ. **Mỗi lần một lát.**

- **B1 — Kiểm chứng `Retry-After` của GDT (research, có thể không đổi code tính năng).** Probe/đọc phản hồi 429 thật (tái dùng `scripts/gdt-*` nếu có token) để biết GDT có gửi `Retry-After` không và ở dạng nào; ghi kết quả vào plan/ADR. Nếu không probe được token thật lúc này → thiết kế `retryAfterMs` **an toàn cho cả hai khả năng** (có/không header) và ghi rõ "CHƯA KIỂM CHỨNG định dạng thật". Cổng: không để giả định định dạng header hóa thành "chốt".
- **B2 — `retryAfterMs` + nhánh 429/503 trong `fetchWithRetry`** (AC1, AC2, AC6). Test thuần với transport giả (429+Retry-After → 200; 429 hết lượt → trả 429; `Retry-After` khổng lồ bị cap; 401 → 1 lần gọi; 5xx giữ nguyên hành vi). Không mạng thật.
- **B3 — Giãn nhịp giữa trang + giữa detail** (AC3). `minIntervalMs` option + áp ở `queryOne` và `sync.ts`. Test: có delay khi >0, tắt khi =0. Không mạng thật.
- **B4 — Đồng nhất `httpStatus` ở detail + phân loại 429 → backpressure** (AC4, AC5). Sửa `detail.ts` mang `res.status`; mở rộng `failureKind` + `classifyFailure` + `runJob` map sang `retry_backpressure`. Test: detail 429 → `httpStatus`; runJob offline: failed+429 → `retry_backpressure` (không tính max_retries).
- **B5 — (Tùy chọn) Wiring env** (AC7 phần env). Nếu quyết định làm: vars + resolve + truyền `syncParams.retry`. Nếu hoãn: ghi rõ mặc định code là nguồn ngưỡng, dời tinh chỉnh env sang U26.
- **B6 — Contract/soát khớp cuối** (verification): rà toàn bộ AC; chạy `make test` + `make lint`; `make test-contract` để chắc thay đổi không phá contract GDT; review chéo bằng subagent độc lập (dod-auditor + security-reviewer); cập nhật `docs/BACKLOG` (trạng thái cầm máu → "Đã lên kế hoạch/đã làm → U25") + tài liệu liên quan.

---

## 6. Rủi ro & phụ thuộc

- **Không biết chắc GDT gửi `Retry-After`** (§1 CHƯA KIỂM CHỨNG). Giảm thiểu: fallback backoff mũ khi thiếu header; B1 là cổng kiểm chứng trước khi "chốt" định dạng.
- **Chờ quá lâu làm nghẽn Worker** (giới hạn wall-time/CPU, `wrangler.jsonc:9-14` — Free trần CPU 10ms/lần, wall-time có hạn). Giảm thiểu: `maxBackoffMs` cap + ưu tiên backpressure (nhả job, thử lại sau) hơn là chờ dài trong một lần gọi. Đây cũng là lý do U25 **không thay** đường tách queue của U26.
- **Ngưỡng min-interval/backoff chưa tối ưu** — đặt mặc định thận trọng, tinh chỉnh bằng đo tải thật (U26 + mục "rate limit toàn cục"). Không chốt số cứng như cam kết hiệu năng.
- **U25 làm giảm 429 nhưng KHÔNG giải triệt để tải detail** ở quy mô ~2000 HĐ/kỳ trong một lần gọi Worker (còn vướng trần subrequest Cloudflare "Too many subrequests" — ~33 lần fail trong bằng chứng backlog). Triệt để là U26 (mỗi hóa đơn một message). U25 = giảm đau + tôn trọng máy chủ thuế ngay; U26 = chữa gốc.

---

## 7. Không làm (ranh giới rõ ràng)
- Không tách pha detail sang queue (đó là **U26**); không đổi mô hình producer/consumer.
- Không giải rate-limit **toàn cục** giữa các tenant (mục backlog riêng).
- Không đổi `currentPeriodWindow`/cron/pipeline U5 ngoài đúng điểm giãn nhịp + phân loại 429.
- Không tự đăng nhập GDT thay người dùng; không phá captcha; 401 vẫn dừng và báo hết phiên.
- Không log token/giá trị hóa đơn khi thêm quan sát backoff.

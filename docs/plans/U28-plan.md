# U28 — Kìm nhịp gọi GDT theo TỪNG REQUEST (trả nợ permit-per-request cho pha 1)

> **Mục tiêu cao nhất của đơn vị này:** người dùng chọn **một khoảng thời gian bất kỳ**
> và hệ thống **đồng bộ được đầy đủ hoá đơn của khoảng đó**.
>
> Trạng thái: ⬜ KẾ HOẠCH — chưa hiện thực. Lập theo `.claude/skills/plan-unit`.
> Ngày lập: 2026-07-18. Nền: trunk `7f5ceae` (sau U27 + 4 commit vá sự cố 2026-07-18).

## 0. Vì sao cần U28 (bằng chứng đo được, không suy đoán)

Kiến trúc cho "khoảng tuỳ chọn" **đã có sẵn và đúng**: `monthlyWindows` (U22) chẻ khoảng
bất kỳ thành job theo tháng, `MAX_PAGES=2000` không phải rào cản thật, upsert idempotent
(U5) cho phép chạy lại vô hại. **Thứ hỏng là: mỗi job tháng đều chết.**

| Bằng chứng (production, 2026-07-18) | Số liệu |
|---|---|
| Tỷ lệ job đồng bộ thành công / 24h | **`completed=1`, `failed=100`** |
| Request GDT mà MỘT job pha 1 bắn ra, trên **1 permit** | **tới 42** (`2026-07 sold`) |
| Cấu hình limiter đang tưởng là đang áp | `capacity=10`, `refill=2/s` |
| Kết quả | GDT trả **HTTP 429** → job `failed` → **0 dữ liệu** |

**Gốc rễ (đã xác thực 3 lớp độc lập):**

1. **Dấu vết code** — `runJob.ts:31` gọi `limiter.tryAcquire()` **đúng một lần**, rồi
   `deps.sync()` phân trang tự do: `sync.ts` không có limiter, `query.ts` không có
   throttle. Vòng lặp là **ba tầng** (`kinds` × `statusList` × `while(true)` phân trang).
2. **Định lượng** — `DEFAULT_SIZE=50`; `2026-07 sold` có 2034 hoá đơn ⇒ 41 trang sco + 1
   normal = **42 request / 1 permit**. `2026-05 sold`: 30 request / 1 permit.
3. **Đối chứng hành vi** — cùng lúc, cùng tenant, cùng token: **pha 2 chạy trơn**
   (`runDetailJob.ts:67` lấy **1 permit / 1 request**, dòng hàng tăng đều 290 → 164)
   trong khi **pha 1 429 liên tục** (4/4 run). Khác biệt duy nhất là tỷ lệ permit/request.

Món nợ này **đã được ghi nhận sẵn trong code**: `runDetailJob.ts` dòng 2-3 —
*"1 permit TenantLimiter / request GDT (**trả nợ permit-per-request** của kiến trúc
queue 2 pha)"*. U26 biết pha 1 còn thiếu khoản này nhưng chưa trả. **U28 trả nốt.**

### 0b. Giả thuyết ĐÃ BỊ BÁC BỎ trong phiên 2026-07-18 — đừng điều tra lại

Ghi lại để phiên sau không tốn công dò lại vòng cũ:

- ❌ *"Circuit breaker kẹt mở do bug"* — **sai**. `rateLimiter.ts:111` chặn theo
  `breakerOpenUntilMs > nowMs`, **tự đóng theo thời gian**; đã quan sát nó tự lành
  (140 sự kiện 100% `ok`). Breaker mở vì hệ thống thật sự hỏng, nó làm đúng việc.
- ❌ *"Endpoint `sco` detail sai/chưa kiểm chứng nên 290 HĐ mất dòng hàng"* — **sai**.
  Probe thật 2026-07-18 08:28Z: `/api/sco-query/invoices/detail` trả **HTTP 200**, có
  `hdhhdvu` đủ khoá `ten/sluong/dgia/dvtinh/ltsuat/tsuat/tthue`. **Nhãn CHƯA KIỂM CHỨNG
  ở `endpoints.ts:38-39` nay ĐÃ ĐỦ ĐIỀU KIỆN GỠ** (xem §8).
- ❌ *"GDT chặn request không giống trình duyệt"* — **sai**. A/B test: chỉ gửi
  `authorization` vẫn **200**; thêm UA/Referer/Origin **không đổi gì**.
- ❌ *"GDT khắt khe với `sco` hơn `normal` (429 tỷ lệ 52:5)"* — **sai**. Toàn bộ hoá đơn
  **bán ra** của tenant này là `sco` (normal = **0**), nên ~41/42 request của job sold
  đi vào sco. Tỷ lệ 52:5 là **phân bố khối lượng request**, không phải bản chất sco.
- ❌ *"Nới xử lý lỗi sco-429 → `hoan_thanh_mot_phan` để giữ dữ liệu normal"* — **rút lại**.
  Dựng trên tiền đề sai ở trên: chiều bán ra **không có dữ liệu normal nào để giữ**.

## 1. Phạm vi

**Trong phạm vi:** bọc `GdtTransport` bằng một lớp trang trí kìm nhịp, để **mọi** lời gọi
ra GDT của job nền đều phải xin permit từ `TenantLimiter` — thay vì 1 permit cho cả job.

**NGOÀI phạm vi (cố ý):**
- Không sửa `packages/gdt-client` và `packages/sync` — một dòng cũng không.
- Không đổi cách phân loại/xử lý lỗi 429 ở adapter. U28 chặn 429 **từ nguồn**; nếu thành
  công thì nhánh xử lý 429 gần như không còn được kích hoạt.
- Không đoán trước con số `LIMITER_REFILL_PER_SEC` mới (xem §5, §8).
- Không đụng pha 2 (`runDetailJob`) — nó **đã đúng**, dùng làm khuôn tham chiếu.
- Không đụng `apps/api`, `apps/web`.

## 2. File sẽ tạo/sửa

| File | Việc |
|---|---|
| `apps/sync-worker/src/throttledTransport.ts` | **TẠO** — decorator `GdtTransport` xin permit trước mỗi `fetch()` |
| `apps/sync-worker/test/unit/throttledTransport.test.ts` | **TẠO** — test đơn vị (offline, thời gian tiêm) |
| `apps/sync-worker/src/deps.ts` | **SỬA** — bọc transport khi dựng `makeJobDeps` |
| `apps/sync-worker/test/unit/runJob.test.ts` | **SỬA** — thêm ca khẳng định pha 1 kìm nhịp theo request |
| `docs/plans/U28-plan.md` | file này |

**Không** tạo migration (không đụng schema).

## 3. Test viết trước (TDD — nhóm theo `.claude/rules/testing.md`)

Toàn bộ nhóm **`unit`** (offline, mock `GdtTransport` + `TenantLimiterClient`, tiêm hàm
chờ để không ngủ thật):

1. `N lần fetch → ĐÚNG N lần tryAcquire` (khoá chính xác tiêu chí U28; test này phải ĐỎ
   trên code hiện tại nếu áp vào đường pha 1).
2. `permit allowed → gọi transport gốc, trả nguyên Response` (không đổi ngữ nghĩa).
3. `reason='breaker_open' → ném NGAY, KHÔNG gọi transport gốc, KHÔNG chờ` (breaker mở là
   fail-fast; chờ trong request vô nghĩa vì cooldown 60s).
4. `reason='rate_limited' → CHỜ rồi thử lại, thành công ở lượt sau → vẫn trả Response`
   (giỏ token tự đầy; đây là nhịp mong muốn).
5. `rate_limited kéo dài quá trần chờ → ném lỗi có kiểu` (không treo Worker).
6. `lỗi ném ra ánh xạ vào nhánh retry_backpressure ĐÃ CÓ` — không sinh đường xử lý mới.
7. Hồi quy: toàn bộ test `runJob`/`runDetailJob` hiện có **giữ nguyên xanh**.

**Kiểm chứng test có răng:** sau khi xanh, chạy **mutation test** (vô hiệu hoá phần xin
permit) và xác nhận test 1 chuyển ĐỎ — như đã làm ở commit `158908c`.

## 4. Thiết kế (chốt trước để không đoán khi code)

**Vì sao bọc `GdtTransport` thay vì bơm limiter vào `queryInvoices`:** ADR-0001 quy định
*"mọi gọi ra đi qua interface `GdtTransport` (đường ra hoán đổi được)"* — đây đúng là cái
khe thiết kế sẵn cho việc này.

| | Bơm limiter vào adapter | **Bọc transport (chọn)** |
|---|---|---|
| `packages/gdt-client` | phải sửa, phải biết khái niệm permit | **không đụng** |
| `packages/sync` | phải sửa để truyền xuống | **không đụng** |
| Phạm vi bảo vệ | chỉ chỗ nào nhớ gọi | **mọi** lời gọi GDT, tự động |
| Cô lập adapter (`gdt-adapter.md`) | rò rỉ khái niệm hạ tầng vào adapter | giữ nguyên |

**Ánh xạ kết quả `tryAcquire()` (đã trả sẵn `{allowed, reason}`):**

| reason | Hành vi | Lý do |
|---|---|---|
| `allowed` | gọi transport gốc | — |
| `rate_limited` | **chờ + thử lại**, có trần tổng | giỏ đầy 2 token/s ⇒ các trang tự giãn ~500ms, đúng "không gọi dồn dập" |
| `breaker_open` | **ném ngay**, không chờ | breaker cooldown 60s — chờ trong request là treo vô ích |
| quá trần chờ | ném lỗi có kiểu | rơi vào nhánh `retry_backpressure` **đã tồn tại** |

**Ghi chú kế toán permit:** `runJob.ts:31` giữ nguyên lần `tryAcquire()` đầu (cho fail-fast
+ audit `breakerSkip`), nên một job tiêu `1 + N` permit thay vì `N`. Lệch 1 token trên giỏ
10 — **thiên về thận trọng**, chấp nhận, ghi rõ trong comment thay vì im lặng.

## 5. Tiêu chí nghiệm thu (đo được — bám mục tiêu cao nhất)

**Cổng code:**
- `make lint` sạch; `make test` xanh toàn bộ (hiện 128 file test).
- Test §3.1 đỏ → xanh; mutation test xác nhận có răng.
- Review chéo bằng subagent độc lập (`dod-auditor`) trước khi coi là xong.

**Cổng production — đây mới là nghiệm thu thật của mục tiêu:**
1. Chọn **một khoảng nhiều tháng** (vd `2026-04-01 → 2026-07-31`), bấm "Đồng bộ khoảng này".
2. `lan_dong_bo` cho khoảng đó: **`completed` cho MỌI tháng × MỌI chiều**, `so_hd_moi > 0`
   ở tháng thật sự có hoá đơn. Đối chiếu mốc trước: `completed=1 / failed=100`.
3. **KHÔNG còn** `thong_diep_loi LIKE '%429%'` sinh mới trong quá trình đó.
4. Số hoá đơn trong DB của khoảng đó **khớp** với số hiển thị trên trang GDT (đối chiếu thủ
   công 1 tháng — chủ dự án xác nhận, vì chỉ họ đăng nhập được portal).
5. Banner UI hiện `xong`, không hiện `loi_dong_bo`.

## 6. Ràng buộc bắt buộc chạm tới

- **Cô lập adapter** (`gdt-adapter.md`): U28 **không** sửa `packages/gdt-client`; decorator
  nằm ở `apps/sync-worker` và chỉ hiện thực interface `GdtTransport` công khai. ✅
- **Tôn trọng máy chủ thuế** (Hiến pháp, mục ranh giới đạo đức): U28 **tăng** mức tôn
  trọng — kìm ở nguồn thay vì chịu phạt rồi chữa. Không có ý đồ né hạn mức. ✅
- **Đa tenant** (`multi-tenant.md`): limiter đã khoá theo tenant/MST (`tenantLimiterClient`);
  U28 không đổi khoá, không đụng truy vấn dữ liệu. ✅
- **401** (`gdt-adapter.md`): decorator **không** nuốt 401 — trả nguyên Response để lớp
  trên xử lý `SESSION_EXPIRED` như cũ. ✅
- **Bảo mật** (`security.md`): decorator **không** log token/URL đầy đủ/thân phản hồi. ✅
- **TDD** (`testing.md`): test trước, nhóm `unit`, không gọi mạng thật. ✅

## 7. Rủi ro & phụ thuộc

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Job pha 1 chạy lâu hơn (42 req @2/s ≈ **21s** wall-time) | Trung bình | Workers **Paid** đã bật + `limits.cpu_ms: 300000` đã khôi phục (2026-07-18); thời gian *chờ* không tính CPU. Theo dõi wall-time sau deploy. |
| 2 req/s vẫn còn bị 429 | Trung bình | Sau U28, `LIMITER_REFILL_PER_SEC` **mới thật sự có hiệu lực** (hiện gần như vô tác dụng với pha 1) ⇒ hạ dần theo số liệu, **không đoán trước**. |
| `max_concurrency: 3` × job dài ⇒ thông lượng thấp khi nhiều tenant | Thấp (hiện 1 tenant) | Hạn mức GDT là **theo MST**, nên mở rộng ngang theo tenant vẫn đúng. Xem lại khi nhiều tenant thật. |
| Token GDT hết hạn giữa backfill dài nhiều tháng | Trung bình | Job nền **không** tự đăng nhập (ranh giới Hiến pháp). Pre-flight đã trả `needs_reauth`; UI đã có banner. Khoảng rất dài nên chia đợt. |
| Backfill dòng hàng (pha 2) và header (pha 1) giành cùng hạn ngạch | Trung bình | Sau U28 cả hai đều xin permit/request nên **chia sẻ công bằng** qua cùng một giỏ — đây là hệ quả TỐT, không phải rủi ro mới. |

## 8. Điểm cần chủ dự án quyết (KHÔNG chặn U28)

1. **Gỡ nhãn `CHƯA KIỂM CHỨNG` cho `DETAIL_ENDPOINTS.sco`** (`endpoints.ts:38-39`). Đã có
   bằng chứng probe thật (2026-07-18 08:28Z, HTTP 200 + `hdhhdvu` đủ khoá). Theo
   `gdt-adapter.md`, việc gỡ nhãn cần kèm **contract test sco thật** — nên tách thành đơn
   vị riêng (U29?) chứ không nhét vào U28. **Đề xuất: làm ngay sau U28.**
2. **Sau U28, nếu vẫn còn 429**: hạ `LIMITER_REFILL_PER_SEC` 2 → 1 (hoặc thấp hơn) và/hoặc
   `LIMITER_CAPACITY` 10 → 5. Cần số liệu sau deploy mới chốt được con số — không đoán.
3. **Nợ tồn từ sự cố 2026-07-18** (đã ghi `docs/BACKLOG-y-tuong-va-de-xuat.md`):
   `"The operation was aborted"` (n=43) vẫn bị tính vào breaker GDT vì chưa đủ bằng chứng
   nó là lỗi nền tảng hay GDT chậm. Theo dõi sau khi Paid + `cpu_ms` đã bật.

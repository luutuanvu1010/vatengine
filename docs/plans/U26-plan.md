# U26 — Queue 2 pha cho dòng hàng hóa đơn + backfill dòng hàng

**Ngày:** 2026-07-17 · **Trạng thái:** ĐÃ HIỆN THỰC + review chéo PASS · **Nhánh:** `claude/u26-detail-queue` (base `feat/cloudflare-stack-u0` @ c9cc9cc)

> **Đổi số U25→U26 (2026-07-17):** trong lúc đơn vị này chạy, trunk đã nhận **U25 = "cầm máu 429 ở adapter"** (Retry-After + backoff + giãn nhịp, `docs/plans/U25-plan.md`) — chính plan đó quy hoạch "U26 = queue 2 pha tách detail". Hai bước A (httpStatus ở detail.ts) và G (429 header → `rate_limited` → backpressure) của kế hoạch dưới đây **đã được U25 giao trước** (AC4/AC5) — khi merge lấy bản trunk; phần còn lại (B..F, hardening) là nội dung U26.

**Nguồn quyết định (đã chốt trước, không bàn lại):**
- `docs/BACKLOG-y-tuong-va-de-xuat.md` mục *[2026-07-16] Đồng bộ DÒNG HÀNG… queue 2 pha + backfill* — **Hướng A** đã chọn (brainstorm 2026-07-16, chủ dự án ghi nợ; nay tới lượt làm theo yêu cầu "khắc phục lỗi không hiển thị tên hàng hoá dịch vụ và số lượng" 2026-07-17).
- `docs/GIAI-PHAP-thieu-truong-va-mtt.md` — 3 quyết định A (2 pha qua queue), B (sco lỗi không nuốt — đã xong ĐV1), C (idempotent dòng hàng = xóa-chèn theo `hoadon_id`, primitive `persistInvoiceLines` đã có).

**Bằng chứng lỗi (đọc DB production 2026-07-16, ghi trong BACKLOG:128-131):** 2029 hóa đơn / 0 dòng hàng; 170/188 `lan_dong_bo` FAILED (≈99 GDT HTTP 429, ≈33 Cloudflare "Too many subrequests", ≈28 timeout); token còn sống. Gốc rễ: `packages/sync/src/sync.ts:385-395` fetch detail TUẦN TỰ cho mọi hóa đơn trong MỘT lần gọi Worker (`apps/sync-worker/src/deps.ts:71` tiêm `fetchDetail` vô điều kiện), vượt trần Workers Free + đập 429 vào GDT.

## 1. Phạm vi

Tách pha lấy dòng hàng ra khỏi job đồng bộ header: pha 1 (header) enqueue **1 message chi tiết / hóa đơn mới-hoặc-đổi-trạng-thái** vào queue `vat-sync`; pha 2 (consumer mới trên cùng queue) xử **1 hóa đơn / message** — lấy **1 permit `TenantLimiter` / request**, gọi `getInvoiceDetail`, lưu `dong_hang_hoa` idempotent; 429/breaker → reenqueue có delay (tái dùng `consumerAction`); 401 → đánh dấu token chết. Kèm **trigger backfill** enqueue message chi tiết cho mọi hóa đơn đang thiếu dòng hàng (trả nợ 2029 HĐ prod).

**NGOÀI phạm vi (không làm trong U26):**
- KHÔNG đổi hình dạng `SyncJobMessage` header (U22 + cron + "Đồng bộ ngay" phát message cũ phải chạy nguyên — BACKLOG:141).
- KHÔNG thêm cột "tên hàng hóa/số lượng" vào DANH SÁCH hóa đơn (đúng thiết kế U23-A: dòng hàng ở màn CHI TIẾT — BACKLOG:127; muốn đổi cần quyết định chủ dự án, xem §7).
- KHÔNG đụng U22 B7/B8, KHÔNG đụng BackfillTracker DO (tracker chỉ theo dõi backfill HEADER theo tháng).
- KHÔNG ghi `hoan_thanh_mot_phan` (chưa có writer nào; ngoài nhu cầu U26).
- KHÔNG đặt rate-limit TOÀN CỤC (mục riêng trong BACKLOG, cần đo tải thật trước).

**Ngữ nghĩa giữ nguyên (ràng buộc tương thích U22 B3/B6):** `lan_dong_bo.trangThai='completed'` tiếp tục nghĩa là **header của kỳ đã xong** (dòng hàng về sau, bất đồng bộ). Nếu đổi, `coveredMonths` sẽ coi tháng là "chưa phủ" và U22 backfill lặp vô hạn. Ghi chú tường minh vào tài liệu.

## 2. File sẽ tạo/sửa

| Bước | File | Việc |
|---|---|---|
| A | `packages/gdt-client/src/detail.ts` (~:114) | Truyền `res.status` vào `GdtError` (khớp mẫu `query.ts:129-133`) để consumer phân biệt 429/404/5xx qua `err.httpStatus` (hiện `undefined`) |
| A | `packages/gdt-client/test/unit/detail.test.ts` | Test mới: 429 → `GdtError` `httpStatus=429`, đúng **1** fetch (429 không bị adapter retry); bổ sung assert `httpStatus` cho ca 5xx |
| B | `packages/sync/src/syncJob.ts` | Thêm `DetailSyncMessage` (`kind:"detail"`, `tenantId`, `taikhoanId`, `hoaDonId`, `ref{nbmst,khhdon,khmshdon,shdon,source}`, `bpAttempt?`), union `VatSyncQueueMessage`, type guard `isDetailMessage` (message KHÔNG có `kind` = header → tương thích lùi với message đang bay + producer đã deploy) |
| B | `packages/sync/test/unit/detailMessage.test.ts` | Guard phân biệt đúng; header cũ không `kind` → false |
| C | `packages/sync/src/sync.ts` | `SyncResult.detailCandidates: DetailCandidate[]` — {hoaDonId, ref} cho HĐ **mới hoặc đổi trạng thái**, resolve id TRONG transaction (mẫu `persistLinesForBatch`); đường inline `fetchDetail` GIỮ NGUYÊN (test regression linelines phải xanh, KHÔNG nới assertion) |
| C | `packages/sync/test/integration/sync.detailCandidates.test.ts` | Mới → đủ candidates; chạy lại không đổi → rỗng; đổi trạng thái → có; ref đúng nguồn sco/normal |
| D | `apps/sync-worker/src/types.ts`, `deps.ts`, `runJob.ts` | GỠ tiêm `fetchDetail` (deps.ts:71); `RunJobDeps.enqueueDetail(msg, candidates)`; `runScheduledSync` gọi `enqueueDetail` khi completed; `Env.SYNC_QUEUE: Queue<VatSyncQueueMessage>` |
| D | `apps/sync-worker/test/unit/runJob.test.ts` | completed → enqueueDetail đúng messages; failed/needs_reauth → KHÔNG enqueue |
| E | `apps/sync-worker/src/runDetailJob.ts` (mới), `index.ts`, `types.ts` | Consumer pha 2 (xem §4); `queue()` phân nhánh `isDetailMessage` |
| E | `apps/sync-worker/test/unit/runDetailJob.test.ts` + `test/integration/runDetailJob.db.test.ts` | Đủ nhánh outcome + persist thật PGlite + cách ly tenant |
| F | `packages/sync/src/missingLines.ts` (mới) | `listInvoicesMissingLines(tx, tenantId, {ownMst, limit})` — `hoa_don` LEFT JOIN `dong_hang_hoa` IS NULL, lọc `tenant_id` tường minh + MST bên-mình theo `chieu` (purchase→`nmmst`, sold→`nbmst`) |
| F | `apps/api/src/routes/taxAccounts.ts` | `POST /tax-accounts/:id/backfill-lines` (role `ke_toan_truong|quan_tri`): 409 `token_het_han` nếu token chết (mirror U22 B5), enqueue `DetailSyncMessage` chia lô ≤100/≤256KB, trần 4 000 msg/lần gọi, audit `backfill_dong_hang`, 202 `{soHoaDonThieu, soDaXepHang, conLai}` |
| F | `packages/sync/test/integration/missingLines.test.ts`, `apps/api/test/integration/backfillLines.post.test.ts` | Query + route: đúng tập thiếu, cách ly tenant (2 tenant), 409 token, trần, lọc MST |
| G | `packages/sync/src/sync.ts` (`classifyFailure`), `apps/sync-worker/src/runJob.ts` | `failureKind:'rate_limited'` khi `GdtError.httpStatus===429` (header) → `retry_backpressure` thay vì `retry` không-delay (tôn trọng máy chủ thuế) |
| H | `docs/CHECKLIST-NGHIEM-THU.md`, `docs/BACKLOG-y-tuong-va-de-xuat.md`, comment `sync.ts`/`deps.ts` | Gỡ TODO queue-2-pha, cập nhật trạng thái nợ, ghi chú ngữ nghĩa `completed`=header |

## 3. Test viết trước (TDD — nhóm theo `testing.md`)

Tất cả viết TRƯỚC hiện thực từng bước, phải ĐỎ rồi XANH; **mock mọi fetch GDT** (unit); PGlite cho integration. Hai test regression cũ (`sync.linelines.regression.test.ts`, `query.sco-error.regression.test.ts`) **giữ nguyên assertion, phải xanh suốt**.

1. *(unit, gdt-client)* 429 → `GdtError{code:'HTTP_ERROR', httpStatus:429}`, transport.fetch gọi đúng 1 lần; 500 → `httpStatus:500` sau hết retry.
2. *(unit, sync)* `isDetailMessage`: detail đúng shape → true; header (không `kind`) → false; rác → false.
3. *(integration, sync)* `detailCandidates`: 2 HĐ mới → 2 candidates (ref khớp nbmst/khhdon/khmshdon/shdon/source, hoaDonId = id thật trong DB); chạy lại y nguyên → 0; đổi `ttxly` → 1; HĐ nguồn sco → `ref.source='sco'`.
4. *(unit, sync-worker)* `runScheduledSync`: completed + candidates → `enqueueDetail` nhận đúng `DetailSyncMessage[]` (tenantId/taikhoanId từ message gốc); failed → không gọi; enqueueDetail ném lỗi → outcome vẫn completed? **KHÔNG** — lỗi enqueue = mất pha 2 im lặng ⇒ outcome `retry` (header đã idempotent, chạy lại vô hại).
5. *(unit, sync-worker)* `runDetailJob`: token hết hạn → `ack_expired` (warn, không gọi GDT); permit `rate_limited`/`breaker_open` → `retry_backpressure`; GDT 429 → `recordResult(false)` + `retry_backpressure`; 401 → `reauthRuntime` + `needs_reauth`; sco+404 → `ack` + warn; 500/timeout → `recordResult(false)` + `retry`; thành công → `persistLines` đúng tham số + `recordResult(true)` + `completed`; **không log** giá trị dòng hàng/token.
6. *(integration, sync-worker)* `runDetailJob` PGlite: persist thật vào `dong_hang_hoa` (đủ nhiều dòng/HĐ), chạy 2 lần không nhân đôi (quyết định C), tenant B không đọc/ghi được dữ liệu tenant A (RLS).
7. *(integration, sync)* `listInvoicesMissingLines`: chỉ trả HĐ 0 dòng; lọc đúng MST bên-mình theo chiều; tôn trọng `limit`; tenant khác không lộ.
8. *(integration, api)* `POST /tax-accounts/:id/backfill-lines`: 202 + enqueue đúng message (queue giả bắt); id tenant khác → 404; token hết hạn → 409; vượt trần → `soDaXepHang=4000, conLai>0`; audit ghi.
9. *(unit, sync + sync-worker)* 429 header: `classifyFailure` → `rate_limited`; `runScheduledSync` → `retry_backpressure`.

## 4. Thiết kế consumer pha 2 (`runDetailJob`) — chốt để không đoán khi code

- Nạp token (`loadAccountToken` per message). Token rỗng/hết hạn → **ack + console.warn** (KHÔNG ghi reauth per-message — header job đã ghi; tránh 2 000 bản ghi trùng). Sau khi đăng nhập lại, chạy lại trigger backfill-lines là bù đủ (tài liệu hóa).
- `limiter.tryAcquire()` **mỗi message** (= mỗi request GDT — trả đúng nợ permit-per-request). Từ chối → `retry_backpressure` (reenqueue delay 60s, trần `bpAttempt` 10 → retry thật → DLQ, y hệt header).
- Gọi `adapterFetchDetail(transport, token, {maxAttempts: 2})(ref)` — adapter chỉ thử lại 1 lần (backoff 300ms) cho blip; **queue là tầng retry chính** (max_retries=5 → DLQ), tránh khuếch đại retry 2 tầng (mặc định 3×5=15 fetch/HĐ khi GDT sự cố).
- Thành công → `withTenant(db, tenantId, tx => persistInvoiceLines(tx, tenantId, hoaDonId, lines))` → `recordResult(true)` → ack. `lines=[]` (GDT trả không có `hdhhdvu`) vẫn là thành công (kiểm hợp đồng MỀM — đã pin ở U3); HĐ giữ 0 dòng, chỉ warn.
- Lỗi: `SESSION_EXPIRED` → `reauthRuntime` + ack (`needs_reauth`); `httpStatus===429` → `recordResult(false)` + `retry_backpressure`; `httpStatus===404 && source==='sco'` → warn + ack (endpoint sco detail **CHƯA KIỂM CHỨNG** — không để một giả định kéo message lặp vô hạn; xem §6); còn lại → `recordResult(false)` + `retry`.
- **KHÔNG** ghi `lan_dong_bo` từ pha 2 (lan_dong_bo là sổ theo KỲ header — giữ ngữ nghĩa B3/B6); quan sát pha 2 = structured log + DLQ.
- Ngân sách subrequest/lần gọi consumer (batch ≤10): ~4/message (DO acquire + GDT + DO result + reenqueue nếu có) + DB pooled ⇒ ~40 < 50 (trần Free). Ghi chú trong code.

## 5. Tiêu chí nghiệm thu

1. `make lint` sạch; `make test` xanh toàn monorepo, gồm 2 test regression cũ **không sửa assertion**; coverage ≥ 80% tầng nghiệp vụ.
2. Job header (cron/Đồng bộ ngay/U22 backfill header) KHÔNG còn gọi detail inline trong production wiring; mỗi HĐ mới/đổi-trạng-thái sinh đúng 1 `DetailSyncMessage`.
3. Mỗi message detail tiêu đúng 1 permit `TenantLimiter`; 429 → reenqueue có delay (không tính max_retries); 401 → token bị đánh dấu chết + không retry vô ích.
4. `POST /tax-accounts/:id/backfill-lines` enqueue được message cho toàn bộ HĐ thiếu dòng hàng của tài khoản (theo trần/lần gọi), idempotent khi chạy lại (persist xóa-chèn).
5. Message header cũ (không `kind`) vẫn được consumer xử lý như trước (tương thích lùi — kiểm bằng test guard + test runJob hiện có xanh nguyên).

## 6. Ràng buộc bắt buộc chạm tới + rủi ro

- **Cô lập adapter:** mọi gọi GDT vẫn qua `packages/gdt-client` (`adapterFetchDetail`/`getInvoiceDetail` + `GdtTransport`); U26 chỉ sửa 1 dòng adapter (truyền `httpStatus`) → cần `contract-guardian` review + `make test-contract` (ca detail thật gated env, các ca công khai chạy được).
- **Multi-tenant:** `tenantId` tường minh trong payload message (luật job nền); mọi persist qua `withTenant` + lọc tường minh; test 2-tenant ở cả pha 2 lẫn missing-lines.
- **Idempotent:** quyết định C (xóa-chèn theo `hoadon_id`+`tenant_id`) — đã có primitive + test; backfill chạy lại không nhân đôi.
- **401:** pre-flight + runtime đều dừng, không retry, không tự đăng nhập, không captcha.
- **Bí mật/log:** không log token, không log giá trị dòng hàng (`raw`), chỉ id + đếm + loại lỗi.
- **Rủi ro tương thích U22 (nhánh `claude/u22-backfill` đi trước base 8 commit, đã push):** đụng chung `packages/sync/src/syncJob.ts`, `packages/sync/src/index.ts` (khối export), `apps/api/src/routes/taxAccounts.ts` → conflict merge NHẸ, thuần cộng-dồn; nhánh nào merge sau tự giải quyết. U26 KHÔNG đổi hành vi mà U22 B1-B6 đã pin (test hai nhánh đều phải xanh sau merge).
- **Rủi ro sco detail CHƯA KIỂM CHỨNG** (`endpoints.ts:38-39`): backfill sẽ enqueue cả HĐ `nguon='sco'` (prod: tab máy tính tiền có dữ liệu thật — MST 4201969169). Phòng thủ: 404-sco → ack+warn. **Việc treo:** chạy `detail.contract.test.ts` với `GDT_DETAIL_SOURCE=sco` bằng token tài khoản có HĐ máy tính tiền để gỡ nhãn (không chặn U26).
- **Giới hạn đã biết, chấp nhận + tài liệu hóa:** (a) tài khoản `loai='con'` (username ≠ MST trần) — trigger lọc theo `username` làm MST bên-mình, HĐ không khớp được báo trong response (`conLai`/đếm ngoài phạm vi), không âm thầm; (b) HĐ "GDT trả detail rỗng thật" không phân biệt được với "chưa fetch" nếu re-trigger (không có cột đánh dấu — ghi vào BACKLOG nếu thành vấn đề thật); (c) không chống trùng khi bấm trigger 2 lần liên tiếp (persist idempotent nên chỉ tốn request — tài liệu hóa "đợi xong hãy bấm lại").

## 7. Điểm cần chủ dự án quyết (KHÔNG chặn U26)

1. **Cột "Tên hàng hóa + Số lượng" ngay trên DANH SÁCH hóa đơn?** Hiện là *đúng thiết kế U23-A* (dòng hàng chỉ ở màn chi tiết; bảng danh sách = `EXPORT_COLUMNS`, không bịa cột). Nếu muốn thêm: đụng `listInvoices` (aggregate), `InvoiceRow`, `InvoiceTable`, `EXPORT_COLUMNS`(+kiểu), `iterateInvoices` — và phải định nghĩa "Số lượng" khi 1 HĐ có nhiều dòng (tổng? dòng đầu?). Đề xuất: làm sau khi dữ liệu dòng hàng đã đầy, thành đơn vị nhỏ riêng.
2. **Deploy + chạy backfill production** (cần duyệt): thứ tự deploy consumer (vat-sync) TRƯỚC producer (vat-api); sau deploy gọi `POST /tax-accounts/:id/backfill-lines` (lặp tới khi `conLai=0`). "Cầm máu" cron 429 = chính bản deploy này (cron chỉ còn header + enqueue).
3. **Ngưỡng `TenantLimiter` cho pha detail** (capacity 10, refill 2/s hiện tại — chưa đo với 2 000 message): giữ mặc định, chỉnh qua env `LIMITER_*` nếu quan sát 429 còn xuất hiện.

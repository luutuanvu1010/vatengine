# H-B.6 — Vòng khép kín DLQ + EgressHealth-gate (spec)

> **Phạm vi đã chốt:** (a) DLQ consumer + (b) EgressHealth-gate. **Hoãn (c)** DO global-egress quota tổng → tách thành **H-B.6c** (hợp nhất với BACKLOG mục #1 "rate-limit toàn cục GDT"). Không nhét (c) vào spec này.
>
> **Nguồn:** `docs/audit/FORDEX-BACKLOG-hardening.md` (định nghĩa H-B.6), `docs/audit/FORDEX-PROGRESS.md` (H-B.4 ✅ — điều kiện chặn đã gỡ), `docs/BACKLOG-y-tuong-va-de-xuat.md` (mục #1, #8, 429/subrequest). Đọc kèm luật: `.claude/rules/multi-tenant.md`, `security.md`, `testing.md`, `gdt-adapter.md`.
>
> **Trạng thái:** SPEC — chờ QA1 trước khi Code chạy. Nhánh spec: `docs/hb6-dlq-egress-spec` (worktree cô lập, theo bài học git-race 2026-07-15/19).

## 0. Vì sao (bối cảnh, bằng chứng)

H-B.4 đã thêm chốt chặn: job kẹt backpressure lâu (`bpAttempt ≥ maxBackpressure`, mặc định 10) → `retry` thật → cạn `max_retries` (5) → rơi **`vat-sync-dlq`**. Lỗi thật vượt `max_retries` cũng rơi cùng đường.

**Sự thật đã kiểm chứng trong code (2026-07-19):**
- `apps/sync-worker/wrangler.jsonc:44` khai `dead_letter_queue: "vat-sync-dlq"` **nhưng KHÔNG có consumer nào bind vào `vat-sync-dlq`** → job rơi DLQ hiện *rơi vào hư không*, không ai đọc/cảnh báo/phát lại.
- Nguồn sinh job-rơi-DLQ lớn nhất hiện nay là **egress bị chặn / 429** (chuỗi sự cố U25/U28, BACKLOG mục #8: ~99 lần 429 + ~33 lần "Too many subrequests"). Nếu cron ngày vẫn enqueue cả lô khi egress đang `GEO_BLOCKED` → chỉ nhồi DLQ vô ích.

H-B.6 khép hai đầu: **(a)** dọn hậu quả (đọc/cảnh báo/phát lại DLQ) + **(b)** chặn nguyên nhân (không enqueue/không đập GDT khi biết chắc bị chặn).

## 1. Kiến trúc & ranh giới

Ba thay đổi, mỗi thứ một trách nhiệm, nối vào interface đã có. **Không** đụng logic job (`runJob.ts`/`runDetailJob.ts`), **không** đổi `consumerAction`/`detailConsumerAction` của H-B.4, **không** thêm global-egress quota.

| Thành phần | File | Trách nhiệm | Phụ thuộc |
|---|---|---|---|
| DLQ consumer | `apps/sync-worker/src/dlqConsumer.ts` (mới) + wiring `index.ts` | Nhận batch `vat-sync-dlq` → lưu payload vào bảng dead-letter + audit CRITICAL + `console.error` → `ack` | `@vat/db`, recorder |
| Bảng dead-letter | `packages/db/src/schema/dongBoThatBai.ts` (mới) + migration | Lưu bền job hỏng cho người xem + phát lại thủ công | RLS tenant |
| EgressHealth-gate | mở rộng `health.ts` (chỉ `HealthState` + `nextHealth`); đọc qua `egressHealthClient` có sẵn trong `index.ts` (scheduled + queue) | Skip enqueue / skip-chạy khi verdict cuối = GEO_BLOCKED | EgressHealth DO |
| Replay trigger | endpoint `fetch()` trên sync-worker, sau Cloudflare Access | Đọc job đã đậu → gửi lại `vat-sync` (reset `bpAttempt`) → đánh dấu đã phát lại | Cloudflare Access |

## 2. Bảng dead-letter `dong_bo_that_bai`

Migration cộng dồn, an toàn chạy lại (`CREATE TABLE IF NOT EXISTS`), theo mẫu các bảng nghiệp vụ (`packages/db/src/schema/auditLog.ts`).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid pk defaultRandom | |
| `tenant_id` | uuid NOT NULL → `tenants.id` | Message DLQ **luôn mang** `tenantId` (multi-tenant.md: job nền mang tenant tường minh trong payload) |
| `loai` | text | `'header'` \| `'detail'` (suy từ `isDetailMessage`) |
| `payload` | jsonb | Body message. **KHÔNG chứa bí mật** — body chỉ có `tenantId/period/direction/hoaDonId/bpAttempt` (đã kiểm `VatSyncQueueMessage`, security.md OK) |
| `ly_do` | text | `'max_retries'` \| `'backpressure_cap'` \| `'unexpected'` (xem §7 — CHƯA KIỂM CHỨNG cách suy) |
| `so_lan` | int nullable | Số lần đã thử nếu suy được từ metadata; null nếu không |
| `trang_thai` | text NOT NULL default `'da_dau'` | `'da_dau'` \| `'da_phat_lai'` \| `'bo_qua'` |
| `tao_luc` | timestamptz NOT NULL defaultNow | |
| `phat_lai_luc` | timestamptz nullable | |

- Áp `tenantIsolationPolicy("dong_bo_that_bai", t.tenantId)` (RLS `ENABLE` + `FORCE`, giống mọi bảng — multi-tenant.md).
- Index gợi ý: `(tenant_id, trang_thai, tao_luc DESC)` để endpoint replay/liệt kê nhanh (tạo thường, bảng nhỏ — KHÔNG cần `CONCURRENTLY` của H-B.1).

## 3. Luồng DLQ consumer

Thêm consumer thứ 2 trong `wrangler.jsonc`:
```jsonc
{ "queue": "vat-sync-dlq", "max_retries": 3, "max_batch_size": 10 }
// KHÔNG khai dead_letter_queue cho chính nó (tránh DLQ-của-DLQ vô hạn).
```

`dlqConsumer.ts` — hàm thuần `dlqRecord(body): { loai, lyDo, payload }` (test offline) + wiring ghi DB:
```
queue(vat-sync-dlq) → mỗi message:
  1. loai = isDetailMessage(body) ? 'detail' : 'header'
  2. lyDo = suyLyDo(body)                         // §7: mặc định 'max_retries'
  3. withTenant(db, body.tenantId): INSERT dong_bo_that_bai(...)
  4. auditLog: hanh_dong='dong_bo_that_bai_dlq',
       doi_tuong = detail ? `hoadon:${hoaDonId}` : `ky:${period}:${direction}`,
       chi_tiet = { lyDo, loai, ...maskSensitive(body) }   // "CRITICAL" mã hoá qua hanh_dong
  5. console.error(`[DLQ-CRITICAL] tenant=${tenantId} ${doi_tuong} lyDo=${lyDo}`)
  6. message.ack()                                // đã lưu bền → không để lặp trong DLQ
```

- **"CRITICAL" mã hoá qua `hanh_dong`**: `audit_log` không có cột severity (`packages/db/src/schema/auditLog.ts` chỉ có `hanh_dong/doi_tuong/chi_tiet/tao_luc`) → **KHÔNG đổi schema** (YAGNI). Giá trị `hanh_dong='dong_bo_that_bai_dlq'` chính là dấu nghiêm trọng để lọc/cảnh báo.
- **Kênh cảnh báo** = `console.error` → Workers observability/Logpush. Đây là kênh duy nhất hiện có; email/Slack là BACKLOG U24 (SES chưa xây) → nối thêm khi có U24.
- **Che dữ liệu**: `chi_tiet` đi qua `maskSensitive` trước khi ghi (recorder.ts đã có tiền lệ U12) — dù body không mang credential, giữ nguyên tắc "che trước khi ghi" (security.md).
- Lỗi ghi DB trong consumer DLQ → `message.retry()` (trần `max_retries:3`) để không mất im lặng.

## 4. EgressHealth-gate

**Mở rộng `HealthState`** (`health.ts`) thêm trường tuỳ chọn giữ verdict cuối. `egressHealth.ts` (DO) serialize `HealthState` dạng JSON qua `/load`·`/save` nên trường mới **tự chảy qua, KHÔNG cần sửa** DO đó:
```ts
export interface HealthState {
  consecutiveBad: number;
  alerted: boolean;
  lastVerdict?: ProbeVerdict;   // MỚI — để gate đọc được loại lỗi
}
```
`nextHealth(prev, verdict)` ghi `lastVerdict: verdict` vào state trả về (OK → `lastVerdict:'OK'`). Thay đổi thuần, test offline. `HEALTHY` mặc định coi như OK (không có `lastVerdict` ⇒ không chặn).

**Gate ở 2 điểm** (đọc `egressHealthClient(env.EGRESS_HEALTH).loadHealth()`):

- **`scheduled()` (cron ngày, trước vòng enqueue):** nếu `lastVerdict === 'GEO_BLOCKED'` → **bỏ toàn bộ enqueue** + `console.warn('[GATE] egress GEO_BLOCKED — skip cron enqueue')` + `return`. Sự kiện **toàn cục, không tenant** → chỉ observability, **KHÔNG** ghi `audit_log` (audit cần `tenant_id`; theo tiền lệ egress-probe cảnh báo qua observability).
- **`queue()` (consumer chính, một lần đầu batch):** đọc EgressHealth **một lần/batch** (không mỗi message — bó chi phí đọc DO). Nếu `GEO_BLOCKED` → mọi message trong batch được **reenqueue-delay** theo đúng cơ chế backpressure H-B.4: `SYNC_QUEUE.send({...body, bpAttempt: bpAttempt+1}, {delaySeconds: backpressureDelaySeconds})` + `message.ack()` — **KHÔNG** tính `max_retries`, nhưng **có** mang `bpAttempt` nên vẫn tôn trọng trần → rơi DLQ nếu kẹt quá lâu (điểm dừng). Không đập GDT khi biết chắc đang bị chặn.

Gate áp cho **cả** message header lẫn detail (cùng queue `vat-sync`).

## 5. Replay thủ công (tối giản)

`POST /dlq/replay` trên sync-worker `fetch()` handler (worker này hiện chỉ có `scheduled`+`queue`; thêm `fetch`), **sau Cloudflare Access** (khu quản trị — security.md: "khu vực quản trị dùng Cloudflare Access"):
```
body: { tenantId?: string, ids?: string[] }   // lọc; rỗng = tất cả 'da_dau'
→ SELECT dong_bo_that_bai WHERE trang_thai='da_dau' [AND filter]  (withTenant nếu có tenantId)
→ với mỗi bản: SYNC_QUEUE.send({ ...payload, bpAttempt: 0 })      // reset để không rơi DLQ ngay
→ UPDATE trang_thai='da_phat_lai', phat_lai_luc=now()
→ trả { daPhatLai: n }
```
- **Không UI** (ngoài scope H-B.6) — gọi qua `curl` kèm Access service token.
- Reset `bpAttempt:0` để job được thử lại đầy đủ; nếu egress vẫn hỏng, gate §4 + backpressure sẽ lại xử lý đúng.
- Bảo vệ bằng Access là **bắt buộc**: endpoint này bơm việc vào GDT.

## 6. Test (TDD, ≥80% logic; wiring loại khỏi ngưỡng)

Viết test ĐỎ trước (testing.md). Chạy workspace riêng để né flake PGlite (`npx vitest run --root <pkg>`).

| Test | Loại | Kỳ vọng |
|---|---|---|
| `dong_bo_that_bai` insert dưới RLS FORCE + non-owner | integration | Ghi được đúng tenant; role owner vẫn bị FORCE (mẫu H-B.2) |
| `nextHealth` giữ `lastVerdict` qua chuỗi verdict | unit | OK→`lastVerdict:'OK'`; GEO_BLOCKED→giữ + tăng `consecutiveBad` |
| Gate scheduled(): GEO_BLOCKED ⇒ không gọi `sendBatch` | unit | mock EgressHealth + SYNC_QUEUE; `sendBatch` 0 lần |
| Gate consumer: GEO_BLOCKED ⇒ mọi msg reenqueue-delay, không chạy job | unit | mock; `SYNC_QUEUE.send` = số msg, `runScheduledSync` 0 lần |
| Gate consumer: OK ⇒ chạy job bình thường (không hồi quy H-B.4) | unit | đường cũ nguyên vẹn |
| `dlqRecord(body)` header vs detail ⇒ đúng `loai`/`doi_tuong` | unit | thuần, không I/O |
| DLQ consumer: 1 msg ⇒ 1 row + 1 audit + ack | unit | mock db/recorder |
| Replay: parked ⇒ send + đánh dấu `da_phat_lai` + reset bpAttempt | unit | mock db + SYNC_QUEUE |

Wiring `index.ts` (`scheduled`/`queue`/`fetch`) và `egressHealth.ts` fetch: loại khỏi ngưỡng phủ (tiền lệ — logic đã phủ ở unit).

## 7. Điểm mơ hồ còn ghi nhận (CHƯA KIỂM CHỨNG — không chặn hiện thực)

- **`ly_do` chính xác:** Cloudflare Queues **không** truyền cho consumer DLQ lý do một message vào DLQ (max_retries vs khác). Ta chỉ **suy đoán** → mặc định `'max_retries'`; nếu tương lai cần phân biệt `'backpressure_cap'`, phải nhúng cờ vào body ở H-B.4 (ngoài scope). Ghi nhãn CHƯA KIỂM CHỨNG trong mô tả test. Không trình bày độ chắc không có.
- **Kênh cảnh báo thật** (email/Slack) bị chặn bởi U24 (SES chưa xây) → tạm `console.error` + Logpush; đây là giới hạn đã biết, không phải thiếu sót spec.
- **Ngưỡng gate = GEO_BLOCKED cụ thể:** đủ cho gốc rễ hiện tại (403/451). TIMEOUT/ERROR kéo dài **không** gate ở bản này (tránh chặn oan khi mạng chập chờn) — có thể mở rộng sau nếu quan sát production cho thấy cần.

## 8. Definition of Done

- Test §6 đỏ→xanh toàn bộ; `make lint` sạch (`tsc --noEmit` + Biome); không giảm phủ dưới ngưỡng.
- Migration `dong_bo_that_bai` chạy được (`make migrate`), an toàn chạy lại; **áp production TRƯỚC khi deploy** worker đọc/ghi bảng này (deploy.md: migrate-trước-deploy).
- Review chéo: `dod-auditor` (luôn) + `security-reviewer` (chạm tenant/DO/endpoint Access) + `contract-guardian` KHÔNG cần (không chạm `packages/gdt-client`/endpoint thuế).
- Cập nhật `FORDEX-PROGRESS.md`: H-B.6 → Xong (a)+(b); ghi H-B.6c (quota toàn cục) là mục mới, chặn bởi hợp nhất BACKLOG #1.
- Commit nhỏ, một đơn vị; không trộn (a),(b),replay,migration lẫn nhau nếu tách được thành các commit con truy vết được.

## 9. Không làm (ranh giới rõ)

- KHÔNG DO global-egress quota tổng (→ H-B.6c).
- KHÔNG UI cho dead-letter / replay (→ khi có tầng admin U24-liên quan).
- KHÔNG đổi schema `audit_log` (severity mã hoá qua `hanh_dong`).
- KHÔNG đổi `consumerAction`/logic job của H-B.4.
- KHÔNG bật T1/relay (đang TREO — security.md).

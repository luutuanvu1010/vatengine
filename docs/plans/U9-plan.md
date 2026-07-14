# Kế hoạch U9 — Đồng bộ nền theo lịch (Cloudflare Cron + Queues + Durable Object)

> Trạng thái: **ĐÃ THỰC THI ✅** (`make lint && make test` xanh; coverage `@vat/sync-worker` 98.8% dòng, các file logic ≥ 80% mọi trục). Xem tóm tắt nghiệm thu ở `docs/CHECKLIST-NGHIEM-THU.md` mục U9.
> Nguồn: `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng 107 (U9); `KIEN_TRUC_VA_KE_HOACH.md` mục 7.2 (idempotent), 11 (job nền/hàng đợi công bằng), 12 GĐ2, 12b P7; ADR-0001 §3, §5 (Cron→Queues→Workflow→DO), §5B (egress T0); `.claude/rules/multi-tenant.md`, `security.md`, `gdt-adapter.md`, `testing.md`.
> Xây trên `sync()` của U5 (`@vat/sync`) — PHI TRẠNG THÁI, nhận token qua tham số, KHÔNG tự đăng nhập.

## Quyết định phạm vi (chủ dự án, 2026-07-14)

- **#1 Nguồn token nền = A (chỉ token còn hạn).** Job nền chỉ đồng bộ tài khoản có `token_hien_tai` còn hạn. Token hết hạn → ghi `lan_dong_bo` trạng thái `can_dang_nhap_lai` + audit, **KHÔNG tự đăng nhập, KHÔNG captcha** (ranh giới Hiến pháp: captcha do người nhập; `security.md`: không lưu mật khẩu thuế thô). Đây là con đường tuân thủ DUY NHẤT hiện có.
- **#2 Worker riêng = `apps/sync-worker`.** `apps/api` giữ stateless request/response; handler nền (Cron/Queue/DO) nằm ở worker tách bạch, khớp sơ đồ ADR §5.
- **#3 Durable Object tối thiểu.** Token-bucket + circuit breaker đủ "không gọi dồn dập"; làm cứng (xoay khóa, tinh chỉnh ngưỡng, quan sát) để **U12**.
- **#4 Lịch = cửa sổ trượt mặc định (tháng hiện tại theo giờ VN), KHÔNG bảng `lich_dong_bo`.** Cadence trong `wrangler.jsonc` (`triggers.crons`); cấu hình lịch per-tenant hoãn về sau.

## Sai lệch so với kế hoạch gốc (ghi drift — CLAUDE.md §8)

Hai thay đổi ngoài danh sách file đã duyệt (`apps/sync-worker/*`), phát hiện lúc thực thi, đều **cộng thêm** (không phá vỡ hành vi cũ) và **bắt buộc** để U9 đúng + chạy được:

1. **`@vat/sync`: thêm `SyncResult.failureKind` (`"session_expired" | "transient"`).** `sync()` nuốt mọi lỗi thành chuỗi `thongDiepLoi`, mất *kiểu* lỗi. Để tầng nền quyết định RETRY hay không mà **không dò chuỗi tiếng Việt** (mong manh), `sync()` phân loại lỗi tại chỗ bắt (còn kiểu) rồi phơi ra. U5 giữ nguyên hành vi; test U5 cũ vẫn xanh (bằng chứng: 19/19).
2. **`@vat/gdt-client`: thêm `createDirectCfTransport()` (egress T0).** `gdt-adapter.md` cấm gọi `fetch()` GDT ngoài `packages/gdt-client`. U9 là đơn vị ĐẦU TIÊN cần egress sống trong production → transport T0 phải nằm ở adapter (điểm egress duy nhất), không dựng trong `apps/sync-worker`. Egress T0 tới được GDT đã kiểm chứng (ADR Amendment #3/#4); test offline (mock fetch) cho hành vi ủy quyền + probe.

## File đã tạo/sửa

| File | Thay đổi |
|---|---|
| `apps/sync-worker/src/schedule.ts` | `currentPeriodWindow` (giờ VN), `enumerateDueAccounts` (per-tenant, token còn hạn, RLS), `buildMessages`, `parseDdmmyyyy`. |
| `apps/sync-worker/src/runJob.ts` | `runScheduledSync` — điều phối một job: pre-flight token → limiter → `sync()` → phân loại outcome (completed/needs_reauth/skipped_breaker/retry). |
| `apps/sync-worker/src/rateLimiter.ts` | Logic THUẦN token-bucket + circuit breaker (nhận `nowMs` → test xác định). |
| `apps/sync-worker/src/recorder.ts` | `dbRecorder` (ghi `lan_dong_bo`/`audit_log`, đánh dấu token chết) + `loadAccountToken` — TẤT CẢ tenant-scoped qua `withTenant`. |
| `apps/sync-worker/src/tenantLimiter.ts` | Durable Object `TenantLimiter` (bọc mỏng rateLimiter + storage) + client adapter. *Wiring — loại khỏi ngưỡng phủ.* |
| `apps/sync-worker/src/deps.ts` | Dựng deps production; `listActiveTenantIds` (control-plane). *Wiring.* |
| `apps/sync-worker/src/index.ts` | `scheduled()` + `queue()` + export DO. *Wiring.* |
| `apps/sync-worker/src/{db,types}.ts` | Hyperdrive handle + kiểu. *Wiring/kiểu.* |
| `apps/sync-worker/{package.json,tsconfig.json,vitest.config.ts,wrangler.jsonc,.dev.vars.example}` | Khung workspace + bindings Cron/Queue/DO. |
| `packages/sync/src/sync.ts` | (+) `SyncResult.failureKind` + `classifyFailure` (drift #1). |
| `packages/gdt-client/src/{directTransport.ts,index.ts}` | (+) `createDirectCfTransport` egress T0 (drift #2). |

## Test (đỏ→xanh, 27 test `@vat/sync-worker` + 3 `@vat/sync` + 4 `@vat/gdt-client`)

- **unit** — `schedule` (cửa sổ kỳ giờ VN, biên tháng, năm nhuận; dựng message có `tenant_id`), `rateLimiter` (bucket cạn/nạp; breaker mở sau N lỗi/đóng sau cooldown), `runJob` (9 ca: completed / transient→retry / 401→needs_reauth / pre-flight→không gọi GDT / token rỗng / account thiếu→retry / breaker→skip / rate-limit→retry / sync ném→retry).
- **integration (PGlite)** — `enumerate` (chỉ token còn hạn, tenant_id đúng), `runJob.db` (idempotent chạy 2 lần; 401 runtime→token chết+audit; pre-flight→0 call GDT+`can_dang_nhap_lai`; breaker→audit; cách ly tenant qua role non-superuser + RLS FORCE).

## Tiêu chí nghiệm thu — đã đạt

- Job idempotent (chạy lại cùng kỳ không nhân đôi — kế thừa upsert U5, có test e2e). Lỗi tạm → `retry` (queue thử lại, trần `max_retries`→DLQ); 401 → KHÔNG retry.
- Token hết hạn → KHÔNG đăng nhập/không captcha (0 call GDT), ghi `can_dang_nhap_lai` + audit.
- Mọi message mang `tenant_id` tường minh; mọi truy cập dữ liệu tenant-scoped (`withTenant`); ca cách ly tenant xanh.
- Rate limit + circuit breaker theo tenant/MST (DO). `make lint` sạch; coverage ≥ 80% tầng logic.

## Nợ vận hành (điều kiện tiên quyết production)

- **Control-plane đọc sổ đăng ký tenant:** `tenants` bật RLS keyed theo `id` → dưới role app tenant-scoped sẽ **fail-closed** (0 hàng). Kết nối lập lịch của `sync-worker` (`listActiveTenantIds`) phải được cấp quyền đọc sổ đăng ký (vai control-plane), tách khỏi đường dữ liệu per-tenant (vẫn tenant-scoped). Cùng lớp nợ với Hyperdrive id / role app của U6/U8.
- **Bindings deploy:** `wrangler queues create vat-sync` (+ DLQ `vat-sync-dlq`), Hyperdrive id thật, migration DO `TenantLimiter`.
- **Egress T0** đã kiểm chứng (ADR #3/#4); probe định kỳ (`gdt-adapter.md`) canh `GEO_BLOCKED` để cân nhắc T1 — ngoài phạm vi U9.

## NGOÀI phạm vi

Workflows binding (dùng Queue-retry làm cơ chế bền — đủ cho "retry lỗi tạm"; Workflow bọc bước cho sync rất lớn để sau); lấy chi tiết dòng hàng theo lô nền (U3 đã có API, lập lịch detail sau); đối chiếu/cảnh báo (U10); mã hóa envelope token + audit runtime đầy đủ + làm cứng rate-limit (U12); frontend. Không đổi schema `@vat/db` (`lan_dong_bo.trang_thai` là text tự do → trạng thái mới chỉ là hằng số tầng ứng dụng).

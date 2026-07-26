// Kiểu dùng chung cho Worker đồng bộ nền (U9). Tầng ứng dụng PHI TRẠNG THÁI; việc
// nặng chạy nền qua Cron → Queues → consumer; trạng thái phối hợp (rate limit,
// circuit breaker) đặt trong Durable Object (ADR-0001 §3, §5).
import type { GdtTransport, InvoiceDirection, RetryOptions } from "@vat/gdt-client";
import type { DetailSyncMessage, SyncJobMessage, SyncResult, VatSyncQueueMessage } from "@vat/sync";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { LimiterEnv } from "./rateLimiter";
import type { SyncRetryEnv } from "./syncRetryConfig";

// U12: kế thừa LimiterEnv → ngưỡng rate-limit tinh chỉnh qua env (vars wrangler),
// không hardcode trong Durable Object. SyncRetryEnv: giãn nhịp/backoff header (U25 AC3).
export interface Env extends LimiterEnv, SyncRetryEnv {
  ENVIRONMENT?: string;
  // Postgres qua Hyperdrive (ADR-0001). `.connectionString` để mở kết nối pg.
  HYPERDRIVE: Hyperdrive;
  // Hàng đợi job đồng bộ nền: scheduled() enqueue, queue() consume. U26: chở CẢ
  // message header (không `kind`) lẫn message chi tiết (`kind:"detail"`).
  SYNC_QUEUE: Queue<VatSyncQueueMessage>;
  // Durable Object: token-bucket rate limit + circuit breaker theo tenant/MST.
  TENANT_LIMITER: DurableObjectNamespace;
  // GIÁM SÁT (mục C): Durable Object singleton giữ health-state probe egress
  // (toàn hệ thống, không theo tenant — gdt-adapter.md "lưu trạng thái sức khỏe
  // trong Durable Object").
  EGRESS_HEALTH: DurableObjectNamespace;
  // U14 — KEK giải mã token thuế tại nghỉ (base64 32 byte). Workers Secret (security.md).
  TOKEN_KEK: string;
  // H-B.4 — tinh chỉnh fan-out (giãn tải + backpressure). Bỏ trống → mặc định (fanout.ts).
  FANOUT_JITTER_SPREAD_SEC?: string;
  FANOUT_BACKPRESSURE_DELAY_SEC?: string;
  FANOUT_MAX_BACKPRESSURE?: string;
  // Task 6 (delta-sync) — số TRANG tối đa mỗi lô `syncChunk`. Chia job theo trang là
  // fix bền cho "Too many subrequests by single Worker invocation" (sự cố 2026-07-18):
  // một lần gọi Worker chỉ kéo ≤ chừng này trang thay vì cả tháng. Bỏ trống → 40.
  DELTA_CHUNK_PAGES?: string;
}

// Db bất kỳ (pg/Hyperdrive khi chạy; PGlite khi test). sync()/withTenant là generic
// nên nhận lại kiểu này rồi suy ra tham số cụ thể (giống apps/api).
export type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

export interface DbHandle {
  db: AnyDb;
  close: () => Promise<void>;
}

// Payload MỘT job đồng bộ nền — contract dùng chung producer/consumer. NGUỒN SỰ THẬT
// DUY NHẤT ở @vat/sync (tránh nhân đôi giữa cron scheduled() và endpoint "Đồng bộ ngay"
// của vat-api). Import ở trên (dùng nội bộ) + re-export để mọi `import ... from "./types"`
// sẵn có giữ nguyên.
export type { SyncJobMessage, DetailSyncMessage, VatSyncQueueMessage };

// Token của một tài khoản thuế (đủ để pre-flight; KHÔNG lộ/không dùng secret thô).
export interface AccountToken {
  tokenHienTai: string | null;
  tokenHetHan: Date | null;
}

// Client tới Durable Object rate-limit/circuit-breaker (tối thiểu U9). Cô lập để
// runScheduledSync test được offline (không cần binding DO thật).
export interface TenantLimiterClient {
  tryAcquire(): Promise<{ allowed: boolean; reason?: "rate_limited" | "breaker_open" }>;
  recordResult(ok: boolean): Promise<void>;
}

// Ghi vết nền (lan_dong_bo + audit_log) + đánh dấu token chết — TẤT CẢ tenant-scoped
// (withTenant → RLS). Cô lập để test runJob offline; production dựng trên DB (recorder.ts).
export interface JobRecorder {
  // Pre-flight token hết hạn (tài khoản CÓ tồn tại): KHÔNG gọi GDT → ghi
  // lan_dong_bo trạng thái "cần đăng nhập lại" + audit. KHÔNG tự đăng nhập/không captcha.
  reauthPreflight(msg: SyncJobMessage, reason: string): Promise<void>;
  // Runtime 401: sync() đã ghi lan_dong_bo(failed) → chỉ đánh dấu token chết + audit.
  // U26: nhận cả message chi tiết (period tùy chọn) — chỉ cần định danh tài khoản.
  reauthRuntime(
    msg: { tenantId: string; taikhoanId: string; period?: string },
    reason: string,
  ): Promise<void>;
  // Circuit breaker mở: bỏ qua tick, không gọi GDT → audit.
  breakerSkip(msg: SyncJobMessage): Promise<void>;
}

// sync() được tiêm để test runJob offline. `db` được ĐÓNG GÓI SẴN (bound) vào hàm
// này ở tầng wiring/deps (production) hoặc test — nhờ vậy runScheduledSync KHÔNG
// cần biết về db, giữ logic điều phối thuần + test được offline.
export type SyncFn = (opts: {
  transport: GdtTransport;
  token: string;
  tenantId: string;
  taikhoanId: string;
  direction: InvoiceDirection;
  dateFrom: string;
  dateTo: string;
  includeSco?: boolean;
  size?: number;
  statuses?: number[];
  retry?: RetryOptions;
}) => Promise<SyncResult>;

// Phụ thuộc tiêm cho runScheduledSync (test offline; production dựng ở deps.ts).
export interface RunJobDeps {
  now(): number;
  loadAccount(msg: SyncJobMessage): Promise<AccountToken | null>;
  limiter: TenantLimiterClient;
  sync: SyncFn;
  transport: GdtTransport;
  recorder: JobRecorder;
  /** U26 (pha 1) — gửi message chi tiết vào queue vat-sync sau khi header xong.
   * Production = chunkForQueue + SYNC_QUEUE.sendBatch (deps.ts); test tiêm fake. */
  enqueueDetail(msgs: DetailSyncMessage[]): Promise<void>;
  syncParams?: { includeSco?: boolean; size?: number; statuses?: number[]; retry?: RetryOptions };
}

// Kết quả xử lý một job — điều khiển ack/retry/reenqueue ở tầng queue handler
// (index.ts) qua `consumerAction` (fanout.ts). H-B.4 TÁCH hai loại "thử lại":
//  - `retry` = LỖI THẬT (tạm/bất ngờ/anomaly) → message.retry(), TÍNH vào max_retries
//    → sau trần → dead-letter cho người xử lý.
//  - `retry_backpressure` = ĐẨY LÙI (rate_limited/breaker_open, KHÔNG phải lỗi) →
//    reenqueue message MỚI có delay, KHÔNG tính vào max_retries (không để backpressure
//    thoáng qua đẩy job vào dead-letter oan). Thay `skipped_breaker` cũ (vốn ack/bỏ tick
//    → mất cả kỳ đồng bộ khi breaker chỉ mở tạm).
export type JobOutcome =
  // Task 6: các trường số liệu là TÙY CHỌN — vòng audit/lô delta cũng trả `completed`
  // nhưng không có run id/số đếm riêng (audit không mở run; số của lô delta đã cộng
  // dồn thẳng vào run row bởi syncChunk). Job header vẫn điền đủ như trước.
  | { kind: "completed"; lanDongBoId?: string; soHdMoi?: number; soHdCapNhat?: number }
  | { kind: "needs_reauth"; reason: string }
  | { kind: "retry_backpressure"; reason: "rate_limited" | "breaker_open" }
  | { kind: "retry"; reason: string };

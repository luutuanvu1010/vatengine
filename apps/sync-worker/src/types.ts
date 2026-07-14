// Kiểu dùng chung cho Worker đồng bộ nền (U9). Tầng ứng dụng PHI TRẠNG THÁI; việc
// nặng chạy nền qua Cron → Queues → consumer; trạng thái phối hợp (rate limit,
// circuit breaker) đặt trong Durable Object (ADR-0001 §3, §5).
import type { GdtTransport, InvoiceDirection, RetryOptions } from "@vat/gdt-client";
import type { SyncResult } from "@vat/sync";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export interface Env {
  ENVIRONMENT?: string;
  // Postgres qua Hyperdrive (ADR-0001). `.connectionString` để mở kết nối pg.
  HYPERDRIVE: Hyperdrive;
  // Hàng đợi job đồng bộ nền: scheduled() enqueue, queue() consume.
  SYNC_QUEUE: Queue<SyncJobMessage>;
  // Durable Object: token-bucket rate limit + circuit breaker theo tenant/MST.
  TENANT_LIMITER: DurableObjectNamespace;
}

// Db bất kỳ (pg/Hyperdrive khi chạy; PGlite khi test). sync()/withTenant là generic
// nên nhận lại kiểu này rồi suy ra tham số cụ thể (giống apps/api).
export type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

export interface DbHandle {
  db: AnyDb;
  close: () => Promise<void>;
}

// Payload MỘT job đồng bộ nền: một tenant, một tài khoản thuế, một chiều, một kỳ.
// `tenantId` TƯỜNG MINH trong payload — job nền không có request context, không suy
// đoán ngầm (multi-tenant.md "Job nền phải nằm tường minh trong payload").
export interface SyncJobMessage {
  tenantId: string;
  taikhoanId: string;
  direction: InvoiceDirection;
  /** Khoảng ngày lập, định dạng dd/mm/yyyy (khớp adapter GDT). */
  dateFrom: string;
  dateTo: string;
  /** Kỳ "YYYY-MM" (giờ VN) — truy vết + tính idempotent theo kỳ. */
  period: string;
}

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
  reauthRuntime(msg: SyncJobMessage, reason: string): Promise<void>;
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
  syncParams?: { includeSco?: boolean; size?: number; statuses?: number[]; retry?: RetryOptions };
}

// Kết quả xử lý một job — điều khiển ack/retry ở tầng queue handler (index.ts):
// `retry` → message.retry() (thử lại, có trần max_retries → dead-letter); còn lại → ack.
export type JobOutcome =
  | { kind: "completed"; lanDongBoId: string; soHdMoi: number; soHdCapNhat: number }
  | { kind: "needs_reauth"; reason: string }
  | { kind: "skipped_breaker" }
  | { kind: "retry"; reason: string };

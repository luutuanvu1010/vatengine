import type { GdtTransport } from "@vat/gdt-client";
import type { VatSyncQueueMessage } from "@vat/sync";
// Kiểu dùng chung cho Worker API (U6). Tầng ứng dụng PHI TRẠNG THÁI (mục 11).
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackfillDef } from "./backfillTracker";
import type { LockGate, LoginLockEnv } from "./loginLimiter";
import type { Role } from "./rbac";

export interface Env extends LoginLockEnv {
  ENVIRONMENT?: string;
  // Postgres qua Hyperdrive (ADR-0001). `.connectionString` dùng để mở kết nối pg.
  HYPERDRIVE: Hyperdrive;
  // Khóa ký JWT NỘI BỘ của SaaS (KHÔNG phải token thuế). Workers Secret — security.md.
  JWT_SECRET: string;
  // R2: lưu file kết xuất (U7) — không giữ file lớn trong RAM Worker (ADR-0001).
  RAW: R2Bucket;
  // U14 — KEK mã hóa token thuế tại nghỉ (base64 32 byte). Workers Secret (security.md).
  TOKEN_KEK: string;
  // Hàng đợi đồng bộ nền — producer cho "Đồng bộ ngay" (POST /tax-accounts/:id/sync)
  // và backfill dòng hàng U26 (POST /tax-accounts/:id/backfill-lines, message
  // `kind:"detail"`). Optional: chỉ có ở production; dev/test tiêm qua makeEnv.
  SYNC_QUEUE?: Queue<VatSyncQueueMessage>;
  // H-A.5a — số vòng PBKDF2 cho hash MỚI (var wrangler, không nhạy cảm). Không đặt →
  // DEFAULT 100k (an toàn Free). Đặt "600000" khi nâng Paid (H-A.3) để đạt OWASP.
  PBKDF2_ITERATIONS?: string;
  // H-A.5b — Durable Object khóa đăng nhập per-account (lockout). Optional: binding
  // production; test tiêm getLoginLimiter giả. Thiếu → fail-open (login vẫn chạy; WAF
  // per-IP + timing/audit vẫn bảo vệ).
  LOGIN_LIMITER?: DurableObjectNamespace;
  // U22 — Durable Object theo dõi backfill (1 DO / backfillId). Optional: binding
  // production; thiếu → producer backfill (B5) trả 503 (không fail-open — không tracker
  // thì không theo dõi tiến độ được).
  BACKFILL_TRACKER?: DurableObjectNamespace;
}

// Trích từ JWT nội bộ (U6/U8): `tenantId` để lọc + RLS; `role` (vai RBAC, U8) để
// requireRole gác route. Cả hai do requireTenant xác minh và đặt vào context.
export type AppEnv = {
  Bindings: Env;
  Variables: { tenantId: string; role: Role };
};

// Db route dùng: một PgDatabase bất kỳ (pg/Hyperdrive khi chạy; PGlite khi test).
// Query fns của @vat/query là generic nên nhận lại kiểu này rồi suy ra tham số cụ thể.
export type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

// Vòng đời một kết nối cho MỘT request: mở → dùng → `close()` (finally). Stateless.
export interface DbHandle {
  db: AnyDb;
  close: () => Promise<void>;
}

// Trừu tượng lưu trữ đối tượng cho kết xuất (U7). Production = R2; test = R2 giả trong
// bộ nhớ (tiêm qua AppDeps) để integration test đi qua route thật, offline.
export interface StorageHandle {
  put: (key: string, body: Uint8Array | ReadableStream<Uint8Array>) => Promise<void>;
  get: (key: string) => Promise<Uint8Array | null>;
}

// H-A.5b — client gọi Durable Object khóa đăng nhập theo key (email chuẩn hóa). Production
// gọi DO thật; test tiêm giả (in-memory dùng logic thuần). check() TRƯỚC khi làm DB.
export interface LoginLimiterClient {
  check: () => Promise<LockGate>;
  recordFailure: () => Promise<void>;
  recordSuccess: () => Promise<void>;
}

// U22 — client gọi Durable Object tracker backfill theo backfillId. Production gọi DO
// thật; test tiêm giả. `init` store-once (idempotent); `get` kiểm phạm vi tenant (def
// tenant khác → null, như 404). Tiến độ từng tháng suy từ lan_dong_bo ở tầng GET (B6).
export interface BackfillTrackerClient {
  init: (def: BackfillDef) => Promise<{ def: BackfillDef; created: boolean }>;
  get: (tenantId: string) => Promise<BackfillDef | null>;
}

// Tiêm phụ thuộc để test đi qua route thật với PGlite + R2 giả (không cần binding thật).
export interface AppDeps {
  getDb: (env: Env) => Promise<DbHandle>;
  getStorage: (env: Env) => StorageHandle;
  // U14 — đường ra GDT (getCaptcha/authenticate). Production = createDirectCfTransport();
  // test tiêm transport giả (không mạng). Cô lập adapter (gdt-adapter.md).
  getTransport: (env: Env) => GdtTransport;
  // H-A.5b — khóa đăng nhập per-account (lockout). key = email chuẩn hóa.
  getLoginLimiter: (env: Env, key: string) => LoginLimiterClient;
  // U22 — tracker backfill theo backfillId (DO thật ở production; test tiêm giả).
  getBackfillTracker: (env: Env, backfillId: string) => BackfillTrackerClient;
}

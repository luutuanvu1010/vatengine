// Kiểu dùng chung cho Worker API (U6). Tầng ứng dụng PHI TRẠNG THÁI (mục 11).
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export interface Env {
  ENVIRONMENT?: string;
  // Postgres qua Hyperdrive (ADR-0001). `.connectionString` dùng để mở kết nối pg.
  HYPERDRIVE: Hyperdrive;
  // Khóa ký JWT NỘI BỘ của SaaS (KHÔNG phải token thuế). Workers Secret — security.md.
  JWT_SECRET: string;
  // R2: lưu file kết xuất (U7) — không giữ file lớn trong RAM Worker (ADR-0001).
  RAW: R2Bucket;
  // Binding khác thêm dần theo lộ trình (KV, Queues, Durable Objects).
}

// tenantId trích từ JWT (phương án A) — mọi route /invoices* dùng để lọc + RLS.
export type AppEnv = {
  Bindings: Env;
  Variables: { tenantId: string };
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

// Tiêm phụ thuộc để test đi qua route thật với PGlite + R2 giả (không cần binding thật).
export interface AppDeps {
  getDb: (env: Env) => Promise<DbHandle>;
  getStorage: (env: Env) => StorageHandle;
}

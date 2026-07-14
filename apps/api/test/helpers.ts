// Tiện ích test cho apps/api (U6). PGlite (Postgres WASM) offline + JWT nội bộ ký
// bằng khóa test. KHÔNG mạng, KHÔNG dữ liệu thật (testing.md). Db PGlite được TIÊM
// vào app qua `createApp({ getDb })` để integration test đi qua route + auth thật.
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, tenants } from "@vat/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sign } from "hono/jwt";
import type { AnyDb, Env, StorageHandle } from "../src/types";

// migrations của @vat/db (áp bằng PGlite) — giải qua URL để không phụ thuộc cwd.
const MIGRATIONS = new URL("../../../packages/db/migrations", import.meta.url).pathname;

export const TEST_SECRET = "test-jwt-secret-u6";

export type Db = ReturnType<typeof drizzle>;

export function makeEnv(over: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "test",
    JWT_SECRET: TEST_SECRET,
    // HYPERDRIVE/RAW không dùng khi getDb/getStorage được tiêm — cast dummy ở ranh giới test.
    HYPERDRIVE: {} as Hyperdrive,
    RAW: {} as R2Bucket,
    ...over,
  };
}

export async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

// R2 giả trong bộ nhớ để integration test đi qua route thật (put/get) mà không cần binding
// R2 thật. `map` mở ra để test đọc trực tiếp object đã ghi (đối chiếu nội dung/khóa).
export interface FakeStorage extends StorageHandle {
  map: Map<string, Uint8Array>;
}

async function toBytes(body: Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return merged;
}

export function makeStorage(): FakeStorage {
  const map = new Map<string, Uint8Array>();
  return {
    map,
    put: async (key, body) => {
      map.set(key, await toBytes(body));
    },
    get: async (key) => map.get(key) ?? null,
  };
}

/** Tiêm db PGlite + R2 giả vào createApp (close = noop trong test). storage tùy chọn để
 * test đọc lại object đã ghi. */
export function injectDb(db: Db, storage: FakeStorage = makeStorage()) {
  return {
    getDb: async () => ({ db: db as unknown as AnyDb, close: async () => {} }),
    getStorage: () => storage,
  };
}

export async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

type HoaDonInsert = typeof hoaDon.$inferInsert;

export async function seedInvoice(
  db: Db,
  tenantId: string,
  over: Partial<HoaDonInsert> = {},
): Promise<string> {
  const base: HoaDonInsert = {
    tenantId,
    nbmst: "0100000001",
    nbten: "Cty Bán",
    nmmst: "0100000002",
    nmten: "Cty Mua",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon: "1",
    tdlap: new Date("2026-04-12T09:00:00Z"),
    tgtcthue: "1000000",
    tgtthue: "80000",
    tgtttbso: "1080000",
    ttxly: 8,
    tthai: 1,
    chieu: "purchase",
    nguon: "normal",
    rawJson: {},
  };
  const rows = await db
    .insert(hoaDon)
    .values({ ...base, ...over })
    .returning({ id: hoaDon.id });
  const row = rows[0];
  if (!row) throw new Error("insert hoa_don không trả về id");
  return row.id;
}

/** Ký JWT nội bộ test (HS256) với claim `tenant_id`. `extra` để test exp/thiếu claim. */
export async function tokenFor(
  tenantId: string | undefined,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const payload: Record<string, unknown> = { ...extra };
  if (tenantId !== undefined) payload.tenant_id = tenantId;
  return sign(payload, TEST_SECRET, "HS256");
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

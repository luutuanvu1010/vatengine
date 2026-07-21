// Tiện ích test cho apps/api (U6). PGlite (Postgres WASM) offline + JWT nội bộ ký
// bằng khóa test. KHÔNG mạng, KHÔNG dữ liệu thật (testing.md). Db PGlite được TIÊM
// vào app qua `createApp({ getDb })` để integration test đi qua route + auth thật.
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, nguoiDung, taiKhoanThue, tenants } from "@vat/db";
import type { GdtTransport } from "@vat/gdt-client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sign } from "hono/jwt";
import { signAdminToken } from "../src/admin/adminAuth";
import { type BackfillDef, initDef, readDef } from "../src/backfillTracker";
import { hashPassword } from "../src/password";
import type { AnyDb, BackfillTrackerClient, Env, StorageHandle } from "../src/types";

// migrations của @vat/db (áp bằng PGlite) — giải qua URL để không phụ thuộc cwd.
const MIGRATIONS = new URL("../../../packages/db/migrations", import.meta.url).pathname;

export const TEST_SECRET = "test-jwt-secret-u6";

// U18 — secret miền admin. PHẢI khác TEST_SECRET, nếu không `kiemTraCauHinhAdmin` trả
// `trung_secret_khach` và mọi route /admin/* thành 503 (đúng thiết kế fail-closed) — test
// sẽ đỏ hàng loạt với lý do khó đoán. Giữ hai hằng số khác nhau ngay tại nguồn.
export const TEST_ADMIN_SECRET = "test-admin-jwt-secret-u18";

// U14 — KEK test hợp lệ (32 byte zero, base64). KHÔNG dùng ngoài test (security.md).
export const TEST_KEK = btoa(String.fromCharCode(...new Uint8Array(32)));

export type Db = ReturnType<typeof drizzle>;

export function makeEnv(over: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "test",
    JWT_SECRET: TEST_SECRET,
    ADMIN_JWT_SECRET: TEST_ADMIN_SECRET,
    // HYPERDRIVE/RAW không dùng khi getDb/getStorage được tiêm — cast dummy ở ranh giới test.
    HYPERDRIVE: {} as Hyperdrive,
    RAW: {} as R2Bucket,
    TOKEN_KEK: TEST_KEK,
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

// U14 — transport GDT giả để test tiêm (không mạng). Mặc định trả lỗi để ép test khai rõ
// hành vi mong đợi thay vì im lặng dùng default. Cô lập adapter (gdt-adapter.md).
export function makeTransport(over: Partial<GdtTransport> = {}): GdtTransport {
  return {
    name: "fake",
    fetch: async () => new Response("no", { status: 500 }),
    probe: async () => ({ transport: "fake", verdict: "OK", latencyMs: 0 }),
    ...over,
  };
}

/** U22 — factory tracker backfill GIẢ in-memory dùng ĐÚNG logic thuần initDef/readDef
 * (như DO thật): store-once idempotent + cách ly tenant. Trạng thái theo backfillId. */
export function makeBackfillTrackerFactory() {
  const store = new Map<string, BackfillDef>();
  return (_env: Env, backfillId: string): BackfillTrackerClient => ({
    init: async (def) => {
      const r = initDef(store.get(backfillId), def);
      if (r.status === "conflict") throw new Error("backfill init conflict");
      if (r.status === "created") store.set(backfillId, r.def);
      return { def: r.def, created: r.status === "created" };
    },
    get: async (tenantId) => readDef(store.get(backfillId), tenantId),
  });
}

/** Tiêm db PGlite + R2 giả + transport GDT giả + limiter giả + tracker giả vào createApp
 * (close = noop). storage/transport/loginLimiter/backfillTracker/signupLimiter tùy chọn;
 * mặc định factory giả — test cần đối chiếu trạng thái truyền factory riêng phơi store. */
export function injectDb(
  db: Db,
  storage: FakeStorage = makeStorage(),
  transport: GdtTransport = makeTransport(),
  getBackfillTracker = makeBackfillTrackerFactory(),
) {
  return {
    getDb: async () => ({ db: db as unknown as AnyDb, close: async () => {} }),
    getStorage: () => storage,
    getTransport: () => transport,
    getBackfillTracker,
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

/** Seed một tài khoản đăng nhập thuế (U14) cho một tenant — dùng làm điều kiện tiên quyết
 * cho các test route getCaptcha/authenticate/login-thuế. */
export async function seedTaxAccount(
  db: Db,
  tenantId: string,
  over: Partial<typeof taiKhoanThue.$inferInsert> = {},
): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username: "0100000001", ...over })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  return row.id;
}

/** Seed một người dùng nội bộ (U8) với mật khẩu đã băm PBKDF2 thật (qua đúng hàm login
 * dùng) → integration test đi trọn vòng hash→verify. Vai mặc định `ke_toan`. */
export async function seedUser(
  db: Db,
  tenantId: string,
  email: string,
  password: string,
  vaiTro = "ke_toan",
): Promise<string> {
  const passwordHash = await hashPassword(password);
  const rows = await db
    .insert(nguoiDung)
    .values({ tenantId, email, passwordHash, vaiTro })
    .returning({ id: nguoiDung.id });
  const row = rows[0];
  if (!row) throw new Error("insert nguoi_dung không trả về id");
  return row.id;
}

/** Ký JWT nội bộ test (HS256) với claim `tenant_id` + `role` (U8). Vai mặc định
 * `quan_tri` (qua mọi cổng RBAC) để test U6/U7 không phải khai vai. Ghi đè bằng
 * `extra.role`; truyền `role: null` để test ca token THIẾU vai. */
export async function tokenFor(
  tenantId: string | undefined,
  extra: Record<string, unknown> = {},
): Promise<string> {
  // U18 — `sub` mặc định để route cần "chính tôi" (POST /auth/doi-mat-khau) dùng được
  // token test. Ghi đè bằng `extra.sub` khi test cần đúng id một người dùng đã seed.
  const payload: Record<string, unknown> = {
    role: "quan_tri",
    sub: crypto.randomUUID(),
    ...extra,
  };
  if (tenantId !== undefined) payload.tenant_id = tenantId;
  // role: null (ca test token THIẾU vai) → bỏ khỏi payload (sign JSON-hóa, rớt undefined).
  if (payload.role === null) payload.role = undefined;
  return sign(payload, TEST_SECRET, "HS256");
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** U18 — Seed một super-admin với mật khẩu băm PBKDF2 THẬT (qua đúng hàm route dùng) →
 * integration test đi trọn vòng hash→verify như đăng nhập thật.
 *
 * Ghi thẳng bằng SQL chứ không qua Drizzle insert: bảng `quan_tri_he_thong` cố ý KHÔNG
 * được GRANT gì cho role app (0011), nên "đường ghi hợp lệ" duy nhất ở production là
 * script seed chạy dưới role migrate. PGlite chạy superuser nên câu này chạy được — đó là
 * đúng vai trò nó mô phỏng. */
export async function seedSuperAdmin(
  db: Db,
  email: string,
  password: string,
  trangThai = "active",
): Promise<string> {
  const hash = await hashPassword(password);
  const r = await db.execute(sql`
    INSERT INTO quan_tri_he_thong (email, password_hash, ten, trang_thai)
    VALUES (${email}, ${hash}, 'Chủ dự án', ${trangThai})
    RETURNING id`);
  const id = r.rows[0]?.id;
  if (typeof id !== "string") throw new Error("insert quan_tri_he_thong không trả về id");
  return id;
}

/** U18 — Ký token miền admin cho test. Mặc định dùng TEST_ADMIN_SECRET; truyền secret
 * khác để dựng ca "token ký bằng khoá sai". */
export async function adminTokenFor(
  sub: string,
  secret: string = TEST_ADMIN_SECRET,
): Promise<string> {
  return signAdminToken(sub, secret);
}

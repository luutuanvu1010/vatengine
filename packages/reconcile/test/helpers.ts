// Tiện ích test cho @vat/reconcile (integration, PGlite): áp migration U4 lên Postgres
// WASM sạch rồi seed hóa đơn header trực tiếp (không qua sync — U10 chỉ ĐỌC). Offline
// hoàn toàn, không mạng (testing.md). KHÔNG dữ liệu thật. Mẫu từ @vat/query/test/helpers.
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, tenants } from "@vat/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// migrations của @vat/db nằm ở package anh em; giải qua URL để không phụ thuộc cwd.
const MIGRATIONS = new URL("../../db/migrations", import.meta.url).pathname;

export type Db = ReturnType<typeof drizzle>;

export async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

type HoaDonInsert = typeof hoaDon.$inferInsert;

/** Seed một hóa đơn header cho tenant. Mặc định số học KHỚP (1.000.000 + 80.000 =
 * 1.080.000, không chiết khấu). `over` để tùy biến (nhớ đổi `shdon`/`tdlap` để không
 * đụng khóa tự nhiên 6 trường). */
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
    ttcktmai: null,
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

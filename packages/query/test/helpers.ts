// Tiện ích test cho @vat/query (integration, PGlite): áp migration U4 lên Postgres
// WASM sạch rồi seed hóa đơn header trực tiếp (không qua sync — U6 chỉ ĐỌC). Offline
// hoàn toàn, không mạng (testing.md). KHÔNG dữ liệu thật.
import { PGlite } from "@electric-sql/pglite";
import { dongHangHoa, hoaDon, tenants } from "@vat/db";
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

/** Seed một hóa đơn header cho tenant. Giá trị mặc định hợp lệ; `over` để tùy biến
 * (nhớ đổi `shdon`/`tdlap` để không đụng khóa tự nhiên 6 trường). */
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

type DongHangHoaInsert = typeof dongHangHoa.$inferInsert;

/** Gieo một dòng hàng. `tenantId` tường minh để dựng được ca dữ liệu lệch tenant. */
export async function seedLine(
  db: Db,
  tenantId: string,
  hoaDonId: string,
  over: Partial<DongHangHoaInsert> = {},
): Promise<void> {
  await db.insert(dongHangHoa).values({
    tenantId,
    hoaDonId,
    stt: 1,
    ten: "Hàng A",
    dvtinh: "cái",
    sluong: "1",
    dgia: "1000",
    thtien: "1000",
    ltsuat: "8%",
    tsuat: "0.08",
    rawJson: {},
    ...over,
  });
}

import { PGlite } from "@electric-sql/pglite";
import { storeToken, taiKhoanThue, tenants } from "@vat/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { loadAccountToken } from "../../src/recorder";
import type { SyncJobMessage } from "../../src/types";

const MIGRATIONS = new URL("../../../../packages/db/migrations", import.meta.url).pathname;
const KEK = btoa(String.fromCharCode(...new Uint8Array(32)));

type Db = ReturnType<typeof drizzle>;

async function makeTenant(db: Db): Promise<string> {
  const rows = await db.insert(tenants).values({ ten: "A", mst: "0100000001" }).returning();
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

async function makeAccount(db: Db, tenantId: string): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username: "0100000001" })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  return row.id;
}

describe("loadAccountToken (giải mã token tại nghỉ)", () => {
  let db: Db;
  beforeEach(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  it("trả token ĐÃ GIẢI MÃ (không phải chuỗi sealed v1$)", async () => {
    const tenantId = await makeTenant(db);
    const taikhoanId = await makeAccount(db, tenantId);
    const hetHan = new Date("2026-08-01T00:00:00Z");
    await storeToken(db as never, tenantId, taikhoanId, "GDT_TOKEN_THAT", hetHan, KEK);
    const msg = {
      tenantId,
      taikhoanId,
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
    } as SyncJobMessage;
    const res = await loadAccountToken(db as never, msg, KEK);
    expect(res?.tokenHienTai).toBe("GDT_TOKEN_THAT");
    expect(res?.tokenHetHan?.getTime()).toBe(hetHan.getTime());
  });

  it("tài khoản TỒN TẠI nhưng chưa có token → { tokenHienTai: null, ... }, KHÔNG phải null", async () => {
    const tenantId = await makeTenant(db);
    const taikhoanId = await makeAccount(db, tenantId);
    const msg = {
      tenantId,
      taikhoanId,
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
    } as SyncJobMessage;
    const res = await loadAccountToken(db as never, msg, KEK);
    expect(res).not.toBeNull();
    expect(res?.tokenHienTai).toBeNull();
    expect(res?.tokenHetHan).toBeNull();
  });

  it("tài khoản KHÔNG tồn tại → null", async () => {
    const tenantId = await makeTenant(db);
    const msg = {
      tenantId,
      taikhoanId: "00000000-0000-0000-0000-000000000000",
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
    } as SyncJobMessage;
    expect(await loadAccountToken(db as never, msg, KEK)).toBeNull();
  });
});

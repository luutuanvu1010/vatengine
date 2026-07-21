import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { TRANG_THAI_DA_DAU, dongBoThatBai, tenants } from "../../src/schema";
import * as schema from "../../src/schema";
import { withTenant } from "../../src/tenantContext";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));
type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function seedTenant(db: Db, mst: string): Promise<string> {
  const t = await db.insert(tenants).values({ ten: "Cty", mst }).returning();
  const id = t[0]?.id;
  if (!id) throw new Error("thiếu tenant");
  return id;
}

describe("dong_bo_that_bai (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  async function assertIsolated(a: string, b: string, label: string) {
    await withTenant(db, a, async (tx) => {
      expect((await tx.select().from(dongBoThatBai)).length, `${label}: A thấy A`).toBe(1);
    });
    await withTenant(db, b, async (tx) => {
      expect((await tx.select().from(dongBoThatBai)).length, `${label}: B không thấy A`).toBe(0);
    });
    expect((await db.select().from(dongBoThatBai)).length, `${label}: không tenant → 0`).toBe(0);
  }

  it("RLS cách ly tenant cho CẢ role non-owner (ENABLE) LẪN owner (FORCE)", async () => {
    const a = await seedTenant(db, "0100000001");
    const b = await seedTenant(db, "0100000002");
    await db.insert(dongBoThatBai).values({
      tenantId: a,
      loai: "header",
      payload: { tenantId: a, period: "2026-07", direction: "purchase" },
      lyDo: "max_retries",
      trangThai: TRANG_THAI_DA_DAU,
    });
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`create role owner_role nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user, owner_role`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user, owner_role`,
    );
    await db.execute(sql`set role app_user`);
    await assertIsolated(a, b, "app_user(non-owner)");
    await db.execute(sql`reset role`);
    await db.execute(sql`alter table dong_bo_that_bai owner to owner_role`);
    await db.execute(sql`set role owner_role`);
    await assertIsolated(a, b, "owner_role(owner+FORCE)");
    await db.execute(sql`reset role`);
  });
});

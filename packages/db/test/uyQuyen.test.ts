import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { taiKhoanThue, tenants } from "../src/schema";
import * as schema from "../src/schema";

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));
type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

describe("tai_khoan_thue.uy_quyen_luc", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("mặc định null; set được timestamp", async () => {
    const tRows = await db.insert(tenants).values({ ten: "A", mst: "0100000001" }).returning();
    const tenantId = tRows[0]?.id;
    if (!tenantId) throw new Error("thiếu tenant");
    const accRows = await db
      .insert(taiKhoanThue)
      .values({ tenantId, username: "0100000001" })
      .returning();
    const acc = accRows[0];
    if (!acc) throw new Error("thiếu tài khoản");
    expect(acc.uyQuyenLuc).toBeNull();
    const when = new Date("2026-07-14T03:00:00Z");
    await db.update(taiKhoanThue).set({ uyQuyenLuc: when }).where(eq(taiKhoanThue.id, acc.id));
    const afterRows = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, acc.id));
    const after = afterRows[0];
    if (!after) throw new Error("không tìm thấy bản ghi");
    expect(after.uyQuyenLuc?.toISOString()).toBe(when.toISOString());
  });
});

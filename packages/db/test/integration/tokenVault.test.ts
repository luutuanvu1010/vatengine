// U12 — Seam kho token GDT: token JWT thuế mã hóa TẠI NGHỈ (security.md). Test
// integration (PGlite): store→read vòng đủ, cột DB KHÔNG phải plaintext, cách ly
// tenant. KHÔNG wiring đường GHI runtime (login) — chỉ chứng minh cơ chế qua fixture
// (quyết định #1: seam + fixture).
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/schema";
import { taiKhoanThue, tenants } from "../../src/schema";
import { readToken, storeToken } from "../../src/tokenVault";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));
// KEK giả 32 byte — CHỈ test. Sản xuất: Workers Secret (security.md).
const KEK_B64 = btoa("0123456789abcdef0123456789abcdef");

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning();
  const id = rows[0]?.id;
  if (!id) throw new Error("insert tenant không trả về hàng");
  return id;
}

async function makeAccount(db: Db, tenantId: string, username: string): Promise<string> {
  const rows = await db.insert(taiKhoanThue).values({ tenantId, username }).returning();
  const id = rows[0]?.id;
  if (!id) throw new Error("insert tài khoản không trả về hàng");
  return id;
}

describe("U12 tokenVault (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("store→read vòng đủ: đọc lại đúng token gốc", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const acc = await makeAccount(db, t, "0100000001-tc");
    const expiry = new Date("2026-08-01T00:00:00Z");
    await storeToken(db, t, acc, "eyJ.jwt.thue-that", expiry, KEK_B64);

    const got = await readToken(db, t, acc, KEK_B64);
    expect(got?.token).toBe("eyJ.jwt.thue-that");
    expect(got?.tokenHetHan?.toISOString()).toBe(expiry.toISOString());
  });

  it("cột token_hien_tai trong DB KHÔNG phải plaintext (đã mã hóa)", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const acc = await makeAccount(db, t, "0100000001-tc");
    await storeToken(db, t, acc, "TOKEN-KHONG-DUOC-LO", new Date("2026-08-01"), KEK_B64);

    const raw = await db.execute(sql`select token_hien_tai from tai_khoan_thue where id = ${acc}`);
    const stored = (raw.rows[0] as { token_hien_tai: string }).token_hien_tai;
    expect(stored).not.toContain("TOKEN-KHONG-DUOC-LO");
    expect(stored.startsWith("v1$aesgcm$")).toBe(true);
  });

  it("token null (chưa đăng nhập) → readToken trả null sạch, KHÔNG ném", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const acc = await makeAccount(db, t, "0100000001-tc");
    expect(await readToken(db, t, acc, KEK_B64)).toBe(null);
  });

  it("cách ly tenant: token của A không đọc được dưới ngữ cảnh tenant B", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    const accA = await makeAccount(db, a, "0100000001-tc");
    await storeToken(db, a, accA, "token-cua-A", new Date("2026-08-01"), KEK_B64);

    // Đọc tài khoản A NHƯNG khai tenant B → RLS + lọc tường minh chặn → null.
    expect(await readToken(db, b, accA, KEK_B64)).toBe(null);
  });
});

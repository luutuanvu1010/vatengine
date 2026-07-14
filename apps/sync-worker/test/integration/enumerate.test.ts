// U9 — Test liệt kê tài khoản đến hạn đồng bộ (nhóm integration, PGlite): chỉ chọn
// tài khoản có token CÒN HẠN (quyết định A — job nền KHÔNG tự đăng nhập/không captcha),
// đọc theo từng tenant qua withTenant (RLS), gắn tenant_id tường minh vào kết quả.
import { PGlite } from "@electric-sql/pglite";
import { taiKhoanThue, tenants } from "@vat/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { enumerateDueAccounts } from "../../src/schedule";

const MIGRATIONS = new URL("../../../../packages/db/migrations", import.meta.url).pathname;
const NOW = Date.UTC(2026, 6, 14, 3, 0, 0);

type Db = ReturnType<typeof drizzle>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

async function makeAccount(
  db: Db,
  tenantId: string,
  username: string,
  tokenHetHan: Date | null,
): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username, tokenHienTai: tokenHetHan ? "jwt" : null, tokenHetHan })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  return row.id;
}

describe("enumerateDueAccounts — chỉ tài khoản token còn hạn, tenant_id tường minh", () => {
  let db: Db;

  beforeEach(async () => {
    db = await freshDb();
  });

  it("chọn token còn hạn; bỏ token hết hạn và token rỗng", async () => {
    const tA = await makeTenant(db, "Cty A", "0100000001");
    const valid = await makeAccount(db, tA, "A-valid", new Date(NOW + 3_600_000));
    await makeAccount(db, tA, "A-expired", new Date(NOW - 1000)); // hết hạn → loại
    await makeAccount(db, tA, "A-notoken", null); // chưa đăng nhập → loại

    const due = await enumerateDueAccounts(db, NOW, async () => [tA]);

    expect(due).toHaveLength(1);
    expect(due[0]).toEqual({ tenantId: tA, taikhoanId: valid });
  });

  it("nhiều tenant: mỗi tài khoản gắn ĐÚNG tenant_id của nó (không lẫn)", async () => {
    const tA = await makeTenant(db, "Cty A", "0100000001");
    const tB = await makeTenant(db, "Cty B", "0100000002");
    const accA = await makeAccount(db, tA, "A1", new Date(NOW + 3_600_000));
    const accB = await makeAccount(db, tB, "B1", new Date(NOW + 3_600_000));

    const due = await enumerateDueAccounts(db, NOW, async () => [tA, tB]);

    expect(due).toHaveLength(2);
    // Mỗi DueAccount phải mang tenant_id tường minh khớp tài khoản (multi-tenant.md).
    expect(due).toContainEqual({ tenantId: tA, taikhoanId: accA });
    expect(due).toContainEqual({ tenantId: tB, taikhoanId: accB });
  });

  it("tenant không có tài khoản token còn hạn → không đóng góp job nào", async () => {
    const tA = await makeTenant(db, "Cty A", "0100000001");
    await makeAccount(db, tA, "A-expired", new Date(NOW - 1000));
    const due = await enumerateDueAccounts(db, NOW, async () => [tA]);
    expect(due).toHaveLength(0);
  });
});

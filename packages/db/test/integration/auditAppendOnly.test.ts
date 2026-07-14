// U12 — audit_log BẤT BIẾN (append-only): "Audit log không được ghi đè, chỉ append"
// (security.md). Cơ chế: trigger BEFORE UPDATE/DELETE ném lỗi → chặn CẢ owner/superuser
// (như FORCE RLS chặn owner), độc lập tên role app (CHƯA KIỂM CHỨNG trên DB thật).
// Test dưới role mặc định PGlite (superuser) → chứng minh không ai ghi đè được.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, tenants } from "../../src/schema";
import * as schema from "../../src/schema";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));
type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function seedAudit(db: Db): Promise<{ tenantId: string; auditId: string }> {
  const t = await db.insert(tenants).values({ ten: "Cty A", mst: "0100000001" }).returning();
  const tenantId = t[0]?.id;
  if (!tenantId) throw new Error("thiếu tenant");
  const rows = await db
    .insert(auditLog)
    .values({ tenantId, hanhDong: "export", doiTuong: "abc" })
    .returning();
  const auditId = rows[0]?.id;
  if (!auditId) throw new Error("thiếu audit");
  return { tenantId, auditId };
}

describe("U12 audit_log append-only (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("INSERT audit hoạt động (append được)", async () => {
    const { auditId } = await seedAudit(db);
    const rows = await db.select().from(auditLog);
    expect(rows.map((r) => r.id)).toContain(auditId);
  });

  it("UPDATE audit bị chặn (ném lỗi) — kể cả dưới superuser", async () => {
    const { auditId } = await seedAudit(db);
    await expect(
      db.execute(sql`update audit_log set hanh_dong = 'gia-mao' where id = ${auditId}`),
    ).rejects.toThrow();
    // Giá trị gốc không đổi.
    const rows = await db.execute(sql`select hanh_dong from audit_log where id = ${auditId}`);
    expect((rows.rows[0] as { hanh_dong: string }).hanh_dong).toBe("export");
  });

  it("DELETE audit bị chặn (ném lỗi) — kể cả dưới superuser", async () => {
    const { auditId } = await seedAudit(db);
    await expect(db.execute(sql`delete from audit_log where id = ${auditId}`)).rejects.toThrow();
    expect((await db.select().from(auditLog)).length).toBe(1);
  });

  it("TRUNCATE audit bị chặn (ném lỗi) — không xóa sạch nhật ký (security-reviewer Medium)", async () => {
    await seedAudit(db);
    await expect(db.execute(sql`truncate audit_log`)).rejects.toThrow();
    expect((await db.select().from(auditLog)).length).toBe(1);
  });
});

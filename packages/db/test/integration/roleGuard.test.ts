// H-A.2 — kiểm role trên Postgres THẬT (PGlite catalog). Chứng minh truy vấn pg_roles/
// pg_tables chạy đúng: (a) role mặc định PGlite = 'postgres' (superuser + sở hữu bảng) →
// PHÁT HIỆN không an toàn (như neondb_owner/superuser thật trên Neon); (b) SET ROLE sang
// role NOSUPERUSER/NOBYPASSRLS không sở hữu bảng → an toàn. Offline (testing.md).
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type RoleGuardExecutor,
  assertConnectionRoleSafe,
  checkConnectionRole,
} from "../../src/roleGuard";
import * as schema from "../../src/schema";

// drizzle PGlite có `.execute` khớp hành vi RoleGuardExecutor nhưng khác kiểu generic →
// cast ở ranh giới test (giống cast wiring ở apps/*/db.ts).
const asExec = (db: unknown) => db as RoleGuardExecutor;

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));
type Db = ReturnType<typeof drizzle<typeof schema>>;

describe("roleGuard trên Postgres thật (PGlite)", () => {
  let db: Db;

  beforeEach(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  it("role mặc định 'postgres' (superuser + owner bảng) → KHÔNG an toàn (fail-fast)", async () => {
    const v = await checkConnectionRole(asExec(db));
    expect(v.role).toBe("postgres");
    expect(v.safe).toBe(false);
    expect(v.reasons).toContain("rolsuper");
    expect(v.ownsTables).toBe(true); // migration tạo bảng dưới postgres
    expect(() => assertConnectionRoleSafe(v)).toThrow(/postgres/);
  });

  it("role app NOSUPERUSER/NOBYPASSRLS/không own bảng (SET ROLE) → AN TOÀN", async () => {
    await db.execute(sql`create role vat_app_test nosuperuser nobypassrls`);
    await db.execute(sql`set role vat_app_test`);
    try {
      const v = await checkConnectionRole(asExec(db));
      expect(v.role).toBe("vat_app_test");
      expect(v.rolsuper).toBe(false);
      expect(v.rolbypassrls).toBe(false);
      expect(v.ownsTables).toBe(false); // bảng vẫn thuộc postgres, không thuộc role này
      expect(v.safe).toBe(true);
      expect(() => assertConnectionRoleSafe(v)).not.toThrow();
    } finally {
      await db.execute(sql`reset role`);
    }
  });
});

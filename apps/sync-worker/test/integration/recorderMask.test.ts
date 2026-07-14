// U12 — Audit chi_tiet phải MASK dữ liệu nhạy cảm trước khi ghi (security.md: "che
// (mask) trước khi ghi"). recorder là điểm ghi audit của sync-worker → maskSensitive
// áp tại đây bảo đảm không token/connection-string lọt vào nhật ký, kể cả khi chuỗi
// lỗi (reason) vô tình chứa credential.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { dbRecorder } from "../../src/recorder";
import type { AnyDb, SyncJobMessage } from "../../src/types";

const MIGRATIONS = fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url));

async function freshDb() {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function seed(db: ReturnType<typeof drizzle>): Promise<{ tenantId: string; accId: string }> {
  const t = await db.execute(
    sql`insert into tenants (ten, mst) values ('Cty A','0100000001') returning id`,
  );
  const tenantId = (t.rows[0] as { id: string }).id;
  const a = await db.execute(
    sql`insert into tai_khoan_thue (tenant_id, username) values (${tenantId}, '0100000001-tc') returning id`,
  );
  return { tenantId, accId: (a.rows[0] as { id: string }).id };
}

describe("U12 recorder masking (integration, PGlite)", () => {
  let db: ReturnType<typeof drizzle>;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("reauthRuntime: connection-string trong reason bị mask trong chi_tiet", async () => {
    const { tenantId, accId } = await seed(db);
    const msg: SyncJobMessage = {
      tenantId,
      taikhoanId: accId,
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
      period: "2026-01",
    };
    await dbRecorder(db as unknown as AnyDb).reauthRuntime(
      msg,
      "loi ket noi postgres://admin:sieu-bi-mat@db.example.com/vat",
    );

    const rows = await db.execute(
      sql`select chi_tiet from audit_log where tenant_id = ${tenantId}`,
    );
    const chiTiet = JSON.stringify((rows.rows[0] as { chi_tiet: unknown }).chi_tiet);
    expect(chiTiet).not.toContain("sieu-bi-mat");
  });
});

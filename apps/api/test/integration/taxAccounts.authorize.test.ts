// apps/api/test/integration/taxAccounts.authorize.test.ts
import { auditLog, taiKhoanThue } from "@vat/db";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedTaxAccount,
  tokenFor,
} from "../helpers";

describe("POST /tax-accounts/:id/authorize (PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let accId: string;
  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    accId = await seedTaxAccount(db, tenantA);
  });

  it("ủy quyền → 200, đặt uy_quyen_luc + ghi audit", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(
      `/tax-accounts/${accId}/authorize`,
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    expect(acc?.uyQuyenLuc).not.toBeNull();
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, tenantA), eq(auditLog.doiTuong, accId)));
    expect(audits.some((a) => a.hanhDong === "uy_quyen_tai_khoan_thue")).toBe(true);
  });

  it("tài khoản của tenant khác → 404 (cách ly)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000009");
    const token = await tokenFor(tenantB, { role: "quan_tri" });
    const res = await app.request(
      `/tax-accounts/${accId}/authorize`,
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });
});

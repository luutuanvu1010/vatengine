// U23-D3 — POST /tax-accounts/:id/disconnect: NGẮT KẾT NỐI = xóa token đã lưu (tokenHienTai
// + tokenHetHan → null), GIỮ bản ghi tài khoản (không xóa MST), ghi audit "ngat_ket_noi_thue".
// Cách ly tenant (tenant khác → 404). RBAC ke_toan → 403. PGlite, offline.
import { auditLog, taiKhoanThue, withTenant } from "@vat/db";
import { eq } from "drizzle-orm";
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

describe("POST /tax-accounts/:id/disconnect (U23-D3, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;
  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000002");
  });

  async function disconnect(token: string, id: string) {
    return app.request(
      `/tax-accounts/${id}/disconnect`,
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
  }

  it("(a) xóa token đã lưu + GIỮ bản ghi tài khoản + audit", async () => {
    const id = await seedTaxAccount(db, tenantA, {
      username: "0100000001",
      tokenHienTai: "v1$aesgcm$seal",
      tokenHetHan: new Date("2999-01-01T00:00:00Z"),
    });
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await disconnect(token, id);
    expect(res.status).toBe(200);

    const rows = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, id));
    expect(rows).toHaveLength(1); // bản ghi tài khoản CÒN
    expect(rows[0]?.tokenHienTai).toBeNull(); // token đã xóa
    expect(rows[0]?.tokenHetHan).toBeNull();
    expect(rows[0]?.username).toBe("0100000001"); // MST giữ nguyên

    const audits = await withTenant(db, tenantA, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.tenantId, tenantA)),
    );
    expect(audits.some((a) => a.hanhDong === "ngat_ket_noi_thue")).toBe(true);
  });

  it("(b) tenant khác gọi :id không thuộc mình → 404, KHÔNG đụng token của A", async () => {
    const idA = await seedTaxAccount(db, tenantA, {
      username: "0100000001",
      tokenHienTai: "seal-A",
    });
    const tokenB = await tokenFor(tenantB, { role: "quan_tri" });
    const res = await disconnect(tokenB, idA);
    expect(res.status).toBe(404);
    const rows = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, idA));
    expect(rows[0]?.tokenHienTai).toBe("seal-A"); // token của A còn nguyên
  });

  it("(c) vai ke_toan → 403", async () => {
    const id = await seedTaxAccount(db, tenantA, { username: "0100000001" });
    const token = await tokenFor(tenantA, { role: "ke_toan" });
    expect((await disconnect(token, id)).status).toBe(403);
  });
});

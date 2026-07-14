// A2 (U15) — đọc trạng thái tài khoản thuế: GET /tax-accounts (list) + GET /:id. Cho S5
// khôi phục stepper (đã đăng ký/ủy quyền) + panel token. KHÔNG lộ token/secret. RBAC như
// các route tax-account khác (ke_toan_truong + quan_tri). Cách ly tenant.
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

describe("GET /tax-accounts + /:id — đọc trạng thái (A2)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("list trả trường trạng thái, KHÔNG token/secret", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    await seedTaxAccount(db, t, {
      username: "0311772540",
      uyQuyenLuc: new Date("2026-07-01T00:00:00Z"),
      tokenHetHan: new Date("2026-07-15T10:30:00Z"),
      tokenHienTai: "v1$aesgcm$secret",
      secretRef: "ref-xyz",
    });
    const app = createApp(injectDb(db));
    const token = await tokenFor(t, { role: "ke_toan_truong" });
    const res = await app.request("/tax-accounts", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row.username).toBe("0311772540");
    expect(row.uyQuyenLuc).toBe("2026-07-01T00:00:00.000Z");
    expect(row.tokenHetHan).toBe("2026-07-15T10:30:00.000Z");
    // KHÔNG lộ bí mật.
    expect(row.tokenHienTai).toBeUndefined();
    expect(row.secretRef).toBeUndefined();
  });

  it("GET /:id trả một tài khoản; khác tenant → 404 (cách ly)", async () => {
    const a = await makeTenant(db, "DN A", "0100000001");
    const b = await makeTenant(db, "DN B", "0100000002");
    const accA = await seedTaxAccount(db, a, { username: "0311772540" });
    const app = createApp(injectDb(db));
    const okRes = await app.request(
      `/tax-accounts/${accA}`,
      { headers: bearer(await tokenFor(a, { role: "quan_tri" })) },
      makeEnv(),
    );
    expect(okRes.status).toBe(200);
    // Token của tenant B đọc tài khoản của A → 404 (không lộ tồn tại).
    const crossRes = await app.request(
      `/tax-accounts/${accA}`,
      { headers: bearer(await tokenFor(b, { role: "quan_tri" })) },
      makeEnv(),
    );
    expect(crossRes.status).toBe(404);
  });

  it("kế toán (ke_toan) → 403", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const app = createApp(injectDb(db));
    const res = await app.request(
      "/tax-accounts",
      { headers: bearer(await tokenFor(t, { role: "ke_toan" })) },
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });
});

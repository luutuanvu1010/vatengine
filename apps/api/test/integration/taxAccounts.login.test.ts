// apps/api/test/integration/taxAccounts.login.test.ts
import { readToken, taiKhoanThue } from "@vat/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  TEST_KEK,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  makeTransport,
  seedTaxAccount,
  tokenFor,
} from "../helpers";

// JWT tổng hợp có exp (giây epoch) để authenticate() trả token hợp lệ.
function fakeJwt(expSec: number): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64({ exp: expSec })}.sig`;
}
const okTransport = (token: string) =>
  makeTransport({
    fetch: async () =>
      new Response(JSON.stringify({ token }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
const loginReq = (id: string, token: string) => ({
  method: "POST",
  headers: { ...bearer(token), "content-type": "application/json" },
  body: JSON.stringify({ password: "mk", ckey: "K1", cvalue: "abcd" }),
});

describe("POST /tax-accounts/:id/login (PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let accId: string;
  const expSec = 1_900_000_000;
  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    accId = await seedTaxAccount(db, tenantA, { uyQuyenLuc: new Date() }); // đã ủy quyền
  });

  it("đăng nhập → 200, LƯU token SEALED (không phải token thô), readToken giải mã đúng", async () => {
    const gdtToken = fakeJwt(expSec);
    const app = createApp(injectDb(db, undefined, okTransport(gdtToken)));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(200);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    if (!acc) throw new Error("tài khoản không tồn tại sau login");
    expect(acc.tokenHienTai?.startsWith("v1$")).toBe(true); // sealed, KHÔNG phải gdtToken thô
    expect(acc.tokenHienTai).not.toBe(gdtToken);
    const dec = await readToken(db as never, tenantA, accId, TEST_KEK);
    expect(dec?.token).toBe(gdtToken);
    expect(dec?.tokenHetHan?.getTime()).toBe(expSec * 1000);
  });

  it("chưa ủy quyền → 409, KHÔNG lưu token", async () => {
    const accNoAuth = await seedTaxAccount(db, tenantA, { username: "0100000002" }); // uy_quyen_luc null
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(
      `/tax-accounts/${accNoAuth}/login`,
      loginReq(accNoAuth, jwt),
      makeEnv(),
    );
    expect(res.status).toBe(409);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accNoAuth));
    if (!acc) throw new Error("tài khoản không tồn tại sau login");
    expect(acc.tokenHienTai).toBeNull();
  });

  it("GDT từ chối (200 không token) → 401, KHÔNG lưu token", async () => {
    const badTransport = makeTransport({
      fetch: async () =>
        new Response(JSON.stringify({ message: "Sai captcha" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const app = createApp(injectDb(db, undefined, badTransport));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(401);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    if (!acc) throw new Error("tài khoản không tồn tại sau login");
    expect(acc.tokenHienTai).toBeNull();
  });

  it("vai ke_toan → 403", async () => {
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(403);
  });

  it("tài khoản tenant khác → 404 (cách ly)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000009");
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantB, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(404);
  });
});

// U14 — GET /tax-accounts/:id/captcha: proxy ảnh captcha GDT cho người dùng gõ. KHÔNG tự
// giải captcha (ranh giới Hiến pháp). Transport giả (không mạng thật), PGlite offline.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  makeTransport,
  seedTaxAccount,
  tokenFor,
} from "../helpers";

describe("GET /tax-accounts/:id/captcha (PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let accId: string;
  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    accId = await seedTaxAccount(db, tenantA);
  });

  it("trả {key, content} từ GDT", async () => {
    const transport = makeTransport({
      fetch: async () =>
        new Response(JSON.stringify({ key: "K1", content: "data:image/png;base64,AAAA" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const app = createApp(injectDb(db, undefined, transport));
    const token = await tokenFor(tenantA, { role: "ke_toan_truong" });
    const res = await app.request(
      `/tax-accounts/${accId}/captcha`,
      { headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: "K1", content: "data:image/png;base64,AAAA" });
  });

  it("400 khi :id không phải UUID", async () => {
    const transport = makeTransport();
    const app = createApp(injectDb(db, undefined, transport));
    const token = await tokenFor(tenantA, { role: "ke_toan_truong" });
    const res = await app.request(
      "/tax-accounts/not-a-uuid/captcha",
      { headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

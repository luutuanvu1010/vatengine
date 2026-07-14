// U8 integration (PGlite) — RBAC qua ĐƯỜNG THẬT + cách ly tenant. Bắt buộc: (a) vai
// `ke_toan` bị 403 khi kết xuất; (b) tenant A KHÔNG chạm dữ liệu B kể cả khi vai A là
// `quan_tri` (RBAC không nới cách ly tenant — multi-tenant.md). Offline, không mạng.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  type FakeStorage,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeStorage,
  makeTenant,
  seedInvoice,
  tokenFor,
} from "../helpers";

describe("RBAC + cách ly tenant qua route (integration, PGlite)", () => {
  let db: Db;
  let storage: FakeStorage;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    storage = makeStorage();
    app = createApp(injectDb(db, storage));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    await seedInvoice(db, tenantA, { shdon: "1" });
    await seedInvoice(db, tenantB, { shdon: "1", nbmst: "9999999999", tgtttbso: "999999" });
  });

  it("vai ke_toan → GET /invoices OK (đọc cho mọi vai)", async () => {
    const token = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await app.request("/invoices", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
  });

  it("vai ke_toan → POST /exports 403 (kết xuất cần kế toán trưởng trở lên)", async () => {
    const token = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await app.request(
      "/exports?format=csv",
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });

  it("vai ke_toan_truong → POST /exports OK", async () => {
    const token = await tokenFor(tenantA, { role: "ke_toan_truong" });
    const res = await app.request(
      "/exports?format=csv",
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(201);
  });

  it("CÁCH LY: vai quan_tri của A vẫn KHÔNG thấy dữ liệu B qua /invoices", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request("/invoices", { headers: bearer(token) }, makeEnv());
    const body = (await res.json()) as { total: number; rows: Array<{ tenantId: string }> };
    expect(body.total).toBe(1);
    expect(body.rows.every((r) => r.tenantId === tenantA)).toBe(true);
  });

  it("CÁCH LY: quan_tri của A kết xuất → chỉ dữ liệu A, không lẫn B", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(
      "/exports?format=csv",
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    const text = new TextDecoder().decode(new Uint8Array(await dl.arrayBuffer()));
    expect(text).not.toContain("9999999999");
    expect(text).not.toContain("999999");
  });
});

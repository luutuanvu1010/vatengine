import type { ReconcileReport } from "@vat/reconcile";
// U10 integration (PGlite) — REST đối chiếu đi qua ĐƯỜNG THẬT: createApp + auth JWT +
// route + withTenant/RLS. Bắt buộc theo multi-tenant.md: tenant A KHÔNG đối chiếu được
// dữ liệu tenant B qua API. Offline, không mạng.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedInvoice,
  tokenFor,
} from "../helpers";

describe("REST /reconcile (integration, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");

    // A: 1 hóa đơn lệch thuế + 2 hóa đơn đầu ra thiếu số (1,3 → thiếu 2).
    await seedInvoice(db, tenantA, { shdon: "1", tgtttbso: "1090000" });
    await seedInvoice(db, tenantA, {
      shdon: "1",
      khhdon: "C26SOLD",
      chieu: "sold",
      tdlap: new Date("2026-04-05T09:00:00Z"),
    });
    await seedInvoice(db, tenantA, {
      shdon: "3",
      khhdon: "C26SOLD",
      chieu: "sold",
      tdlap: new Date("2026-04-06T09:00:00Z"),
    });
    // B: 1 hóa đơn lệch thuế khác (để bắt rò tenant).
    await seedInvoice(db, tenantB, { shdon: "1", tgtttbso: "2222222" });
  });

  it("GET /reconcile với JWT tenant A → chỉ đối chiếu dữ liệu của A", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request("/reconcile", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReconcileReport;
    expect(body.summary.lechThue).toBe(1);
    expect(body.summary.thieuSoDauRa).toBe(1);
    // Production RỖNG mã trạng thái → không cờ hủy/thay thế.
    expect(body.summary.huy).toBe(0);
    expect(body.summary.thayThe).toBe(0);
    expect(body.findings).toHaveLength(2);
  });

  it("cách ly tenant: JWT tenant B chỉ thấy đối chiếu của B", async () => {
    const token = await tokenFor(tenantB);
    const res = await app.request("/reconcile", { headers: bearer(token) }, makeEnv());
    const body = (await res.json()) as ReconcileReport;
    expect(body.summary.lechThue).toBe(1);
    expect(body.summary.thieuSoDauRa).toBe(0); // B không có hóa đơn đầu ra
    expect(body.findings).toHaveLength(1);
  });

  it("không có JWT → 401", async () => {
    const res = await app.request("/reconcile", {}, makeEnv());
    expect(res.status).toBe(401);
  });

  it("bộ lọc sai định dạng → 400", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/reconcile?tuNgay=khong-phai-ngay",
      { headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("tôn trọng bộ lọc kỳ (chỉ đối chiếu phần khớp)", async () => {
    const token = await tokenFor(tenantA);
    // Kỳ 2026-04 bao trọn dữ liệu A → vẫn thấy lệch thuế + thiếu số.
    const res = await app.request(
      "/reconcile?tuNgay=2026-04-01&denNgay=2026-04-30",
      { headers: bearer(token) },
      makeEnv(),
    );
    const body = (await res.json()) as ReconcileReport;
    expect(body.summary.lechThue).toBe(1);
    expect(body.summary.thieuSoDauRa).toBe(1);
  });
});

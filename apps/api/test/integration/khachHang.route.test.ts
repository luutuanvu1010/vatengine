// U37b — REST danh sách khách hàng (để chọn khi tải hóa đơn gốc). Đi ĐƯỜNG THẬT:
// createApp + auth JWT + route + withTenant/RLS. Offline, không mạng.
import type { KhachHangResult } from "@vat/query";
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

describe("REST /invoices/khach-hang (integration, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
  });

  const goi = async (tenantId: string, vai = "ke_toan") =>
    app.request(
      "/invoices/khach-hang",
      { headers: bearer(await tokenFor(tenantId, { role: vai })) },
      makeEnv(),
    );

  it("trả khách hàng của ĐÚNG tenant gọi, kèm MST + tên + số hóa đơn", async () => {
    await seedInvoice(db, tenantA, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "CÔNG TY TNHH ABC",
      shdon: "1",
    });
    await seedInvoice(db, tenantA, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "CÔNG TY TNHH ABC",
      shdon: "2",
    });

    const res = await goi(tenantA);
    expect(res.status).toBe(200);
    const body = (await res.json()) as KhachHangResult;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      nmmst: "0312000001",
      nmten: "CÔNG TY TNHH ABC",
      soHoaDon: 2,
    });
    expect(body.biCatBot).toBe(false);
  });

  it("CÁCH LY TENANT: tenant B gọi KHÔNG thấy khách của tenant A", async () => {
    await seedInvoice(db, tenantA, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "Khách của A",
      shdon: "1",
    });

    const res = await goi(tenantB);
    expect(res.status).toBe(200);
    const body = (await res.json()) as KhachHangResult;
    expect(body.items).toEqual([]);
  });

  it("KHÔNG có JWT → 401 (không rò danh sách khách hàng cho người lạ)", async () => {
    const res = await app.request("/invoices/khach-hang", {}, makeEnv());
    expect(res.status).toBe(401);
  });

  it("cả ba vai đều tra cứu được (cùng ma trận quyền với /invoices)", async () => {
    await seedInvoice(db, tenantA, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "Khách",
      shdon: "1",
    });

    for (const vai of ["ke_toan", "ke_toan_truong", "quan_tri"]) {
      const res = await goi(tenantA, vai);
      expect({ vai, status: res.status }).toEqual({ vai, status: 200 });
    }
  });
});

import { dongHangHoa } from "@vat/db";
import type { HoaDonRow, InvoiceListResult, InvoiceSummary } from "@vat/query";
// U6 integration (PGlite) — REST tra cứu đi qua ĐƯỜNG THẬT: createApp + auth JWT +
// route + withTenant/RLS. Bắt buộc theo multi-tenant.md: tenant A KHÔNG đọc/không
// tổng hợp được dữ liệu tenant B qua API. Offline, không mạng.
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

describe("REST /invoices (integration, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;
  let idA: string;
  let idB: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");

    idA = await seedInvoice(db, tenantA, {
      shdon: "1",
      chieu: "purchase",
      tgtttbso: "1080000",
    });
    await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-15T10:00:00Z"),
      chieu: "sold",
      tgtttbso: "5400000",
    });
    idB = await seedInvoice(db, tenantB, { shdon: "1", tgtttbso: "999999" });
  });

  it("GET /invoices với JWT tenant A → chỉ thấy hóa đơn của A", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request("/invoices", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvoiceListResult;
    expect(body.total).toBe(2);
    expect(body.rows.every((r: HoaDonRow) => r.tenantId === tenantA)).toBe(true);
  });

  it("GET /invoices?chieu=sold → lọc đúng", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request("/invoices?chieu=sold", { headers: bearer(token) }, makeEnv());
    const body = (await res.json()) as InvoiceListResult;
    expect(body.total).toBe(1);
    expect(body.rows[0]?.chieu).toBe("sold");
  });

  it("GET /invoices/summary → tổng hợp CHỈ dữ liệu của A (không lẫn B)", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request("/invoices/summary", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvoiceSummary;
    expect(body.total.count).toBe(2);
    expect(Number(body.total.tongTtbso)).toBe(1080000 + 5400000); // KHÔNG cộng 999999 của B
  });

  it("GET /invoices/:id trong tenant → 200; của tenant khác → 404 (cách ly)", async () => {
    const token = await tokenFor(tenantA);
    const ok = await app.request(`/invoices/${idA}`, { headers: bearer(token) }, makeEnv());
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as HoaDonRow).id).toBe(idA);

    // idB thuộc tenant B → tenant A KHÔNG được thấy → 404.
    const cross = await app.request(`/invoices/${idB}`, { headers: bearer(token) }, makeEnv());
    expect(cross.status).toBe(404);
  });

  it("GET /invoices/:id KÈM mảng dòng hàng (dong_hang_hoa) của hóa đơn", async () => {
    await db.insert(dongHangHoa).values([
      { tenantId: tenantA, hoaDonId: idA, stt: 2, ten: "Dòng B", rawJson: {} },
      { tenantId: tenantA, hoaDonId: idA, stt: 1, ten: "Dòng A", dvtinh: "Cái", rawJson: {} },
    ]);
    const token = await tokenFor(tenantA);
    const res = await app.request(`/invoices/${idA}`, { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as HoaDonRow & { dongHangHoa: Array<{ ten: string }> };
    expect(body.id).toBe(idA);
    expect(body.dongHangHoa.map((l) => l.ten)).toEqual(["Dòng A", "Dòng B"]); // sắp theo stt
  });

  it("404 chéo tenant KHÔNG kèm dòng hàng của tenant kia (dù B có dòng hàng)", async () => {
    // Seed dòng hàng cho hóa đơn của tenant B; tenant A hỏi idB → 404, tuyệt đối
    // không lộ dòng hàng của B ở body.
    await db
      .insert(dongHangHoa)
      .values({ tenantId: tenantB, hoaDonId: idB, stt: 1, ten: "Bí mật của B", rawJson: {} });
    const token = await tokenFor(tenantA);
    const res = await app.request(`/invoices/${idB}`, { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Bí mật của B");
  });

  it("GET /invoices/:id không có dòng hàng → dongHangHoa = [] (không thiếu trường)", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request(`/invoices/${idA}`, { headers: bearer(token) }, makeEnv());
    const body = (await res.json()) as { dongHangHoa: unknown[] };
    expect(Array.isArray(body.dongHangHoa)).toBe(true);
    expect(body.dongHangHoa).toEqual([]);
  });

  it("thiếu JWT → 401; JWT hỏng → 401", async () => {
    expect((await app.request("/invoices", {}, makeEnv())).status).toBe(401);
    expect((await app.request("/invoices", { headers: bearer("hong") }, makeEnv())).status).toBe(
      401,
    );
  });

  it("query param sai (limit vượt trần) → 400", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request("/invoices?limit=500", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(400);
  });

  it("/health miễn xác thực → 200 dù không có JWT", async () => {
    const res = await app.request("/health", {}, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "vat-api" });
  });

  it("route không tồn tại → 404", async () => {
    const res = await app.request("/khong-ton-tai", {}, makeEnv());
    expect(res.status).toBe(404);
  });
});

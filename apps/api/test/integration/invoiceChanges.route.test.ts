import { lichSuThayDoiHoaDon } from "@vat/db";
// U35 (A5) — REST /invoices/changes đi qua ĐƯỜNG THẬT: createApp + auth JWT + route +
// withTenant/RLS. Bắt buộc theo multi-tenant.md: tenant A không đọc/không đánh dấu được
// thay đổi của tenant B qua API. Offline, không mạng — endpoint không chạm GDT.
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
  seedInvoice,
  seedInvoiceChange,
  tokenFor,
} from "../helpers";

describe("REST /invoices/changes (integration, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;
  let invA: string;
  let invB: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    invA = await seedInvoice(db, tenantA, { shdon: "1" });
    invB = await seedInvoice(db, tenantB, { shdon: "1" });
  });

  it("GET /invoices/changes với JWT tenant A → chỉ thấy thay đổi của A, kèm định danh HĐ + unreadCount", async () => {
    await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6 });
    await seedInvoiceChange(db, tenantB, invB, { giaTriMoi: 5 });

    const token = await tokenFor(tenantA);
    const res = await app.request("/invoices/changes", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Array<{ hoaDonId: string; shdon: string; truong: string; giaTriMoi: number }>;
      total: number;
      unreadCount: number;
    };
    expect(body.total).toBe(1);
    expect(body.unreadCount).toBe(1);
    expect(body.rows[0]).toMatchObject({
      hoaDonId: invA,
      shdon: "1",
      truong: "ttxly",
      giaTriMoi: 6,
    });
  });

  it("GET /invoices/changes?unread=true → chỉ chưa đọc", async () => {
    await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6, daDoc: true });
    await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 5, daDoc: false });
    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/invoices/changes?unread=true",
      { headers: bearer(token) },
      makeEnv(),
    );
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(1);
  });

  it("query param sai (limit vượt trần) → 400", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/invoices/changes?limit=500",
      { headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("thiếu JWT → 401; JWT hỏng → 401", async () => {
    expect((await app.request("/invoices/changes", {}, makeEnv())).status).toBe(401);
    expect(
      (await app.request("/invoices/changes", { headers: bearer("hong") }, makeEnv())).status,
    ).toBe(401);
  });

  it("không có thay đổi nào → 200, rows rỗng, total 0 (trạng thái rỗng, không lỗi)", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request("/invoices/changes", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; total: number };
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("POST /invoices/changes/mark-read (không truyền ids) → đánh dấu HẾT chưa đọc của tenant, KHÔNG đụng của tenant khác", async () => {
    const idA1 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6 });
    const idA2 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 5 });
    const idB = await seedInvoiceChange(db, tenantB, invB, { giaTriMoi: 4 });

    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/invoices/changes/mark-read",
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; markedCount: number };
    expect(body).toEqual({ ok: true, markedCount: 2 });

    const rows = await db.select().from(lichSuThayDoiHoaDon);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(idA1)?.daDoc).toBe(true);
    expect(byId.get(idA2)?.daDoc).toBe(true);
    expect(byId.get(idB)?.daDoc).toBe(false); // tenant B không bị đụng

    // Badge về 0 sau khi đánh dấu.
    const after = await app.request("/invoices/changes", { headers: bearer(token) }, makeEnv());
    expect(((await after.json()) as { unreadCount: number }).unreadCount).toBe(0);
  });

  it("POST /invoices/changes/mark-read với ids[] cụ thể → chỉ đánh dấu đúng id đó", async () => {
    const idA1 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6 });
    const idA2 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 5 });
    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/invoices/changes/mark-read",
      {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [idA1] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { markedCount: number }).markedCount).toBe(1);
    const rows = await db.select().from(lichSuThayDoiHoaDon);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(idA1)?.daDoc).toBe(true);
    expect(byId.get(idA2)?.daDoc).toBe(false);
  });

  it("mark-read với id thuộc tenant KHÁC trong ids[] → KHÔNG đổi, không rò tồn tại chéo tenant (0 markedCount, không 403/404)", async () => {
    const idB = await seedInvoiceChange(db, tenantB, invB, { giaTriMoi: 6 });
    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/invoices/changes/mark-read",
      {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [idB] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200); // KHÔNG rò bằng 403/404 — chỉ lặng lẽ 0 hàng đổi
    expect(((await res.json()) as { markedCount: number }).markedCount).toBe(0);
    const rows = await db.select().from(lichSuThayDoiHoaDon).where(eq(lichSuThayDoiHoaDon.id, idB));
    expect(rows[0]?.daDoc).toBe(false);
  });

  it("mark-read thân request RỖNG → coi như mark-all (không 400)", async () => {
    await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6 });
    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/invoices/changes/mark-read",
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { markedCount: number }).markedCount).toBe(1);
  });

  it("mark-read thân request KHÔNG rỗng nhưng hỏng cú pháp JSON → 400 (không nuốt êm)", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/invoices/changes/mark-read",
      {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: "{khong-phai-json",
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("mark-read ids[] chứa chuỗi không phải UUID → 400 (chặn ở biên, không chạm SQL)", async () => {
    const token = await tokenFor(tenantA);
    const res = await app.request(
      "/invoices/changes/mark-read",
      {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["khong-phai-uuid"] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("mark-read thiếu JWT → 401", async () => {
    const res = await app.request("/invoices/changes/mark-read", { method: "POST" }, makeEnv());
    expect(res.status).toBe(401);
  });
});

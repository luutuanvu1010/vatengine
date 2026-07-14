// U7 integration (PGlite + R2 giả) — REST kết xuất đi qua ĐƯỜNG THẬT: createApp + auth
// JWT + route + withTenant/RLS + ghi R2 + audit. Bắt buộc (multi-tenant.md): tenant A
// KHÔNG kết xuất/không tải được dữ liệu tenant B. Offline, không mạng, không GDT.
import { auditLog, withTenant } from "@vat/db";
import { unzipSync } from "fflate";
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

const dec = new TextDecoder();

// Số dòng dữ liệu (không kể header) trong xlsx do encoder sinh ra.
function xlsxDataRowCount(bytes: Uint8Array): number {
  const zip = unzipSync(bytes);
  const sheet = dec.decode(zip["xl/worksheets/sheet1.xml"]);
  const rows = [...sheet.matchAll(/<row\b/g)].length;
  return rows - 1; // trừ header
}

function csvLines(bytes: Uint8Array): string[] {
  let s = dec.decode(bytes);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.trimEnd().split("\r\n");
}

describe("REST /exports (integration, PGlite + R2 giả)", () => {
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

    await seedInvoice(db, tenantA, { shdon: "1", chieu: "purchase", tgtttbso: "1080000" });
    await seedInvoice(db, tenantA, {
      shdon: "2",
      chieu: "sold",
      tdlap: new Date("2026-04-15T10:00:00Z"),
      tgtttbso: "5400000",
    });
    // Tenant B: MST khác để bắt rò rỉ nếu có.
    await seedInvoice(db, tenantB, { shdon: "1", nbmst: "9999999999", tgtttbso: "999999" });
  });

  async function createExport(token: string, query: string) {
    const res = await app.request(
      `/exports?${query}`,
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    return res;
  }

  it("POST /exports?format=csv (tenant A) → 201 + ghi R2; tải lại CHỈ dữ liệu A, đúng số bản ghi", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=csv");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; key: string; url: string };
    expect(body.key).toBe(`exports/${tenantA}/${body.id}`);
    expect(storage.map.has(body.key)).toBe(true);

    const dl = await app.request(body.url, { headers: bearer(token) }, makeEnv());
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toContain("text/csv");
    const lines = csvLines(new Uint8Array(await dl.arrayBuffer()));
    expect(lines.length).toBe(3); // header + 2 hóa đơn của A
    // KHÔNG lẫn dữ liệu B.
    expect(lines.join("\n")).not.toContain("9999999999");
    expect(lines.join("\n")).not.toContain("999999");
  });

  it("POST /exports?format=xlsx → 201; tải lại là zip hợp lệ, đúng số bản ghi, content-type xlsx", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=xlsx");
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };

    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toContain("spreadsheetml.sheet");
    const bytes = new Uint8Array(await dl.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K' — chữ ký ZIP
    expect(xlsxDataRowCount(bytes)).toBe(2);
  });

  it("lọc theo chieu=sold → chỉ 1 bản ghi", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=csv&chieu=sold");
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    expect(csvLines(new Uint8Array(await dl.arrayBuffer())).length).toBe(2); // header + 1
  });

  it("CÁCH LY: A không tải được object của B (key mang tiền tố tenant) → 404", async () => {
    const tokenB = await tokenFor(tenantB);
    const resB = await createExport(tokenB, "format=csv");
    const { id: idB, url: urlB } = (await resB.json()) as { id: string; url: string };

    // A dùng url của B → key dựng theo tenant A ⇒ không tồn tại ⇒ 404.
    const tokenA = await tokenFor(tenantA);
    const cross = await app.request(urlB, { headers: bearer(tokenA) }, makeEnv());
    expect(cross.status).toBe(404);
    expect(idB).toMatch(/\.csv$/);
  });

  it("ghi audit 'export' cho tenant, không lẫn tenant khác", async () => {
    const token = await tokenFor(tenantA);
    await createExport(token, "format=xlsx");
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(auditLog));
    expect(rows.length).toBe(1);
    expect(rows[0]?.hanhDong).toBe("export");
    expect(rows[0]?.doiTuong).toBe("xlsx");
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it("format thiếu/không hợp lệ → 400", async () => {
    const token = await tokenFor(tenantA);
    expect((await createExport(token, "")).status).toBe(400);
    expect((await createExport(token, "format=pdf")).status).toBe(400);
  });

  it("thiếu JWT → 401; JWT hỏng → 401", async () => {
    const noJwt = await app.request("/exports?format=csv", { method: "POST" }, makeEnv());
    expect(noJwt.status).toBe(401);
    const bad = await app.request(
      "/exports?format=csv",
      { method: "POST", headers: bearer("hong") },
      makeEnv(),
    );
    expect(bad.status).toBe(401);
  });

  it("GET /exports/:id id sai định dạng → 400; id không tồn tại → 404", async () => {
    const token = await tokenFor(tenantA);
    expect(
      (await app.request("/exports/khong-hop-le", { headers: bearer(token) }, makeEnv())).status,
    ).toBe(400);
    const gone = await app.request(
      "/exports/00000000-0000-0000-0000-000000000000.csv",
      { headers: bearer(token) },
      makeEnv(),
    );
    expect(gone.status).toBe(404);
  });
});

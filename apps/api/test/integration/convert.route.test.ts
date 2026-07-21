// U11 integration (PGlite + R2 giả) — REST convert kế toán đi qua ĐƯỜNG THẬT: createApp +
// auth JWT + route + withTenant/RLS + ghi R2 + audit. Bắt buộc (multi-tenant.md): tenant A
// KHÔNG convert/không tải được dữ liệu tenant B. Ánh xạ theo PROFILE THAM CHIẾU (fixture).
// Offline, không mạng, không GDT.
import { auditLog, withTenant } from "@vat/db";
import { REFERENCE_PROFILE } from "@vat/export";
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
  seedUser,
  tokenFor,
} from "../helpers";

const dec = new TextDecoder();
const HEADERS = REFERENCE_PROFILE.columns.map((c) => c.header);

function csvLines(bytes: Uint8Array): string[] {
  let s = dec.decode(bytes);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.trimEnd().split("\r\n");
}

function xlsxHeaderRow(bytes: Uint8Array): string[] {
  const zip = unzipSync(bytes);
  const sheet = dec.decode(zip["xl/worksheets/sheet1.xml"] as Uint8Array);
  const firstRow = /<row[^>]*>([\s\S]*?)<\/row>/.exec(sheet)?.[1] ?? "";
  return [...firstRow.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] as string);
}

describe("REST /exports/convert (integration, PGlite + R2 giả)", () => {
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

  async function convert(token: string, query: string) {
    return app.request(
      `/exports/convert?${query}`,
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
  }

  it("profile=reference&format=csv (tenant A) → 201; tải lại CHỈ dữ liệu A, header ĐÍCH đúng", async () => {
    const token = await tokenFor(tenantA);
    const res = await convert(token, "profile=reference&format=csv");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; key: string; url: string; profile: string };
    expect(body.profile).toBe("reference");
    expect(body.key).toBe(`exports/${tenantA}/${body.id}`);
    expect(storage.map.has(body.key)).toBe(true);

    const dl = await app.request(body.url, { headers: bearer(token) }, makeEnv());
    expect(dl.status).toBe(200);
    const lines = csvLines(new Uint8Array(await dl.arrayBuffer()));
    // Header = định dạng ĐÍCH của profile (không phải nhãn native).
    expect(lines[0]?.split(",")).toEqual(HEADERS);
    expect(lines.length).toBe(3); // header + 2 hóa đơn của A
    // KHÔNG lẫn dữ liệu B.
    expect(lines.join("\n")).not.toContain("9999999999");
    expect(lines.join("\n")).not.toContain("999999");
  });

  it("format=xlsx → 201; tải lại zip hợp lệ, header ĐÍCH đúng", async () => {
    const token = await tokenFor(tenantA);
    const res = await convert(token, "profile=reference&format=xlsx");
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    expect(dl.headers.get("content-type")).toContain("spreadsheetml.sheet");
    const bytes = new Uint8Array(await dl.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K' — chữ ký ZIP
    expect(xlsxHeaderRow(bytes)).toEqual(HEADERS);
  });

  it("dùng lại bộ lọc U6: chieu=sold → chỉ 1 bản ghi", async () => {
    const token = await tokenFor(tenantA);
    const res = await convert(token, "profile=reference&format=csv&chieu=sold");
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    expect(csvLines(new Uint8Array(await dl.arrayBuffer())).length).toBe(2); // header + 1
  });

  it("CÁCH LY: A không tải được object convert của B (tiền tố tenant) → 404", async () => {
    const tokenB = await tokenFor(tenantB);
    const resB = await convert(tokenB, "profile=reference&format=csv");
    const { url: urlB } = (await resB.json()) as { url: string };

    const tokenA = await tokenFor(tenantA);
    const cross = await app.request(urlB, { headers: bearer(tokenA) }, makeEnv());
    expect(cross.status).toBe(404);
  });

  it("ghi audit 'convert' (doiTuong = profile) cho tenant, không lẫn tenant khác", async () => {
    const token = await tokenFor(tenantA);
    await convert(token, "profile=reference&format=xlsx");
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(auditLog));
    expect(rows.length).toBe(1);
    expect(rows[0]?.hanhDong).toBe("convert");
    expect(rows[0]?.doiTuong).toBe("reference");
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it("profile thiếu/lạ → 400; profile CHƯA KIỂM CHỨNG (misa) → 400; format lạ → 400", async () => {
    const token = await tokenFor(tenantA);
    expect((await convert(token, "format=csv")).status).toBe(400); // thiếu profile
    expect((await convert(token, "profile=khong-co&format=csv")).status).toBe(400);
    expect((await convert(token, "profile=misa&format=csv")).status).toBe(400); // pending
    expect((await convert(token, "profile=reference&format=pdf")).status).toBe(400);
  });

  it("RBAC: vai ke_toan → 403 (convert là hành động nhạy cảm như export)", async () => {
    await seedUser(db, tenantA, "kt@a.vn", "matkhau", "ke_toan");
    const token = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await convert(token, "profile=reference&format=csv");
    expect(res.status).toBe(403);
  });

  it("thiếu JWT → 401", async () => {
    const res = await app.request(
      "/exports/convert?profile=reference&format=csv",
      { method: "POST" },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });
});

// U30b — /convert phải TÔN TRỌNG dòng đã chọn, y hệt /exports. Nếu không, người dùng
// tick vài hóa đơn rồi bấm nút convert sẽ nhận file theo bộ lọc — sai kỳ vọng, âm thầm.
// Cùng hợp đồng: body JSON tùy chọn { ids }, có ids ⇒ bỏ qua bộ lọc (M2).
describe("REST /exports/convert — chọn dòng bằng ids (U30b)", () => {
  let db: Db;
  let storage: FakeStorage;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;
  let idA1: string;
  let idA2: string;
  let idB1: string;

  beforeEach(async () => {
    db = await freshDb();
    storage = makeStorage();
    app = createApp(injectDb(db, storage));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    idA1 = await seedInvoice(db, tenantA, { shdon: "1", chieu: "purchase" });
    idA2 = await seedInvoice(db, tenantA, {
      shdon: "2",
      chieu: "sold",
      tdlap: new Date("2026-04-15T10:00:00Z"),
    });
    idB1 = await seedInvoice(db, tenantB, { shdon: "1", nbmst: "9999999999" });
  });

  async function convert(token: string, query: string, body?: unknown) {
    return app.request(
      `/exports/convert?${query}`,
      {
        method: "POST",
        headers: body ? { ...bearer(token), "content-type": "application/json" } : bearer(token),
        body: body ? JSON.stringify(body) : undefined,
      },
      makeEnv(),
    );
  }

  async function dataLines(token: string, res: Response): Promise<string[]> {
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    return csvLines(new Uint8Array(await dl.arrayBuffer())).slice(1); // bỏ header
  }

  it("KHÔNG body → convert theo bộ lọc như cũ (tương thích ngược)", async () => {
    const token = await tokenFor(tenantA);
    const res = await convert(token, "profile=reference&format=csv");
    expect(res.status).toBe(201);
    expect((await dataLines(token, res)).length).toBe(2);
  });

  it("có ids → chỉ convert đúng các hóa đơn đã chọn", async () => {
    const token = await tokenFor(tenantA);
    const res = await convert(token, "profile=reference&format=csv", { ids: [idA2] });
    expect(res.status).toBe(201);
    expect((await dataLines(token, res)).length).toBe(1);
  });

  it("có ids thì BỎ QUA bộ lọc (M2, nhất quán với /exports)", async () => {
    const token = await tokenFor(tenantA);
    // chieu=purchase sẽ loại idA2 (sold) NẾU bộ lọc còn được áp.
    const res = await convert(token, "profile=reference&format=csv&chieu=purchase", {
      ids: [idA2],
    });
    expect(res.status).toBe(201);
    expect((await dataLines(token, res)).length).toBe(1);
  });

  // CRITICAL (multi-tenant.md)
  it("tenant A gửi id của tenant B → file RỖNG, không rò dữ liệu B", async () => {
    const token = await tokenFor(tenantA);
    const res = await convert(token, "profile=reference&format=csv", { ids: [idB1] });
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    const txt = dec.decode(new Uint8Array(await dl.arrayBuffer()));
    expect(csvLines(new TextEncoder().encode(txt)).length).toBe(1); // chỉ header
    expect(txt).not.toContain("9999999999");
  });

  it("ids không phải uuid → 400", async () => {
    const token = await tokenFor(tenantA);
    expect((await convert(token, "profile=reference&format=csv", { ids: ["x"] })).status).toBe(400);
  });

  it("vượt trần 1000 id → 400, KHÔNG ghi R2", async () => {
    const token = await tokenFor(tenantA);
    const truoc = storage.map.size;
    const res = await convert(token, "profile=reference&format=csv", {
      ids: Array.from({ length: 1001 }, () => idA1),
    });
    expect(res.status).toBe(400);
    expect(storage.map.size).toBe(truoc);
  });

  it("body vượt trần kích thước → 413 (bodyLimit áp cho CẢ /convert)", async () => {
    const token = await tokenFor(tenantA);
    const res = await convert(token, "profile=reference&format=csv", {
      ids: ["x".repeat(2_000_000)],
    });
    expect(res.status).toBe(413);
  });

  it("audit 'convert' ghi soIdDaChon khi có chọn dòng", async () => {
    const token = await tokenFor(tenantA);
    await convert(token, "profile=reference&format=csv", { ids: [idA1, idA2] });
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(auditLog));
    const cv = rows.filter((r) => r.hanhDong === "convert");
    expect(cv[0]?.chiTiet).toMatchObject({ soIdDaChon: 2 });
  });
});

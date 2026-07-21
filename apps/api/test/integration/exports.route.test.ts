// U7 integration (PGlite + R2 giả) — REST kết xuất đi qua ĐƯỜNG THẬT: createApp + auth
// JWT + route + withTenant/RLS + ghi R2 + audit. Bắt buộc (multi-tenant.md): tenant A
// KHÔNG kết xuất/không tải được dữ liệu tenant B. Offline, không mạng, không GDT.
import { auditLog, dongHangHoa, withTenant } from "@vat/db";
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

// Khối hóa đơn = các dòng TRƯỚC dòng trống ngăn cách khối "Chi tiết dòng hàng" (U23-B).
function invoiceSection(lines: string[]): string[] {
  const sep = lines.indexOf("");
  return sep >= 0 ? lines.slice(0, sep) : lines;
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
    // Sheet phẳng (2026-07-21): header + 1 dòng cho mỗi hóa đơn chưa có dòng hàng.
    // 2 hóa đơn của A, chưa seed dòng hàng ⇒ header + 2 = 3 dòng.
    expect(lines.length).toBe(3);
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

  it("POST /exports?format=xml.zip → 201; tải lại là zip hợp lệ, 1 file .xml/hóa đơn", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=xml.zip");
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };

    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toContain("application/zip");
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const zip = unzipSync(bytes);
    expect(Object.keys(zip).length).toBe(2); // 2 hóa đơn của A
    for (const [name, content] of Object.entries(zip)) {
      expect(name.endsWith(".xml")).toBe(true);
      expect(dec.decode(content)).not.toContain("9999999999");
    }
  });

  it("POST /exports?format=html.zip → 201; tải lại là zip hợp lệ, 1 file .html/hóa đơn", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=html.zip");
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };

    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toContain("application/zip");
    const zip = unzipSync(new Uint8Array(await dl.arrayBuffer()));
    expect(Object.keys(zip).length).toBe(2);
    for (const [name, content] of Object.entries(zip)) {
      expect(name.endsWith(".html")).toBe(true);
      expect(dec.decode(content)).toContain("<!doctype html>");
    }
  });

  it("lọc theo chieu=sold → chỉ 1 bản ghi", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=csv&chieu=sold");
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    expect(invoiceSection(csvLines(new Uint8Array(await dl.arrayBuffer()))).length).toBe(2); // header + 1
  });

  it("sheet phẳng: chứa dòng hàng của A (kèm số HĐ), KHÔNG lẫn dòng của B (cách ly tenant)", async () => {
    // Seed một hóa đơn A + một hóa đơn B, mỗi cái một dòng hàng.
    const invA = await seedInvoice(db, tenantA, { shdon: "77" });
    await db.insert(dongHangHoa).values({
      hoaDonId: invA,
      tenantId: tenantA,
      stt: 1,
      ten: "Dịch vụ A",
      dvtinh: "lần",
      sluong: "1",
      dgia: "1000",
      thtien: "1000",
      ltsuat: "8%",
      tsuat: "0.08",
      tsuatTien: "80",
      rawJson: {},
    });
    const invB = await seedInvoice(db, tenantB, { shdon: "88" });
    await db.insert(dongHangHoa).values({
      hoaDonId: invB,
      tenantId: tenantB,
      stt: 1,
      ten: "Dịch vụ B bí mật",
      dvtinh: "lần",
      sluong: "1",
      dgia: "1000",
      thtien: "1000",
      ltsuat: "8%",
      tsuat: "0.08",
      tsuatTien: "80",
      rawJson: {},
    });

    const token = await tokenFor(tenantA);
    const { url } = (await (await createExport(token, "format=xlsx")).json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    const zip = unzipSync(new Uint8Array(await dl.arrayBuffer()));
    // MỘT sheet phẳng — KHÔNG còn sheet2.
    expect(zip["xl/worksheets/sheet2.xml"]).toBeUndefined();
    const sheet1 = dec.decode(zip["xl/worksheets/sheet1.xml"] as Uint8Array);
    expect(sheet1).toContain("Dịch vụ A");
    expect(sheet1).toContain("77"); // số HĐ trên dòng hàng
    // Cách ly tenant: dòng hàng của B KHÔNG lọt vào file của A.
    expect(sheet1).not.toContain("Dịch vụ B bí mật");
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

  it("audit chi_tiet MASK giá trị nhạy cảm lọt qua bộ lọc (nbmst chứa JWT) — U12/security.md", async () => {
    const token = await tokenFor(tenantA);
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123";
    // nbmst là chuỗi tự do (z.string().min(1)) → giá trị lọt vào chi_tiet.filter.
    await createExport(token, `format=csv&nbmst=${jwt}`);
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(auditLog));
    expect(JSON.stringify(rows[0]?.chiTiet)).not.toContain(jwt);
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

// ---------------------------------------------------------------------------
// U30 — chọn dòng để xuất. `ids` đến từ BODY JSON (query string không chứa nổi hàng
// nghìn uuid). Mở rộng CỘNG THÊM: không body ⇒ hành vi cũ nguyên vẹn.
// ---------------------------------------------------------------------------

describe("REST /exports — chọn dòng bằng ids (U30)", () => {
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

  /** POST /exports kèm body JSON tùy chọn. */
  async function createExport(token: string, query: string, body?: unknown) {
    return app.request(
      `/exports?${query}`,
      {
        method: "POST",
        headers: body ? { ...bearer(token), "content-type": "application/json" } : bearer(token),
        body: body ? JSON.stringify(body) : undefined,
      },
      makeEnv(),
    );
  }

  async function csvOf(token: string, res: Response): Promise<string[]> {
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    return csvLines(new Uint8Array(await dl.arrayBuffer()));
  }

  it("T1 — KHÔNG có body → xuất theo bộ lọc như cũ (tương thích ngược)", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=csv");
    expect(res.status).toBe(201);
    expect(invoiceSection(await csvOf(token, res)).length).toBe(3); // header + 2 HĐ
  });

  it("T2 — ids 1 phần tử → file chỉ chứa đúng hóa đơn đó", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=csv", { ids: [idA2] });
    expect(res.status).toBe(201);
    const lines = invoiceSection(await csvOf(token, res));
    expect(lines.length).toBe(2); // header + 1
    expect(lines[1]).toContain(",2,"); // shdon = 2
  });

  it("T3 — có ids thì BỎ QUA bộ lọc trong query string (M2)", async () => {
    const token = await tokenFor(tenantA);
    // Bộ lọc chieu=purchase sẽ loại idA2 (sold) NẾU còn được áp. Kỳ vọng: vẫn ra idA2.
    const res = await createExport(token, "format=csv&chieu=purchase", { ids: [idA2] });
    expect(res.status).toBe(201);
    const lines = invoiceSection(await csvOf(token, res));
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain(",2,");
  });

  it("T4 — id không tồn tại bị bỏ qua lặng lẽ, phần còn lại vẫn xuất", async () => {
    const token = await tokenFor(tenantA);
    const ma = "00000000-0000-4000-8000-000000000000";
    const res = await createExport(token, "format=csv", { ids: [idA1, ma] });
    expect(res.status).toBe(201);
    expect(invoiceSection(await csvOf(token, res)).length).toBe(2); // header + 1
  });

  it("T5 — vượt trần 1000 id → 400, KHÔNG ghi R2", async () => {
    const token = await tokenFor(tenantA);
    const truoc = storage.map.size;
    const qua = Array.from({ length: 1001 }, () => idA1);
    const res = await createExport(token, "format=csv", { ids: qua });
    expect(res.status).toBe(400);
    expect(storage.map.size).toBe(truoc); // không tạo file rác
  });

  // CRITICAL (multi-tenant.md): id của tenant khác KHÔNG được kéo dữ liệu về.
  it("T6 — tenant A gửi id hóa đơn của tenant B → file RỖNG, không rò dữ liệu B", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=csv", { ids: [idB1] });
    expect(res.status).toBe(201);
    const lines = await csvOf(token, res);
    expect(invoiceSection(lines).length).toBe(1); // chỉ header
    expect(lines.join("\n")).not.toContain("9999999999");
  });

  it("T7 — ids không phải uuid → 400", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=csv", { ids: ["1 OR 1=1"] });
    expect(res.status).toBe(400);
  });

  it("T8 — audit 'export' vẫn ghi, kèm số lượng id đã chọn", async () => {
    const token = await tokenFor(tenantA);
    await createExport(token, "format=csv", { ids: [idA1, idA2] });
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(auditLog));
    const ex = rows.filter((r) => r.hanhDong === "export");
    expect(ex.length).toBe(1);
    // Khẳng định ĐÚNG TRƯỜNG, không phải "chuỗi có chứa số 2" (uuid nào cũng chứa '2').
    expect(ex[0]?.chiTiet).toMatchObject({ soIdDaChon: 2 });
  });

  it("T8b — không chọn dòng nào → audit KHÔNG có soIdDaChon (phân biệt hai chế độ)", async () => {
    const token = await tokenFor(tenantA);
    await createExport(token, "format=csv");
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(auditLog));
    const ex = rows.filter((r) => r.hanhDong === "export");
    expect(ex[0]?.chiTiet).not.toHaveProperty("soIdDaChon");
  });

  it("xlsx cũng tôn trọng ids", async () => {
    const token = await tokenFor(tenantA);
    const res = await createExport(token, "format=xlsx", { ids: [idA1] });
    const { url } = (await res.json()) as { url: string };
    const dl = await app.request(url, { headers: bearer(token) }, makeEnv());
    expect(xlsxDataRowCount(new Uint8Array(await dl.arrayBuffer()))).toBe(1);
  });
});

// U30 — phòng thủ tường minh cho bề mặt MỚI: route nay đọc body JSON. Trần MAX_EXPORT_IDS
// chỉ chặn SAU khi đã parse xong; body khổng lồ vẫn tốn CPU/RAM của Worker trước đó.
// Không dựa ngầm vào giới hạn mặc định của nền tảng (phát hiện review bảo mật 2026-07-20).
describe("REST /exports — trần kích thước body (U30)", () => {
  let db: Db;
  let storage: FakeStorage;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    storage = makeStorage();
    app = createApp(injectDb(db, storage));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    await seedInvoice(db, tenantA, { shdon: "1" });
  });

  it("body vượt trần → 413, KHÔNG chạm DB/R2", async () => {
    const token = await tokenFor(tenantA);
    const truoc = storage.map.size;
    // ~2MB chuỗi rác: vượt xa 1000 uuid (~40KB) nhưng vẫn dưới giới hạn nền tảng.
    const res = await app.request(
      "/exports?format=csv",
      {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ ids: ["x".repeat(2_000_000)] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(413);
    expect(storage.map.size).toBe(truoc);
  });

  it("body kích thước bình thường (1000 uuid) vẫn qua được trần", async () => {
    const token = await tokenFor(tenantA);
    const ids = Array.from(
      { length: 1000 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const res = await app.request(
      "/exports?format=csv",
      {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(201); // trần phải đủ rộng cho ca dùng hợp lệ tối đa
  });
});

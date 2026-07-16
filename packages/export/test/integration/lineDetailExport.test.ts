// U23-B integration (PGlite) — kết xuất dòng hàng CÁCH LY TENANT: dùng fetchLinesForInvoices
// + iterateInvoices THẬT (lọc tenant_id tường minh). Xác nhận export của tenant A KHÔNG chứa
// dòng hàng của tenant B, kể cả khi B có dữ liệu. Offline (PGlite), KHÔNG mạng (testing.md).
import { dongHangHoa } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { lineDetailRenderColumns } from "../../src/columns";
import { csvStreamWithLines } from "../../src/csv";
import { fetchLinesForInvoices } from "../../src/lineRows";
import { iterateInvoices } from "../../src/rows";
import { toXlsxWithLinesFromBatches } from "../../src/xlsx";
import { type Db, freshDb, makeTenant, parseCsv, readXlsx, seedInvoice, utf8 } from "../helpers";

const LINE_HEADERS = lineDetailRenderColumns().map((c) => c.header);
const NO_FILTER = {} as Parameters<typeof iterateInvoices>[2];

async function seedLine(db: Db, tenantId: string, hoaDonId: string, ten: string) {
  await db.insert(dongHangHoa).values({
    hoaDonId,
    tenantId,
    stt: 1,
    ten,
    dvtinh: "cái",
    sluong: "1",
    dgia: "1000",
    thtien: "1000",
    ltsuat: "8%",
    tsuat: "0.08",
    tsuatTien: "80",
    rawJson: {},
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return utf8.decode(merged);
}

describe("U23-B — cách ly tenant khi kết xuất dòng hàng (integration)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
  });

  it("(e) xlsx của A không chứa dòng hàng của B", async () => {
    const invA = await seedInvoice(db, tenantA, { shdon: "10" });
    await seedLine(db, tenantA, invA, "Hàng A công khai");
    const invB = await seedInvoice(db, tenantB, { shdon: "20" });
    await seedLine(db, tenantB, invB, "Hàng B bí mật");

    const bytes = await toXlsxWithLinesFromBatches(iterateInvoices(db, tenantA, NO_FILTER), (ids) =>
      fetchLinesForInvoices(db, tenantA, ids),
    );
    const detail = readXlsx(bytes, 2);
    const values = detail.rows.flatMap((r) => r.map((c) => c.value));
    expect(values).toContain("Hàng A công khai");
    expect(values).not.toContain("Hàng B bí mật");
    // Chỉ đúng 1 dòng hàng của A (header + 1).
    expect(detail.rows.length).toBe(2);
  });

  it("(e) csv của A không chứa dòng hàng của B", async () => {
    const invA = await seedInvoice(db, tenantA, { shdon: "10" });
    await seedLine(db, tenantA, invA, "Hàng A công khai");
    const invB = await seedInvoice(db, tenantB, { shdon: "20" });
    await seedLine(db, tenantB, invB, "Hàng B bí mật");

    const text = await drain(
      csvStreamWithLines(
        iterateInvoices(db, tenantA, NO_FILTER),
        iterateInvoices(db, tenantA, NO_FILTER),
        (ids) => fetchLinesForInvoices(db, tenantA, ids),
      ),
    );
    expect(text).toContain("Hàng A công khai");
    expect(text).not.toContain("Hàng B bí mật");
    const grid = parseCsv(text);
    const hdrIdx = grid.findIndex(
      (r) => r[0] === LINE_HEADERS[0] && r.length === LINE_HEADERS.length,
    );
    const lineRows = grid.slice(hdrIdx + 1).filter((r) => r.length === LINE_HEADERS.length);
    expect(lineRows.length).toBe(1);
  });
});

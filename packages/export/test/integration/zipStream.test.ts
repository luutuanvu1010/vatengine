// U22 integration (PGlite) — zipStreamFromBatches: mỗi hóa đơn → một file trong zip,
// tiêu thụ iterateInvoices + fetchLinesForInvoices lô-by-lô. Đọc lại bằng unzipSync để
// kiểm nội dung + tên file + không lẫn tenant.
import { dongHangHoa } from "@vat/db";
import { withTenant } from "@vat/db";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { invoiceToHtml, invoiceToXml } from "../../src/invoiceDoc";
import { fetchLinesForInvoices } from "../../src/lineRows";
import { iterateInvoices } from "../../src/rows";
import { zipStreamFromBatches } from "../../src/zipStream";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

const dec = new TextDecoder();

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

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

describe("zipStreamFromBatches (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
  });

  it("xml.zip: một file .xml theo hóa đơn, chứa đúng dòng hàng", async () => {
    const inv1 = await seedInvoice(db, tenantA, { shdon: "1", khhdon: "C26TAA" });
    const inv2 = await seedInvoice(db, tenantA, {
      shdon: "2",
      khhdon: "C26TAA",
      tdlap: new Date("2026-04-15T10:00:00Z"),
    });
    await seedLine(db, tenantA, inv1, "Hàng của HĐ1");
    await seedLine(db, tenantA, inv2, "Hàng của HĐ2");

    const stream = await withTenant(db, tenantA, async (tx) => {
      const batches = iterateInvoices(tx, tenantA, {}, 10);
      const fetchLines = (ids: string[]) => fetchLinesForInvoices(tx, tenantA, ids);
      return collect(
        zipStreamFromBatches(batches, fetchLines, (row, lines) => ({
          content: invoiceToXml(row, lines),
          ext: "xml",
        })),
      );
    });

    const zip = unzipSync(stream);
    const files = Object.keys(zip);
    expect(files).toEqual(expect.arrayContaining(["C26TAA-1.xml", "C26TAA-2.xml"]));
    expect(files.length).toBe(2);
    expect(dec.decode(zip["C26TAA-1.xml"])).toContain("Hàng của HĐ1");
    expect(dec.decode(zip["C26TAA-2.xml"])).toContain("Hàng của HĐ2");
  });

  it("html.zip: dùng renderer html, đóng gói đúng số hóa đơn", async () => {
    await seedInvoice(db, tenantA, { shdon: "1" });
    await seedInvoice(db, tenantA, { shdon: "2", tdlap: new Date("2026-04-15T10:00:00Z") });

    const stream = await withTenant(db, tenantA, async (tx) => {
      const batches = iterateInvoices(tx, tenantA, {}, 10);
      const fetchLines = (ids: string[]) => fetchLinesForInvoices(tx, tenantA, ids);
      return collect(
        zipStreamFromBatches(batches, fetchLines, (row, lines) => ({
          content: invoiceToHtml(row, lines),
          ext: "html",
        })),
      );
    });

    const zip = unzipSync(stream);
    expect(Object.keys(zip).length).toBe(2);
    for (const bytes of Object.values(zip)) {
      expect(dec.decode(bytes)).toContain("<!doctype html>");
    }
  });

  it("cách ly tenant: zip của A không chứa dòng hàng của B", async () => {
    const invA = await seedInvoice(db, tenantA, { shdon: "1" });
    const invB = await seedInvoice(db, tenantB, { shdon: "1", nbmst: "9999999999" });
    await seedLine(db, tenantA, invA, "Hàng A");
    await seedLine(db, tenantB, invB, "Hàng B bí mật");

    const stream = await withTenant(db, tenantA, async (tx) => {
      const batches = iterateInvoices(tx, tenantA, {}, 10);
      const fetchLines = (ids: string[]) => fetchLinesForInvoices(tx, tenantA, ids);
      return collect(
        zipStreamFromBatches(batches, fetchLines, (row, lines) => ({
          content: invoiceToXml(row, lines),
          ext: "xml",
        })),
      );
    });

    const zip = unzipSync(stream);
    expect(Object.keys(zip).length).toBe(1);
    const content = dec.decode(Object.values(zip)[0] as Uint8Array);
    expect(content).toContain("Hàng A");
    expect(content).not.toContain("Hàng B bí mật");
  });

  it("fetchLines ném lỗi giữa chừng → stream lỗi (không âm thầm sinh zip thiếu dữ liệu)", async () => {
    await seedInvoice(db, tenantA, { shdon: "1" });

    const stream = await withTenant(db, tenantA, async (tx) => {
      const batches = iterateInvoices(tx, tenantA, {}, 10);
      const failingFetch = () => Promise.reject(new Error("lỗi DB giả lập"));
      return zipStreamFromBatches(batches, failingFetch, (row, lines) => ({
        content: invoiceToXml(row, lines),
        ext: "xml",
      }));
    });

    await expect(collect(stream)).rejects.toThrow("lỗi DB giả lập");
  });

  it("tập rỗng → zip hợp lệ 0 file", async () => {
    const stream = await withTenant(db, tenantA, async (tx) => {
      const batches = iterateInvoices(tx, tenantA, {}, 10);
      const fetchLines = (ids: string[]) => fetchLinesForInvoices(tx, tenantA, ids);
      return collect(
        zipStreamFromBatches(batches, fetchLines, (row, lines) => ({
          content: invoiceToXml(row, lines),
          ext: "xml",
        })),
      );
    });
    const zip = unzipSync(stream);
    expect(Object.keys(zip).length).toBe(0);
  });
});

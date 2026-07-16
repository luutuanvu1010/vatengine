import type { InvoiceLineLike } from "@vat/export";
// U23-B unit — dòng hàng (dong_hang_hoa) vào file kết xuất:
//  · xlsx: THÊM sheet "Chi tiết dòng hàng" (sheet 2), giữ nguyên sheet "HoaDon".
//  · csv : THÊM khối "Chi tiết dòng hàng" sau khối hóa đơn (cùng file).
// Mỗi dòng hàng = 1 row, khóa `shdon` liên kết về hóa đơn. Tiền/số lượng giữ CHUỖI,
// không ép float. Offline (Miniflare/unit) — fetchLines được stub in-memory, KHÔNG mạng.
import type { HoaDonRow } from "@vat/query";
import { describe, expect, it } from "vitest";
import { lineDetailRenderColumns } from "../../src/columns";
import { csvStreamWithLines } from "../../src/csv";
import { toXlsxWithLinesFromBatches } from "../../src/xlsx";
import { parseCsv, readXlsx, readXlsxSheetNames, utf8 } from "../helpers";

const LINE_HEADERS = lineDetailRenderColumns().map((c) => c.header);

function row(over: Partial<HoaDonRow> = {}): HoaDonRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: "00000000-0000-0000-0000-0000000000aa",
    nbmst: "0100000001",
    nbten: "Cty Bán",
    nmmst: "0100000002",
    nmten: "Cty Mua",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon: "7",
    tdlap: new Date("2026-04-12T09:05:03Z"),
    ncnhat: null,
    tgtcthue: "1000000",
    tgtthue: "80000",
    tgtttbso: "1080000",
    ttcktmai: null,
    dvtte: "VND",
    tgia: null,
    ttxly: 8,
    tthai: 1,
    chieu: "purchase",
    nguon: "normal",
    rawJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as HoaDonRow;
}

function line(over: Partial<InvoiceLineLike> = {}): InvoiceLineLike {
  return {
    stt: 1,
    ten: "Hàng A",
    dvtinh: "cái",
    sluong: "2",
    dgia: "1000",
    thtien: "2000",
    ltsuat: "8%",
    tsuat: "0.08",
    tsuatTien: "160",
    ...over,
  };
}

async function* batchesOf(rows: HoaDonRow[], size: number): AsyncGenerator<HoaDonRow[]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

/** fetchLines in-memory: map id → lines, khớp chữ ký fetchLinesForInvoices. */
function stubFetch(byId: Record<string, InvoiceLineLike[]>) {
  return async (ids: string[]) => {
    const m = new Map<string, InvoiceLineLike[]>();
    for (const id of ids) {
      const l = byId[id];
      if (l?.length) m.set(id, l);
    }
    return m;
  };
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

const iCol = (key: string) => LINE_HEADERS.indexOf(key);

describe("U23-B xlsx — sheet 'Chi tiết dòng hàng'", () => {
  it("(a) N hóa đơn có dòng hàng → sheet 2 có đúng tổng số dòng hàng + đúng shdon", async () => {
    const invA = row({ id: "a", shdon: "100" });
    const invB = row({ id: "b", shdon: "200" });
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([invA, invB], 10),
      stubFetch({
        a: [line({ stt: 1, ten: "A1" }), line({ stt: 2, ten: "A2" })],
        b: [line({ stt: 1, ten: "B1" })],
      }),
    );
    // Sheet 1 giữ nguyên khối hóa đơn.
    expect(readXlsxSheetNames(bytes)).toEqual(["HoaDon", "Chi tiết dòng hàng"]);
    const detail = readXlsx(bytes, 2);
    // header + 3 dòng hàng (2 của A, 1 của B).
    expect(detail.rows.length).toBe(4);
    expect(detail.rows[0]?.map((c) => c.value)).toEqual(LINE_HEADERS);
    const shdonCol = iCol("Số HĐ");
    const tenCol = iCol("Tên hàng hóa/dịch vụ");
    const dataShdon = detail.rows.slice(1).map((r) => r[shdonCol]?.value);
    const dataTen = detail.rows.slice(1).map((r) => r[tenCol]?.value);
    expect(dataShdon).toEqual(["100", "100", "200"]);
    expect(dataTen).toEqual(["A1", "A2", "B1"]);
  });

  it("(c) thành tiền/số lượng > 2^53 giữ CHÍNH XÁC trong <v> (không ép float)", async () => {
    const big = "9007199254740993"; // 2^53 + 1
    const bigQty = "12345678901234567890";
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([row({ id: "a", shdon: "1" })], 10),
      stubFetch({ a: [line({ sluong: bigQty, thtien: big })] }),
    );
    const detail = readXlsx(bytes, 2);
    expect(detail.rows[1]?.[iCol("Thành tiền")]?.value).toBe(big);
    expect(detail.rows[1]?.[iCol("Số lượng")]?.value).toBe(bigQty);
  });

  it("(d) hóa đơn không có dòng hàng → sheet 2 chỉ có header, không row rác", async () => {
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([row({ id: "a", shdon: "1" })], 10),
      stubFetch({}),
    );
    const detail = readXlsx(bytes, 2);
    expect(detail.rows.length).toBe(1); // chỉ header
  });
});

describe("U23-B csv — khối 'Chi tiết dòng hàng'", () => {
  it("(b) khối dòng hàng đúng: header + mỗi dòng hàng 1 row gắn đúng shdon", async () => {
    const invA = row({ id: "a", shdon: "100" });
    const invB = row({ id: "b", shdon: "200" });
    const byId = {
      a: [line({ stt: 1, ten: "A1" }), line({ stt: 2, ten: "A2" })],
      b: [line({ stt: 1, ten: "B1" })],
    };
    const text = await drain(
      csvStreamWithLines(batchesOf([invA, invB], 10), batchesOf([invA, invB], 10), stubFetch(byId)),
    );
    const grid = parseCsv(text);
    // Tìm dòng header của khối dòng hàng.
    const hdrIdx = grid.findIndex(
      (r) => r.length === LINE_HEADERS.length && r[0] === LINE_HEADERS[0],
    );
    expect(hdrIdx).toBeGreaterThan(0);
    expect(grid[hdrIdx]).toEqual(LINE_HEADERS);
    const lineRows = grid.slice(hdrIdx + 1).filter((r) => r.length === LINE_HEADERS.length);
    expect(lineRows.map((r) => r[0])).toEqual(["100", "100", "200"]);
    expect(lineRows.map((r) => r[2])).toEqual(["A1", "A2", "B1"]);
  });

  it("(c) csv giữ số lượng/thành tiền > 2^53 nguyên bản chuỗi", async () => {
    const big = "9007199254740993";
    const bigQty = "12345678901234567890";
    const inv = row({ id: "a", shdon: "1" });
    const text = await drain(
      csvStreamWithLines(
        batchesOf([inv], 10),
        batchesOf([inv], 10),
        stubFetch({ a: [line({ sluong: bigQty, thtien: big })] }),
      ),
    );
    const grid = parseCsv(text);
    const hdrIdx = grid.findIndex(
      (r) => r[0] === LINE_HEADERS[0] && r.length === LINE_HEADERS.length,
    );
    const dataRow = grid[hdrIdx + 1];
    expect(dataRow?.[iCol("Số lượng")]).toBe(bigQty);
    expect(dataRow?.[iCol("Thành tiền")]).toBe(big);
  });

  it("(d) hóa đơn không dòng hàng → khối chỉ có header, không row rác", async () => {
    const inv = row({ id: "a", shdon: "1" });
    const text = await drain(
      csvStreamWithLines(batchesOf([inv], 10), batchesOf([inv], 10), stubFetch({})),
    );
    const grid = parseCsv(text);
    const hdrIdx = grid.findIndex(
      (r) => r[0] === LINE_HEADERS[0] && r.length === LINE_HEADERS.length,
    );
    expect(hdrIdx).toBeGreaterThan(0);
    // Không có dòng dữ liệu 8-cột nào sau header.
    const after = grid.slice(hdrIdx + 1).filter((r) => r.length === LINE_HEADERS.length);
    expect(after).toEqual([]);
  });
});

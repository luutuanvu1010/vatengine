import type { InvoiceLineLike } from "@vat/export";
// Sheet PHẲNG (2026-07-21) — file xuất chỉ còn MỘT sheet: mỗi mặt hàng một dòng, kèm đủ
// ngữ cảnh hóa đơn. Hóa đơn chưa có dòng hàng vẫn xuất MỘT dòng (không mất khỏi file).
// Tiền/số lượng giữ CHUỖI, không ép float. Offline — fetchLines stub in-memory.
import { describe, expect, it } from "vitest";
import { lineDetailRenderColumns } from "../../src/columns";
import { csvStreamWithLines } from "../../src/csv";
import type { ExportRow } from "../../src/rows";
import { toXlsxWithLinesFromBatches } from "../../src/xlsx";
import { parseCsv, readXlsx, readXlsxSheetNames, utf8 } from "../helpers";

const LINE_HEADERS = lineDetailRenderColumns().map((c) => c.header);

function row(over: Partial<ExportRow> = {}): ExportRow {
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
    tenHangDau: null,
    hangHoa: [],
    soDongHang: 0,
    ...over,
  } as ExportRow;
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

async function* batchesOf(rows: ExportRow[], size: number): AsyncGenerator<ExportRow[]> {
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

describe("Cột sheet phẳng", () => {
  it("có đủ cột nhận diện; KHÔNG có 'Số dòng hàng'; thứ tự thuế không lệch", () => {
    for (const c of ["Ngày lập", "Số HĐ", "Tên người bán", "Tên hàng hóa/dịch vụ", "Số lượng"]) {
      expect(LINE_HEADERS, `thiếu cột ${c}`).toContain(c);
    }
    expect(LINE_HEADERS).not.toContain("Số dòng hàng");
    // "Mã thuế suất" ngay TRƯỚC "Thuế suất", "Tiền thuế dòng" ngay SAU.
    expect(iCol("Thuế suất")).toBe(iCol("Mã thuế suất") + 1);
    expect(iCol("Tiền thuế dòng")).toBe(iCol("Thuế suất") + 1);
  });

  it("tiền CẤP HÓA ĐƠN mang nhãn '(cả HĐ)' để không cộng nhầm", () => {
    for (const c of [
      "Tiền chưa thuế (cả HĐ)",
      "Chiết khấu (cả HĐ)",
      "Tiền thuế (cả HĐ)",
      "Tổng thanh toán (cả HĐ)",
    ]) {
      expect(LINE_HEADERS, `thiếu cột ${c}`).toContain(c);
    }
  });
});

// ---------------------------------------------------------------------------
// U29 — mã thuế suất (ltsuat) phân biệt KCT/KKKNT/0% dù `tsuat` đều = 0.
// ---------------------------------------------------------------------------
describe("Mã thuế suất + tiền thuế dòng", () => {
  it("KCT / KKKNT / 0% thật — cùng tsuat=0 — vẫn PHÂN BIỆT được nhờ mã thuế suất", async () => {
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([row({ id: "a", shdon: "1" })], 10),
      stubFetch({
        a: [
          line({ stt: 1, ltsuat: "KCT", tsuat: "0", tsuatTien: null }),
          line({ stt: 2, ltsuat: "KKKNT", tsuat: "0", tsuatTien: null }),
          line({ stt: 3, ltsuat: "0%", tsuat: "0", tsuatTien: "0" }),
        ],
      }),
    );
    const detail = readXlsx(bytes, 1);
    const ma = detail.rows.slice(1).map((r) => r[iCol("Mã thuế suất")]?.value);
    const so = detail.rows.slice(1).map((r) => r[iCol("Thuế suất")]?.value);
    expect(so).toEqual(["0", "0", "0"]);
    expect(ma).toEqual(["KCT", "KKKNT", "0%"]);
    expect(new Set(ma).size).toBe(3);
  });

  it("mã thuế suất giữ nguyên CHUỖI 'KCT' (không ép số)", async () => {
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([row({ id: "a", shdon: "1" })], 10),
      stubFetch({ a: [line({ ltsuat: "KCT", tsuat: "0" })] }),
    );
    expect(readXlsx(bytes, 1).rows[1]?.[iCol("Mã thuế suất")]?.value).toBe("KCT");
  });

  it("tiền thuế dòng: có giá trị → xuất đúng; null → ô TRỐNG", async () => {
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([row({ id: "a", shdon: "1" })], 10),
      stubFetch({ a: [line({ stt: 1, tsuatTien: "160" }), line({ stt: 2, tsuatTien: null })] }),
    );
    const detail = readXlsx(bytes, 1);
    expect(detail.rows[1]?.[iCol("Tiền thuế dòng")]?.value).toBe("160");
    expect(detail.rows[2]?.[iCol("Tiền thuế dòng")]?.value ?? "").toBe("");
  });

  it("csv cũng mang mã thuế suất + tiền thuế dòng", async () => {
    const inv = row({ id: "a", shdon: "1" });
    const text = await drain(
      csvStreamWithLines(
        batchesOf([inv], 10),
        stubFetch({ a: [line({ ltsuat: "KKKNT", tsuat: "0", tsuatTien: "0" })] }),
      ),
    );
    const grid = parseCsv(text);
    // Header là dòng 0 (một khối phẳng, không có nhãn khối phía trên).
    expect(grid[0]?.[iCol("Mã thuế suất")]).toBe("Mã thuế suất");
    expect(grid[1]?.[iCol("Mã thuế suất")]).toBe("KKKNT");
    expect(grid[1]?.[iCol("Tiền thuế dòng")]).toBe("0");
  });
});

describe("xlsx — MỘT sheet phẳng", () => {
  it("chỉ MỘT sheet; mỗi mặt hàng một dòng, kèm đúng ngữ cảnh hóa đơn", async () => {
    const invA = row({ id: "a", shdon: "100", nbten: "Bán A" });
    const invB = row({ id: "b", shdon: "200", nbten: "Bán B" });
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([invA, invB], 10),
      stubFetch({
        a: [line({ stt: 1, ten: "A1" }), line({ stt: 2, ten: "A2" })],
        b: [line({ stt: 1, ten: "B1" })],
      }),
    );
    expect(readXlsxSheetNames(bytes)).toEqual(["Hóa đơn & hàng hóa"]);
    const detail = readXlsx(bytes, 1);
    expect(detail.rows.length).toBe(4); // header + 3 mặt hàng
    const shdon = detail.rows.slice(1).map((r) => r[iCol("Số HĐ")]?.value);
    const ten = detail.rows.slice(1).map((r) => r[iCol("Tên hàng hóa/dịch vụ")]?.value);
    const ban = detail.rows.slice(1).map((r) => r[iCol("Tên người bán")]?.value);
    expect(shdon).toEqual(["100", "100", "200"]);
    expect(ten).toEqual(["A1", "A2", "B1"]);
    // Ngữ cảnh hóa đơn LẶP đúng theo dòng, không lẫn giữa hai HĐ.
    expect(ban).toEqual(["Bán A", "Bán A", "Bán B"]);
  });

  it("số lượng/thành tiền > 2^53 giữ CHÍNH XÁC (không ép float)", async () => {
    const big = "9007199254740993";
    const bigQty = "12345678901234567890";
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([row({ id: "a", shdon: "1" })], 10),
      stubFetch({ a: [line({ sluong: bigQty, thtien: big })] }),
    );
    const detail = readXlsx(bytes, 1);
    expect(detail.rows[1]?.[iCol("Thành tiền")]?.value).toBe(big);
    expect(detail.rows[1]?.[iCol("Số lượng")]?.value).toBe(bigQty);
  });

  it("hóa đơn KHÔNG có dòng hàng vẫn xuất MỘT dòng (không mất khỏi file), phần dòng để TRỐNG", async () => {
    const bytes = await toXlsxWithLinesFromBatches(
      batchesOf([row({ id: "a", shdon: "9", nbten: "Bán X" })], 10),
      stubFetch({}), // không có dòng hàng
    );
    const detail = readXlsx(bytes, 1);
    expect(detail.rows.length).toBe(2); // header + 1 dòng hóa đơn
    // Ngữ cảnh hóa đơn CÓ; phần dòng hàng TRỐNG.
    expect(detail.rows[1]?.[iCol("Số HĐ")]?.value).toBe("9");
    expect(detail.rows[1]?.[iCol("Tên người bán")]?.value).toBe("Bán X");
    expect(detail.rows[1]?.[iCol("Tên hàng hóa/dịch vụ")]?.value ?? "").toBe("");
    expect(detail.rows[1]?.[iCol("Số lượng")]?.value ?? "").toBe("");
  });
});

describe("csv — MỘT khối phẳng", () => {
  it("header dòng 0; mỗi mặt hàng một dòng gắn đúng số HĐ + tên", async () => {
    const invA = row({ id: "a", shdon: "100" });
    const invB = row({ id: "b", shdon: "200" });
    const text = await drain(
      csvStreamWithLines(
        batchesOf([invA, invB], 10),
        stubFetch({
          a: [line({ stt: 1, ten: "A1" }), line({ stt: 2, ten: "A2" })],
          b: [line({ stt: 1, ten: "B1" })],
        }),
      ),
    );
    const grid = parseCsv(text);
    expect(grid[0]).toEqual(LINE_HEADERS); // header ngay dòng đầu
    const dataRows = grid.slice(1).filter((r) => r.length === LINE_HEADERS.length);
    expect(dataRows.map((r) => r[iCol("Số HĐ")])).toEqual(["100", "100", "200"]);
    expect(dataRows.map((r) => r[iCol("Tên hàng hóa/dịch vụ")])).toEqual(["A1", "A2", "B1"]);
  });

  it("csv giữ số lượng/thành tiền > 2^53 nguyên bản chuỗi", async () => {
    const big = "9007199254740993";
    const bigQty = "12345678901234567890";
    const inv = row({ id: "a", shdon: "1" });
    const text = await drain(
      csvStreamWithLines(
        batchesOf([inv], 10),
        stubFetch({ a: [line({ sluong: bigQty, thtien: big })] }),
      ),
    );
    const grid = parseCsv(text);
    expect(grid[1]?.[iCol("Số lượng")]).toBe(bigQty);
    expect(grid[1]?.[iCol("Thành tiền")]).toBe(big);
  });

  it("hóa đơn không dòng hàng → vẫn MỘT dòng, phần dòng để trống", async () => {
    const inv = row({ id: "a", shdon: "9" });
    const text = await drain(csvStreamWithLines(batchesOf([inv], 10), stubFetch({})));
    const grid = parseCsv(text);
    const dataRows = grid.slice(1).filter((r) => r.length === LINE_HEADERS.length);
    expect(dataRows.length).toBe(1);
    expect(dataRows[0]?.[iCol("Số HĐ")]).toBe("9");
    expect(dataRows[0]?.[iCol("Tên hàng hóa/dịch vụ")]).toBe("");
  });
});

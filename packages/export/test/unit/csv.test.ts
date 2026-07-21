// U7 unit — encoder CSV (csv.ts). Đọc lại: đúng header + số bản ghi + tiền nguyên bản +
// escape RFC-4180 + BOM UTF-8 (để Excel mở đúng tiếng Việt). Offline.
import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS } from "../../src/columns";
import { csvStream, toCsv } from "../../src/csv";
import type { ExportRow } from "../../src/rows";
import { parseCsv, utf8 } from "../helpers";

async function* batchesOf(rows: ExportRow[], size: number): AsyncGenerator<ExportRow[]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
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
    soDongHang: 0,
    ...over,
  } as ExportRow;
}

describe("toCsv", () => {
  it("có BOM UTF-8 ở đầu", () => {
    const bytes = toCsv([]);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });

  it("dòng 1 = nhãn cột đúng thứ tự; tập rỗng → chỉ header", () => {
    const grid = parseCsv(utf8.decode(toCsv([])));
    expect(grid.length).toBe(1);
    expect(grid[0]).toEqual(EXPORT_COLUMNS.map((c) => c.label));
  });

  it("đúng số bản ghi + tiền giữ CHUỖI numeric nguyên bản (không tách nghìn)", () => {
    const grid = parseCsv(utf8.decode(toCsv([row({ tgtttbso: "1080000" }), row({ shdon: "8" })])));
    expect(grid.length).toBe(3); // header + 2
    const iTtbso = EXPORT_COLUMNS.findIndex((c) => c.key === "tgtttbso");
    expect(grid[1]?.[iTtbso]).toBe("1080000"); // KHÔNG "1,080,000"
  });

  it("tiền null → ô rỗng", () => {
    const grid = parseCsv(utf8.decode(toCsv([row({ tgtthue: null })])));
    const iThue = EXPORT_COLUMNS.findIndex((c) => c.key === "tgtthue");
    expect(grid[1]?.[iThue]).toBe("");
  });

  it("escape tên chứa dấu phẩy / nháy kép / xuống dòng (parse lại khớp)", () => {
    const tricky = 'Cty "ABC", chi nhánh\nHà Nội';
    const grid = parseCsv(utf8.decode(toCsv([row({ nbten: tricky })])));
    const iNbten = EXPORT_COLUMNS.findIndex((c) => c.key === "nbten");
    expect(grid[1]?.[iNbten]).toBe(tricky);
  });

  it("ngày xuất chuỗi UTC", () => {
    const grid = parseCsv(utf8.decode(toCsv([row({ tdlap: new Date("2026-04-12T09:05:03Z") })])));
    const iTdlap = EXPORT_COLUMNS.findIndex((c) => c.key === "tdlap");
    expect(grid[1]?.[iTdlap]).toBe("2026-04-12 09:05:03");
  });
});

describe("chống CSV/Excel formula injection", () => {
  const iNbten = EXPORT_COLUMNS.findIndex((c) => c.key === "nbten");
  const iTtbso = EXPORT_COLUMNS.findIndex((c) => c.key === "tgtttbso");

  it.each(["=SUM(1+1)", "+1", "-1+2", "@cmd", "\tx", "\rx"])(
    "ô văn bản bắt đầu bằng ký tự công thức %j → chèn ' (parse lại thấy prefix)",
    (name) => {
      const grid = parseCsv(utf8.decode(toCsv([row({ nbten: name })])));
      expect(grid[1]?.[iNbten]).toBe(`'${name}`);
    },
  );

  it("tên bình thường KHÔNG bị chèn '", () => {
    const grid = parseCsv(utf8.decode(toCsv([row({ nbten: "Cty ABC" })])));
    expect(grid[1]?.[iNbten]).toBe("Cty ABC");
  });

  it("ô SỐ (tiền) âm KHÔNG bị chèn ' (số hợp lệ, không phải công thức)", () => {
    const grid = parseCsv(utf8.decode(toCsv([row({ tgtttbso: "-5000" })])));
    expect(grid[1]?.[iTtbso]).toBe("-5000");
  });
});

describe("csvStream (stream lô-by-lô)", () => {
  it("cho ra CÙNG nội dung với toCsv (header + mọi lô), đúng số bản ghi", async () => {
    const rows = [row({ shdon: "1" }), row({ shdon: "2" }), row({ shdon: "3" })];
    const streamed = await drain(csvStream(batchesOf(rows, 2))); // pageSize < tổng
    expect(streamed).toBe(utf8.decode(toCsv(rows)));
    const grid = parseCsv(streamed);
    expect(grid.length).toBe(4); // header + 3
  });

  it("tập rỗng → chỉ header", async () => {
    const grid = parseCsv(await drain(csvStream(batchesOf([], 2))));
    expect(grid.length).toBe(1);
  });
});

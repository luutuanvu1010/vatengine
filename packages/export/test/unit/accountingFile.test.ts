// U11 unit — ánh xạ hóa đơn → file định dạng đích theo profile (toAccountingFile). Tiêu
// chí LÕI U11: "ánh xạ đúng định dạng mục tiêu". Dùng profile THAM CHIẾU (fixture) để đọc
// lại file và kiểm: header đúng thứ tự đích, transform (ngày dd/MM/yyyy), tiền = chuỗi
// numeric nguyên bản + numFmt "#,##0" (xlsx), null → ô trống. Offline.
import { describe, expect, it } from "vitest";
import {
  accountingCsvStream,
  accountingXlsxFromBatches,
  toAccountingFile,
} from "../../src/accountingFile";
import { REFERENCE_PROFILE } from "../../src/profiles/reference";
import type { ExportRow } from "../../src/rows";
import { parseCsv, readXlsx, utf8 } from "../helpers";

const HEADERS = REFERENCE_PROFILE.columns.map((c) => c.header);
const iOf = (h: string) => HEADERS.indexOf(h);

async function* batchesOf(rows: ExportRow[], size: number): AsyncGenerator<ExportRow[]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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
  return merged;
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
    tongSoLuong: null,
    ...over,
  } as ExportRow;
}

describe("toAccountingFile — CSV theo profile tham chiếu", () => {
  it("dòng 1 = header đích đúng thứ tự; CHỈ các cột của profile", () => {
    const grid = parseCsv(utf8.decode(toAccountingFile([], REFERENCE_PROFILE, "csv")));
    expect(grid.length).toBe(1);
    expect(grid[0]).toEqual(HEADERS);
    expect(grid[0]?.length).toBe(REFERENCE_PROFILE.columns.length);
  });

  it("ngày áp transform đích dd/MM/yyyy (khác native YYYY-MM-DD)", () => {
    const grid = parseCsv(
      utf8.decode(
        toAccountingFile(
          [row({ tdlap: new Date("2026-04-12T09:05:03Z") })],
          REFERENCE_PROFILE,
          "csv",
        ),
      ),
    );
    expect(grid[1]?.[iOf("Ngay hach toan")]).toBe("12/04/2026");
  });

  it("tiền giữ CHUỖI numeric nguyên bản (không tách nghìn)", () => {
    const grid = parseCsv(
      utf8.decode(toAccountingFile([row({ tgtttbso: "1080000" })], REFERENCE_PROFILE, "csv")),
    );
    expect(grid[1]?.[iOf("Tong thanh toan")]).toBe("1080000");
  });

  it("tiền null → ô trống (không số 0 giả)", () => {
    const grid = parseCsv(
      utf8.decode(toAccountingFile([row({ tgtthue: null })], REFERENCE_PROFILE, "csv")),
    );
    expect(grid[1]?.[iOf("Tien thue GTGT")]).toBe("");
  });
});

describe("toAccountingFile — XLSX theo profile tham chiếu (đọc lại)", () => {
  it("header đích đúng thứ tự; sheet mang tên của profile không lỗi đọc", () => {
    const { rows } = readXlsx(toAccountingFile([row()], REFERENCE_PROFILE, "xlsx"));
    expect(rows[0]?.map((c) => c.value)).toEqual(HEADERS);
  });

  it("ô tiền là SỐ + numFmt '#,##0'; giá trị lớn CHÍNH XÁC (không ép float)", () => {
    const big = "9007199254740993"; // 2^53 + 1
    const { rows } = readXlsx(
      toAccountingFile([row({ tgtttbso: big })], REFERENCE_PROFILE, "xlsx"),
    );
    const cell = rows[1]?.[iOf("Tong thanh toan")];
    expect(cell?.isNumber).toBe(true);
    expect(cell?.numFmt).toBe("#,##0");
    expect(cell?.value).toBe(big);
  });

  it("ngày transform dd/MM/yyyy là ô text đọc lại đúng", () => {
    const { rows } = readXlsx(
      toAccountingFile(
        [row({ tdlap: new Date("2026-04-12T09:05:03Z") })],
        REFERENCE_PROFILE,
        "xlsx",
      ),
    );
    expect(rows[1]?.[iOf("Ngay hach toan")]?.value).toBe("12/04/2026");
  });

  it("tiền null → ô trống", () => {
    const { rows } = readXlsx(
      toAccountingFile([row({ tgtcthue: null })], REFERENCE_PROFILE, "xlsx"),
    );
    const cell = rows[1]?.[iOf("Tien hang")];
    expect(cell?.value).toBe("");
    expect(cell?.isNumber).toBe(false);
  });

  it("tập rỗng → chỉ header", () => {
    const { rows } = readXlsx(toAccountingFile([], REFERENCE_PROFILE, "xlsx"));
    expect(rows.length).toBe(1);
  });
});

describe("streaming lô-by-lô = kết quả sync (route dùng generator keyset)", () => {
  it("accountingCsvStream cho ra CÙNG bytes với toAccountingFile csv", async () => {
    const data = [row({ shdon: "1" }), row({ shdon: "2" }), row({ shdon: "3" })];
    const streamed = await drain(accountingCsvStream(REFERENCE_PROFILE, batchesOf(data, 2)));
    expect(utf8.decode(streamed)).toBe(
      utf8.decode(toAccountingFile(data, REFERENCE_PROFILE, "csv")),
    );
  });

  it("accountingXlsxFromBatches đọc lại đúng số dòng + header", async () => {
    const data = [row({ shdon: "1" }), row({ shdon: "2" })];
    const { rows } = readXlsx(
      await accountingXlsxFromBatches(REFERENCE_PROFILE, batchesOf(data, 1)),
    );
    expect(rows.length).toBe(3); // header + 2
    expect(rows[0]?.map((c) => c.value)).toEqual(HEADERS);
  });
});

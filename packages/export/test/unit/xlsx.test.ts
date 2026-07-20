// U7 unit — encoder xlsx (xlsx.ts) tự dựng SpreadsheetML + fflate. Tiêu chí LÕI U7:
// "đọc lại file, đúng cột và ĐỊNH DẠNG TIỀN". readXlsx unzip + parse để kiểm ô số +
// numFmt "#,##0". Offline; fflate zipSync thuần JS (chạy cả Node lẫn workerd — spike riêng).
import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS } from "../../src/columns";
import type { ExportRow } from "../../src/rows";
import { toXlsx, toXlsxFromBatches } from "../../src/xlsx";
import { readXlsx } from "../helpers";

async function* batchesOf(rows: ExportRow[], size: number): AsyncGenerator<ExportRow[]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
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

const iOf = (key: string) => EXPORT_COLUMNS.findIndex((c) => c.key === key);

describe("toXlsx — cấu trúc file hợp lệ", () => {
  it("chứa các part bắt buộc của OOXML", () => {
    const { files } = readXlsx(toXlsx([row()]));
    for (const p of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
      "xl/styles.xml",
    ]) {
      expect(files).toContain(p);
    }
  });

  it("tập rỗng → file hợp lệ chỉ có dòng header", () => {
    const { rows } = readXlsx(toXlsx([]));
    expect(rows.length).toBe(1);
    expect(rows[0]?.map((c) => c.value)).toEqual(EXPORT_COLUMNS.map((c) => c.label));
  });
});

describe("toXlsx — đọc lại đúng cột + định dạng tiền", () => {
  it("dòng 1 là nhãn cột đúng thứ tự", () => {
    const { rows } = readXlsx(toXlsx([row()]));
    expect(rows[0]?.map((c) => c.value)).toEqual(EXPORT_COLUMNS.map((c) => c.label));
  });

  it("ô tiền là SỐ, đúng giá trị, numFmt '#,##0'", () => {
    const { rows } = readXlsx(toXlsx([row({ tgtttbso: "1080000" })]));
    const cell = rows[1]?.[iOf("tgtttbso")];
    expect(cell?.isNumber).toBe(true);
    expect(cell?.value).toBe("1080000");
    expect(cell?.numFmt).toBe("#,##0");
  });

  it("ô tiền giữ giá trị lớn CHÍNH XÁC (không mất số qua float)", () => {
    const big = "9007199254740993"; // 2^53 + 1 — mất chính xác nếu ép Number
    const { rows } = readXlsx(toXlsx([row({ tgtttbso: big })]));
    expect(rows[1]?.[iOf("tgtttbso")]?.value).toBe(big);
  });

  it("tiền null → ô trống (không số 0)", () => {
    const { rows } = readXlsx(toXlsx([row({ tgtthue: null })]));
    const cell = rows[1]?.[iOf("tgtthue")];
    expect(cell?.value).toBe("");
    expect(cell?.isNumber).toBe(false);
  });

  it("ô text (tên) đọc lại đúng, kể cả ký tự cần escape", () => {
    const { rows } = readXlsx(toXlsx([row({ nbten: 'A & B <C> "D"' })]));
    expect(rows[1]?.[iOf("nbten")]?.value).toBe('A & B <C> "D"');
  });

  it("an toàn formula injection: text bắt đầu '=' vẫn là inline string (Excel KHÔNG diễn giải)", () => {
    // xlsx không cần chèn ' như CSV: ô văn bản là t="inlineStr" → literal, không phải <f>.
    const { rows } = readXlsx(toXlsx([row({ nbten: "=SUM(1+1)" })]));
    const cell = rows[1]?.[iOf("nbten")];
    expect(cell?.isNumber).toBe(false);
    expect(cell?.value).toBe("=SUM(1+1)"); // nguyên văn, KHÔNG prefix, KHÔNG thành số/công thức
  });

  it("ttxly (mã) là ô số, KHÔNG có numFmt tiền", () => {
    const { rows } = readXlsx(toXlsx([row({ ttxly: 6 })]));
    const cell = rows[1]?.[iOf("ttxly")];
    expect(cell?.isNumber).toBe(true);
    expect(cell?.value).toBe("6");
    expect(cell?.numFmt).toBe("");
  });

  it("nhiều dòng → đúng số bản ghi", () => {
    const { rows } = readXlsx(
      toXlsx([row({ shdon: "1" }), row({ shdon: "2" }), row({ shdon: "3" })]),
    );
    expect(rows.length).toBe(4); // header + 3
  });
});

describe("toXlsxFromBatches (tiêu thụ generator lô-by-lô)", () => {
  it("cho ra CÙNG file với toXlsx (mọi lô, đánh số dòng liên tục)", async () => {
    const data = [row({ shdon: "1" }), row({ shdon: "2" }), row({ shdon: "3" })];
    const streamed = readXlsx(await toXlsxFromBatches(batchesOf(data, 2))); // pageSize < tổng
    const whole = readXlsx(toXlsx(data));
    expect(streamed.rows.length).toBe(whole.rows.length); // header + 3
    expect(streamed.rows.map((r) => r.map((c) => c.value))).toEqual(
      whole.rows.map((r) => r.map((c) => c.value)),
    );
  });

  it("tập rỗng → chỉ header", async () => {
    const { rows } = readXlsx(await toXlsxFromBatches(batchesOf([], 2)));
    expect(rows.length).toBe(1);
  });
});

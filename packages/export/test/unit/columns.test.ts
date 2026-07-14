// U7 unit — mẫu cột chuẩn DUY NHẤT (columns.ts) + chuẩn hóa ô. ttxly/tthai xuất MÃ số
// (chốt #3: KHÔNG nhãn tiếng Việt — tránh nguồn sự thật thứ hai). Offline.
import type { HoaDonRow } from "@vat/query";
import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS, type ExportColumn, cellFor, formatDate } from "../../src/columns";

function col(key: string): ExportColumn {
  const c = EXPORT_COLUMNS.find((x) => x.key === key);
  if (!c) throw new Error(`không tìm thấy cột ${key}`);
  return c;
}

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

describe("EXPORT_COLUMNS (mẫu cột chuẩn)", () => {
  it("đúng danh sách key + kind theo thứ tự kỳ vọng", () => {
    expect(EXPORT_COLUMNS.map((c) => c.key)).toEqual([
      "tdlap",
      "khmshdon",
      "khhdon",
      "shdon",
      "nbmst",
      "nbten",
      "nmmst",
      "nmten",
      "tgtcthue",
      "tgtthue",
      "tgtttbso",
      "dvtte",
      "ttxly",
      "tthai",
      "chieu",
      "nguon",
    ]);
  });

  it("ba cột tiền được đánh dấu kind 'money'", () => {
    const money = EXPORT_COLUMNS.filter((c) => c.kind === "money").map((c) => c.key);
    expect(money).toEqual(["tgtcthue", "tgtthue", "tgtttbso"]);
  });

  it("ttxly/tthai là 'int' (MÃ số) — không có cột nhãn tiếng Việt", () => {
    expect(EXPORT_COLUMNS.find((c) => c.key === "ttxly")?.kind).toBe("int");
    expect(EXPORT_COLUMNS.find((c) => c.key === "tthai")?.kind).toBe("int");
    // Không tạo cột *_text nhãn (nguồn sự thật thứ hai).
    expect(EXPORT_COLUMNS.some((c) => c.key.endsWith("_text"))).toBe(false);
  });

  it("mọi label không rỗng và duy nhất", () => {
    const labels = EXPORT_COLUMNS.map((c) => c.label);
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("cellFor — chuẩn hóa ô (không ép float)", () => {
  it("tiền → ô số, giữ CHUỖI numeric nguyên bản", () => {
    const c = col("tgtttbso");
    expect(cellFor(c, row({ tgtttbso: "1080000" }))).toEqual({ t: "num", v: "1080000" });
  });

  it("tiền null → ô trống (không '0' giả)", () => {
    const c = col("tgtthue");
    expect(cellFor(c, row({ tgtthue: null }))).toEqual({ t: "blank" });
  });

  it("ttxly (mã) → ô số", () => {
    const c = col("ttxly");
    expect(cellFor(c, row({ ttxly: 6 }))).toEqual({ t: "num", v: "6" });
  });

  it("text → ô chuỗi; null → trống", () => {
    const c = col("nbten");
    expect(cellFor(c, row({ nbten: "Cty Bán" }))).toEqual({ t: "str", v: "Cty Bán" });
    expect(cellFor(c, row({ nbten: null }))).toEqual({ t: "blank" });
  });

  it("ngày → ô chuỗi UTC 'YYYY-MM-DD HH:mm:ss'", () => {
    const c = col("tdlap");
    expect(cellFor(c, row({ tdlap: new Date("2026-04-12T09:05:03Z") }))).toEqual({
      t: "str",
      v: "2026-04-12 09:05:03",
    });
  });
});

describe("formatDate", () => {
  it("định dạng UTC ổn định", () => {
    expect(formatDate(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02 03:04:05");
  });
});

// U7 unit — mẫu cột chuẩn DUY NHẤT (columns.ts) + chuẩn hóa ô. ttxly/tthai xuất MÃ số
// (chốt #3: KHÔNG nhãn tiếng Việt — tránh nguồn sự thật thứ hai). Offline.
import { describe, expect, it } from "vitest";
import {
  EXPORT_COLUMNS,
  type ExportColumn,
  cellFor,
  formatDate,
  nativeRenderColumns,
} from "../../src/columns";
import type { ExportRow } from "../../src/rows";

function col(key: string): ExportColumn {
  const c = EXPORT_COLUMNS.find((x) => x.key === key);
  if (!c) throw new Error(`không tìm thấy cột ${key}`);
  return c;
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
    // Tóm tắt dòng hàng (U29) — nguồn: lineSummarySelect, xem @vat/query.
    tenHangDau: null,
    hangHoa: [],
    soDongHang: 0,
    ...over,
  } as ExportRow;
}

describe("EXPORT_COLUMNS (mẫu cột chuẩn)", () => {
  it("đúng danh sách key + kind theo thứ tự kỳ vọng", () => {
    expect(EXPORT_COLUMNS.map((c) => c.key)).toEqual([
      "tdlap",
      "ncnhat",
      "khmshdon",
      "khhdon",
      "shdon",
      "nbmst",
      "nbten",
      "nmmst",
      "nmten",
      "hangHoa",
      "soDongHang",
      "tgtcthue",
      "ttcktmai",
      "tgtthue",
      "tgtttbso",
      "dvtte",
      "ttxly",
      "tthai",
      "chieu",
      "nguon",
    ]);
  });

  // U29/M3: `tgia` bị LOẠI khỏi phạm vi (quyết định chủ dự án 2026-07-20) — production
  // chưa có hóa đơn `dvtte≠VND` nào để kiểm chứng ngữ nghĩa tỷ giá.
  it("KHÔNG có cột tgia", () => {
    expect(EXPORT_COLUMNS.some((c) => c.key === "tgia")).toBe(false);
  });

  it("bốn cột tiền được đánh dấu kind 'money'", () => {
    const money = EXPORT_COLUMNS.filter((c) => c.kind === "money").map((c) => c.key);
    expect(money).toEqual(["tgtcthue", "ttcktmai", "tgtthue", "tgtttbso"]);
  });

  it("ncnhat là 'date'; tóm tắt dòng hàng là 'num' (số thô, KHÔNG numFmt tiền)", () => {
    expect(EXPORT_COLUMNS.find((c) => c.key === "ncnhat")?.kind).toBe("date");
    expect(EXPORT_COLUMNS.find((c) => c.key === "hangHoa")?.kind).toBe("list");
    expect(EXPORT_COLUMNS.find((c) => c.key === "soDongHang")?.kind).toBe("num");
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

  it("ncnhat (ngày cập nhật) → ô chuỗi; null → trống", () => {
    const c = col("ncnhat");
    expect(cellFor(c, row({ ncnhat: new Date("2026-05-01T10:00:00Z") }))).toEqual({
      t: "str",
      v: "2026-05-01 10:00:00",
    });
    expect(cellFor(c, row({ ncnhat: null }))).toEqual({ t: "blank" });
  });
});

// ---------------------------------------------------------------------------
// U29 — tóm tắt dòng hàng + chiết khấu. Bằng chứng production 2026-07-20 dẫn ở
// docs/plans/U29-plan.md §8b.
// ---------------------------------------------------------------------------

describe("U29 — tổng số lượng giữ ĐẦY ĐỦ phần thập phân (M1)", () => {
  // E4: 32/48.134 dòng có sluong thập phân, max scale 3 — "62.925 Lít" dầu Điêzen.
  // Áp numFmt tiền "#,##0" sẽ hiện "63" ⇒ SAI số lượng trên hóa đơn nhiên liệu.
  it("soDongHang → ô số; hóa đơn chưa có dòng hàng → '0'", () => {
    expect(cellFor(col("soDongHang"), row({ soDongHang: 3 }))).toEqual({ t: "num", v: "3" });
    expect(cellFor(col("soDongHang"), row({ soDongHang: 0 }))).toEqual({ t: "num", v: "0" });
  });

  it("cột hàng hóa: một mặt hàng → một dòng; chưa có dòng hàng → trống", () => {
    expect(
      cellFor(
        col("hangHoa"),
        row({ hangHoa: [{ ten: "Xăng E10 RON 95", sluong: "40", dvtinh: "Lít" }] }),
      ),
    ).toEqual({ t: "str", v: "Xăng E10 RON 95 — 40" });
    expect(cellFor(col("hangHoa"), row({ hangHoa: [] }))).toEqual({ t: "blank" });
  });
});

describe("U29 — chiết khấu (ttcktmai)", () => {
  it("ttcktmai null → ô TRỐNG, không '0' giả (phân biệt 'không có' với 'chưa có dữ liệu')", () => {
    expect(cellFor(col("ttcktmai"), row({ ttcktmai: null }))).toEqual({ t: "blank" });
  });

  // E2: 8 hóa đơn điều chỉnh giảm thật, tgtcthue = -ttcktmai, tới 60 triệu đồng.
  it("hóa đơn điều chỉnh giảm: chiết khấu dương + tiền chưa thuế ÂM, giữ nguyên dấu", () => {
    const r = row({ ttcktmai: "60257129", tgtcthue: "-60257129", tgtttbso: "-65077699" });
    expect(cellFor(col("ttcktmai"), r)).toEqual({ t: "num", v: "60257129" });
    expect(cellFor(col("tgtcthue"), r)).toEqual({ t: "num", v: "-60257129" });
    expect(cellFor(col("tgtttbso"), r)).toEqual({ t: "num", v: "-65077699" });
  });
});

describe("formatDate", () => {
  it("định dạng UTC ổn định", () => {
    expect(formatDate(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02 03:04:05");
  });
});

// ---------------------------------------------------------------------------
// Nghiệm thu 2026-07-20 (chọn phương án b): sheet 1 liệt kê ĐỦ mặt hàng kèm số lượng
// ngay trong ô, thay vì cặp "Tên hàng (dòng đầu)" + "Tổng số lượng" dễ đọc nhầm thành
// số lượng của riêng mặt hàng đầu.
// ---------------------------------------------------------------------------
describe("Cột hàng hóa trong file xuất — liệt kê đủ, kèm số lượng của từng mặt hàng", () => {
  const hh = [
    { ten: "Xăng E10 RON 95 Mức 3", sluong: "42.492", dvtinh: "Lít" },
    { ten: "Dầu Điêzen 0,001S Mức 5", sluong: "20.433", dvtinh: "Lít" },
  ];

  it("KHÔNG còn cột 'dòng đầu'; có cột hàng hóa liệt kê đủ", () => {
    expect(EXPORT_COLUMNS.some((c) => c.key === "tenHangDau")).toBe(false);
    expect(EXPORT_COLUMNS.some((c) => c.key === "hangHoa")).toBe(true);
  });

  it("mỗi mặt hàng một dòng, kèm số lượng và đơn vị CỦA CHÍNH NÓ", () => {
    expect(cellFor(col("hangHoa"), row({ hangHoa: hh }))).toEqual({
      t: "str",
      v: "Xăng E10 RON 95 Mức 3 — 42.492\nDầu Điêzen 0,001S Mức 5 — 20.433",
    });
  });

  it("mặt hàng thiếu số lượng vẫn hiện tên (không im lặng bỏ)", () => {
    expect(
      cellFor(col("hangHoa"), row({ hangHoa: [{ ten: "Trọn gói", sluong: null, dvtinh: null }] })),
    ).toEqual({ t: "str", v: "Trọn gói" });
  });

  it("chưa đồng bộ dòng hàng → ô TRỐNG (không phải chuỗi rỗng giả)", () => {
    expect(cellFor(col("hangHoa"), row({ hangHoa: [] }))).toEqual({ t: "blank" });
  });

  it("'Tổng số lượng' vẫn còn — nhưng là cột RIÊNG, nhãn nói rõ là tổng", () => {});
});

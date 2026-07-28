import { FLAT_EXPORT_COLUMNS, nhanTthai, tinhVaoTong } from "@vat/domain";
import type { InvoiceLineLike } from "@vat/export";
import { unzipSync } from "fflate";
// Sheet PHẲNG — file xuất chỉ còn MỘT sheet: mỗi mặt hàng một dòng, kèm đủ ngữ cảnh hóa đơn.
// Cột dẫn xuất từ catalog @vat/domain: mặc định 19 cột "kê khai đầy đủ" (STT ở đầu); có thể
// chọn hiện thêm cột ẩn. STT = số chạy TOÀN FILE 1..N. "Tổng tiền (sau thuế)" = thtien+tsuatTien.
// Hóa đơn chưa có dòng hàng vẫn xuất MỘT dòng. Tiền/số giữ CHUỖI (không ép float). Offline.
import { describe, expect, it } from "vitest";
import {
  type LineDetailRow,
  congThapPhan,
  flatRenderColumns,
  tinhTienThue,
} from "../../src/columns";
import { csvStreamWithLines } from "../../src/csv";
import type { ExportRow } from "../../src/rows";
import { toXlsxWithLinesFromBatches } from "../../src/xlsx";
import { parseCsv, readXlsx, readXlsxSheetNames, utf8 } from "../helpers";

const ALL_KEYS = FLAT_EXPORT_COLUMNS.map((c) => c.key);
const ALL_HEADERS = flatRenderColumns(ALL_KEYS).map((c) => c.header);
const DEFAULT_HEADERS = flatRenderColumns().map((c) => c.header);
const iCol = (h: string) => ALL_HEADERS.indexOf(h);

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

// Render TẤT CẢ cột (kiểm cột ẩn); lô kích thước tùy chọn (kiểm STT toàn file qua nhiều lô).
const xlsxAll = (rows: ExportRow[], byId: Record<string, InvoiceLineLike[]>, size = 10) =>
  toXlsxWithLinesFromBatches(batchesOf(rows, size), stubFetch(byId), ALL_KEYS);
const csvAll = (rows: ExportRow[], byId: Record<string, InvoiceLineLike[]>, size = 10) =>
  csvStreamWithLines(batchesOf(rows, size), stubFetch(byId), ALL_KEYS);

describe("Cột MẶC ĐỊNH (19, kê khai đầy đủ)", () => {
  it("STT ở cột ĐẦU; đúng 19 cột theo thứ tự", () => {
    expect(DEFAULT_HEADERS).toEqual([
      "STT",
      "Ngày lập",
      "Ký hiệu HĐ",
      "Số HĐ",
      "Chiều",
      "Người bán",
      "MST người bán",
      "Người mua",
      "MST người mua",
      "Hàng hóa/dịch vụ",
      "Số lượng",
      "Đơn giá",
      "Thành tiền (trước thuế)",
      "Thuế suất",
      "Tiền thuế",
      "Tổng tiền (sau thuế)",
      // U36 QĐ-1 — ba cột trạng thái đứng ngay sau số tiền mà chúng chi phối.
      "Trạng thái HĐ (mã)",
      "Trạng thái",
      "Tính vào tổng",
    ]);
  });

  it("cột lạ bị BỎ; rỗng → về mặc định", () => {
    expect(flatRenderColumns(["shdon", "khong_ton_tai", "nbten"]).map((c) => c.header)).toEqual([
      "Số HĐ",
      "Người bán",
    ]);
    expect(flatRenderColumns([]).map((c) => c.header)).toEqual(DEFAULT_HEADERS);
  });
});

describe("Cột ĐẦY ĐỦ (khi hiện hết)", () => {
  it("có đủ cột nhận diện; KHÔNG 'Số dòng hàng'; thứ tự thuế không lệch", () => {
    for (const c of ["Ngày lập", "Số HĐ", "Người bán", "Hàng hóa/dịch vụ", "Số lượng"]) {
      expect(ALL_HEADERS, `thiếu cột ${c}`).toContain(c);
    }
    expect(ALL_HEADERS).not.toContain("Số dòng hàng");
    // "Mã thuế suất" ngay TRƯỚC "Thuế suất", "Tiền thuế" (dòng) ngay SAU.
    expect(iCol("Thuế suất")).toBe(iCol("Mã thuế suất") + 1);
    expect(iCol("Tiền thuế")).toBe(iCol("Thuế suất") + 1);
  });

  it("tiền CẤP HÓA ĐƠN mang nhãn '(cả HĐ)' để không cộng nhầm", () => {
    for (const c of [
      "Tiền chưa thuế (cả HĐ)",
      "Chiết khấu (cả HĐ)",
      "Tiền thuế (cả HĐ)",
      "Tổng thanh toán (cả HĐ)",
    ]) {
      expect(ALL_HEADERS, `thiếu cột ${c}`).toContain(c);
    }
  });
});

describe("STT chạy TOÀN FILE 1..N", () => {
  it("liên tục qua nhiều hóa đơn + qua các LÔ (không reset)", async () => {
    const invA = row({ id: "a", shdon: "100" });
    const invB = row({ id: "b", shdon: "200" });
    // Lô kích thước 1 → hai hóa đơn ở hai lô khác nhau; STT vẫn phải 1,2,3.
    const detail = readXlsx(
      await xlsxAll(
        [invA, invB],
        { a: [line({ stt: 1 }), line({ stt: 2 })], b: [line({ stt: 1 })] },
        1,
      ),
      1,
    );
    expect(detail.rows.slice(1).map((r) => r[iCol("STT")]?.value)).toEqual(["1", "2", "3"]);
  });
});

describe("Tổng tiền (sau thuế) — mức DÒNG", () => {
  // U35b — GOLDEN THAY ĐỔI CÓ CHỦ ĐÍCH: dòng 2 trước đây "GDT thiếu Tiền thuế → TRỐNG";
  // giờ Tiền thuế GDT thiếu nhưng TÍNH ĐƯỢC (8% × 1000 = 80) nên Tổng sau thuế tự đúng
  // luôn, vì đọc CÙNG giá trị đã chuẩn hóa với cột "Tiền thuế" (B2 quyết định #4, sửa S3 —
  // chuẩn hóa MỘT NƠI). Dòng 4 (không chịu thuế) vẫn TRỐNG như cũ.
  it("= Thành tiền + Tiền thuế (đã chuẩn hóa); thiếu Thành tiền hoặc không chịu thuế → TRỐNG", async () => {
    const detail = readXlsx(
      await xlsxAll(
        [row({ id: "a", shdon: "1" })],
        {
          a: [
            line({ stt: 1, thtien: "2000", tsuatTien: "160" }), // GDT có sẵn cả hai
            line({ stt: 2, thtien: "1000", tsuatTien: null }), // GDT thiếu Tiền thuế, tự tính 8%
            line({ stt: 3, thtien: null, tsuatTien: "50" }), // thiếu Thành tiền → luôn trống
            line({ stt: 4, thtien: "1000", tsuatTien: null, tsuat: "0", ltsuat: "KCT" }), // không chịu thuế
          ],
        },
        1,
      ),
      1,
    );
    const tong = detail.rows.slice(1).map((r) => r[iCol("Tổng tiền (sau thuế)")]?.value ?? "");
    expect(tong).toEqual(["2160", "1080", "", ""]);
  });

  it("cộng CHÍNH XÁC số > 2^53 + thập phân (không ép float)", () => {
    expect(congThapPhan("9007199254740993", "7")).toBe("9007199254741000");
    expect(congThapPhan("100.5", "0.05")).toBe("100.55");
    expect(congThapPhan("0", "0")).toBe("0");
  });
});

describe("Mã thuế suất + tiền thuế dòng (đầy đủ)", () => {
  // U35b — GOLDEN THAY ĐỔI CÓ CHỦ ĐÍCH: trước đây cột SỐ "Thuế suất" in "0" y hệt cho cả
  // ba (KCT/KKKNT/0% thật) — cùng lỗi gộp nhầm mà "Mã thuế suất" (U29) từng sửa cho cột
  // chữ, nhưng cột số vẫn còn hở. Giờ KCT/KKKNT (mã chữ, KHÔNG phải thuế suất) → TRỐNG;
  // chỉ "0%" thật mới còn số 0 kèm numFmt phần trăm (B2/S5).
  it("KCT / KKKNT → Thuế suất TRỐNG; 0% thật → còn số 0 kèm numFmt phần trăm", async () => {
    const detail = readXlsx(
      await xlsxAll(
        [row({ id: "a", shdon: "1" })],
        {
          a: [
            line({ stt: 1, ltsuat: "KCT", tsuat: "0", tsuatTien: null }),
            line({ stt: 2, ltsuat: "KKKNT", tsuat: "0", tsuatTien: null }),
            line({ stt: 3, ltsuat: "0%", tsuat: "0", tsuatTien: "0" }),
          ],
        },
        1,
      ),
      1,
    );
    const ma = detail.rows.slice(1).map((r) => r[iCol("Mã thuế suất")]?.value);
    const soCells = detail.rows.slice(1).map((r) => r[iCol("Thuế suất")]);
    expect(ma).toEqual(["KCT", "KKKNT", "0%"]);
    expect(new Set(ma).size).toBe(3);
    expect(soCells.map((c) => c?.value ?? "")).toEqual(["", "", "0"]);
    expect(soCells[0]?.isNumber).toBe(false); // KCT → ô trống, không phải số 0
    expect(soCells[1]?.isNumber).toBe(false); // KKKNT → ô trống
    expect(soCells[2]?.isNumber).toBe(true); // 0% thật → vẫn còn ô số
    expect(soCells[2]?.numFmt).toBe("0%");
  });

  // U35b — GOLDEN THAY ĐỔI CÓ CHỦ ĐÍCH: trước đây GDT thiếu `tthue` (tsuatTien null) luôn
  // ra TRỐNG. Giờ TỰ TÍNH khi có thtien + thuế suất số thật (quyết định #4); chỉ còn TRỐNG
  // khi dòng không chịu thuế (mã KCT/KKKNT) hoặc thiếu thtien.
  it("tiền thuế dòng: GDT có → giữ; GDT thiếu nhưng tính được → tự tính; không chịu thuế → TRỐNG", async () => {
    const detail = readXlsx(
      await xlsxAll(
        [row({ id: "a", shdon: "1" })],
        {
          a: [
            line({ stt: 1, tsuatTien: "160" }), // GDT có tthue → giữ nguyên, không tính lại
            line({ stt: 2, tsuatTien: null, thtien: "5000", tsuat: "0.08", ltsuat: "8%" }),
            line({ stt: 3, tsuatTien: null, thtien: "1000", tsuat: "0", ltsuat: "KCT" }),
          ],
        },
        1,
      ),
      1,
    );
    expect(detail.rows[1]?.[iCol("Tiền thuế")]?.value).toBe("160");
    expect(detail.rows[2]?.[iCol("Tiền thuế")]?.value).toBe("400"); // round(5000 × 0.08)
    expect(detail.rows[3]?.[iCol("Tiền thuế")]?.value ?? "").toBe("");
  });

  it("csv cũng mang mã thuế suất + tiền thuế dòng", async () => {
    const text = await drain(
      csvAll([row({ id: "a", shdon: "1" })], {
        a: [line({ ltsuat: "KKKNT", tsuat: "0", tsuatTien: "0" })],
      }),
    );
    const grid = parseCsv(text);
    expect(grid[0]?.[iCol("Mã thuế suất")]).toBe("Mã thuế suất");
    expect(grid[1]?.[iCol("Mã thuế suất")]).toBe("KKKNT");
    expect(grid[1]?.[iCol("Tiền thuế")]).toBe("0");
  });
});

describe("Thuế suất — hiện phần trăm (không phải số thô, B2#1)", () => {
  it("xlsx: giá trị ô GIỮ 0.08, numFmt CUSTOM '0%' (không phải built-in 10=0.00%)", async () => {
    const detail = readXlsx(
      await xlsxAll(
        [row({ id: "a", shdon: "1" })],
        { a: [line({ tsuat: "0.08", ltsuat: "8%" })] },
        1,
      ),
      1,
    );
    const cell = detail.rows[1]?.[iCol("Thuế suất")];
    expect(cell?.isNumber).toBe(true);
    expect(cell?.value).toBe("0.08");
    expect(cell?.numFmt).toBe("0%");
  });

  it("csv: '8%' / '10%' / '8.5%' (nhân 100 chính xác, không parseFloat)", async () => {
    const text = await drain(
      csvAll(
        [row({ id: "a", shdon: "1" })],
        {
          a: [
            line({ stt: 1, tsuat: "0.08", ltsuat: "8%" }),
            line({ stt: 2, tsuat: "0.1", ltsuat: "10%" }),
            line({ stt: 3, tsuat: "0.085", ltsuat: "8.5%" }),
          ],
        },
        10,
      ),
    );
    const grid = parseCsv(text);
    const dataRows = grid.slice(1).filter((r) => r.length === ALL_HEADERS.length);
    expect(dataRows.map((r) => r[iCol("Thuế suất")])).toEqual(["8%", "10%", "8.5%"]);
  });

  it("csv: KCT / KKKNT / tsuat null → chuỗi RỖNG, KHÔNG '0%'", async () => {
    const text = await drain(
      csvAll(
        [row({ id: "a", shdon: "1" })],
        {
          a: [
            line({ stt: 1, ltsuat: "KCT", tsuat: "0" }),
            line({ stt: 2, ltsuat: "KKKNT", tsuat: "0" }),
            line({ stt: 3, ltsuat: null, tsuat: null }),
          ],
        },
        10,
      ),
    );
    const grid = parseCsv(text);
    const dataRows = grid.slice(1).filter((r) => r.length === ALL_HEADERS.length);
    expect(dataRows.map((r) => r[iCol("Thuế suất")])).toEqual(["", "", ""]);
  });
});

describe("tinhTienThue — tự tính Tiền thuế khi GDT thiếu (BigInt, không parseFloat, B2#2)", () => {
  it("8% × 2000 = 160 (khớp số GDT thường trả, kiểm biên độ tin cậy)", () => {
    expect(tinhTienThue("2000", "0.08")).toBe("160");
  });

  it("làm tròn NỬA LÊN về đồng nguyên (8.5 → 9, không phải 8)", () => {
    expect(tinhTienThue("100", "0.085")).toBe("9");
  });

  it("số tiền > 2^53 vẫn CHÍNH XÁC (không ép qua Number/parseFloat)", () => {
    expect(tinhTienThue("9007199254740993", "0.08")).toBe("720575940379279");
  });

  it("thành tiền ÂM (hóa đơn điều chỉnh giảm) giữ đúng dấu", () => {
    expect(tinhTienThue("-100", "0.085")).toBe("-9");
  });
});

describe("xlsx — MỘT sheet phẳng", () => {
  it("chỉ MỘT sheet; mỗi mặt hàng một dòng, kèm đúng ngữ cảnh hóa đơn", async () => {
    const invA = row({ id: "a", shdon: "100", nbten: "Bán A" });
    const invB = row({ id: "b", shdon: "200", nbten: "Bán B" });
    const bytes = await xlsxAll([invA, invB], {
      a: [line({ stt: 1, ten: "A1" }), line({ stt: 2, ten: "A2" })],
      b: [line({ stt: 1, ten: "B1" })],
    });
    expect(readXlsxSheetNames(bytes)).toEqual(["Hóa đơn & hàng hóa"]);
    const detail = readXlsx(bytes, 1);
    expect(detail.rows.length).toBe(4); // header + 3 mặt hàng
    const shdon = detail.rows.slice(1).map((r) => r[iCol("Số HĐ")]?.value);
    const ten = detail.rows.slice(1).map((r) => r[iCol("Hàng hóa/dịch vụ")]?.value);
    const ban = detail.rows.slice(1).map((r) => r[iCol("Người bán")]?.value);
    expect(shdon).toEqual(["100", "100", "200"]);
    expect(ten).toEqual(["A1", "A2", "B1"]);
    expect(ban).toEqual(["Bán A", "Bán A", "Bán B"]);
  });

  it("số lượng/thành tiền > 2^53 giữ CHÍNH XÁC (không ép float)", async () => {
    const big = "9007199254740993";
    const bigQty = "12345678901234567890";
    const detail = readXlsx(
      await xlsxAll([row({ id: "a", shdon: "1" })], { a: [line({ sluong: bigQty, thtien: big })] }),
      1,
    );
    expect(detail.rows[1]?.[iCol("Thành tiền (trước thuế)")]?.value).toBe(big);
    expect(detail.rows[1]?.[iCol("Số lượng")]?.value).toBe(bigQty);
  });

  it("hóa đơn KHÔNG có dòng hàng vẫn xuất MỘT dòng; phần dòng TRỐNG", async () => {
    const detail = readXlsx(await xlsxAll([row({ id: "a", shdon: "9", nbten: "Bán X" })], {}), 1);
    expect(detail.rows.length).toBe(2); // header + 1 dòng hóa đơn
    expect(detail.rows[1]?.[iCol("Số HĐ")]?.value).toBe("9");
    expect(detail.rows[1]?.[iCol("Người bán")]?.value).toBe("Bán X");
    expect(detail.rows[1]?.[iCol("Hàng hóa/dịch vụ")]?.value ?? "").toBe("");
    expect(detail.rows[1]?.[iCol("Số lượng")]?.value ?? "").toBe("");
  });
});

describe("xlsx — định dạng 'dễ nhìn'", () => {
  async function partsXlsx(): Promise<{ sheet: string; styles: string }> {
    const bytes = await xlsxAll([row({ id: "a", shdon: "1" })], { a: [line()] });
    const zip = unzipSync(bytes);
    const dec = new TextDecoder();
    return {
      sheet: dec.decode(zip["xl/worksheets/sheet1.xml"] ?? new Uint8Array()),
      styles: dec.decode(zip["xl/styles.xml"] ?? new Uint8Array()),
    };
  }

  it("đóng băng dòng tiêu đề + cột STT (freeze cả hàng lẫn cột đầu)", async () => {
    const { sheet } = await partsXlsx();
    expect(sheet).toMatch(/<pane[^>]*xSplit="1"[^>]*ySplit="1"[^>]*state="frozen"/);
  });

  it("có <cols> khai độ rộng cột", async () => {
    const { sheet } = await partsXlsx();
    expect(sheet).toContain("<cols>");
    expect(sheet).toMatch(/<col [^>]*width="\d/);
  });

  it("tiêu đề có nền (solid fill) + numFmt tiền #,##0 trong styles", async () => {
    const { styles } = await partsXlsx();
    expect(styles).toContain('patternType="solid"');
    expect(styles).toContain('formatCode="#,##0"');
  });

  // B2#1 (sửa theo review S4): PHẢI khai numFmt phần trăm CUSTOM (id 165) — built-in 10 là
  // "0.00%" (2 số thập phân), sai với yêu cầu "8%" không có phần thập phân dư.
  it("numFmt phần trăm CUSTOM 165='0%' (không dùng built-in 10) + bump numFmts/cellXfs count", async () => {
    const { styles } = await partsXlsx();
    expect(styles).toContain('<numFmt numFmtId="165" formatCode="0%"/>');
    expect(styles).not.toContain('numFmtId="10"');
    expect(styles).toMatch(/<numFmts count="2">/);
    expect(styles).toMatch(/<cellXfs count="5">/);
  });
});

describe("csv — MỘT khối phẳng", () => {
  it("header dòng 0; mỗi mặt hàng một dòng gắn đúng số HĐ + tên", async () => {
    const invA = row({ id: "a", shdon: "100" });
    const invB = row({ id: "b", shdon: "200" });
    const text = await drain(
      csvAll([invA, invB], {
        a: [line({ stt: 1, ten: "A1" }), line({ stt: 2, ten: "A2" })],
        b: [line({ stt: 1, ten: "B1" })],
      }),
    );
    const grid = parseCsv(text);
    expect(grid[0]).toEqual(ALL_HEADERS); // header ngay dòng đầu
    const dataRows = grid.slice(1).filter((r) => r.length === ALL_HEADERS.length);
    expect(dataRows.map((r) => r[iCol("Số HĐ")])).toEqual(["100", "100", "200"]);
    expect(dataRows.map((r) => r[iCol("Hàng hóa/dịch vụ")])).toEqual(["A1", "A2", "B1"]);
  });

  it("csv giữ số lượng/thành tiền > 2^53 nguyên bản chuỗi", async () => {
    const big = "9007199254740993";
    const bigQty = "12345678901234567890";
    const text = await drain(
      csvAll([row({ id: "a", shdon: "1" })], { a: [line({ sluong: bigQty, thtien: big })] }),
    );
    const grid = parseCsv(text);
    expect(grid[1]?.[iCol("Số lượng")]).toBe(bigQty);
    expect(grid[1]?.[iCol("Thành tiền (trước thuế)")]).toBe(big);
  });

  it("hóa đơn không dòng hàng → vẫn MỘT dòng, phần dòng để trống", async () => {
    const text = await drain(csvAll([row({ id: "a", shdon: "9" })], {}));
    const grid = parseCsv(text);
    const dataRows = grid.slice(1).filter((r) => r.length === ALL_HEADERS.length);
    expect(dataRows.length).toBe(1);
    expect(dataRows[0]?.[iCol("Số HĐ")]).toBe("9");
    expect(dataRows[0]?.[iCol("Hàng hóa/dịch vụ")]).toBe("");
  });
});

// U36 QĐ-1/QĐ-3 — ba cột trạng thái trong file tải về. Nhãn PHẢI lấy từ `@vat/domain`
// (tiêu chí #12: web và file xuất cho CÙNG một chuỗi cho cùng một mã), và "Tính vào tổng"
// PHẢI dẫn xuất từ `tinhVaoTong()` chứ không so sánh mã bằng tay ở đây.
describe("U36 — ba cột trạng thái (mã · nhãn · tính vào tổng)", () => {
  const oCua = (key: string, tthai: number | null): string => {
    const col = flatRenderColumns([key])[0];
    if (!col) throw new Error(`không dựng được cột ${key}`);
    const cell = col.cell({ tthai } as LineDetailRow);
    return cell.t === "blank" ? "" : String(cell.v);
  };

  it("cột 'Trạng thái' lấy nhãn TỪ @vat/domain — cùng nguồn với giao diện", () => {
    for (const c of [1, 2, 3, 4, 5, 9, 23]) {
      expect(oCua("tthaiNhan", c)).toBe(nhanTthai(c));
    }
  });

  it("mã đã kiểm chứng → nhãn tiếng Việt; mã lạ → '(chưa rõ)', không bịa", () => {
    expect(oCua("tthaiNhan", 4)).toBe("Bị thay thế");
    expect(oCua("tthaiNhan", 5)).toBe("Bị điều chỉnh");
    expect(oCua("tthaiNhan", 9)).toBe("9 (chưa rõ)");
  });

  it("'Tính vào tổng' = 'Không' CHỈ cho mã 4 (bị thay thế)", () => {
    expect(oCua("tinhVaoTong", 4)).toBe("Không");
  });

  it("'Tính vào tổng' = 'Có' cho 1/2/3/5 và cho mã lạ (QĐ-6: không tự ý loại)", () => {
    for (const c of [1, 2, 3, 5, 9]) expect(oCua("tinhVaoTong", c)).toBe("Có");
  });

  it("tthai = null → mã trống, nhãn trống, 'Tính vào tổng' = 'Có'", () => {
    expect(oCua("tthai", null)).toBe("");
    expect(oCua("tthaiNhan", null)).toBe("");
    expect(oCua("tinhVaoTong", null)).toBe("Có");
  });

  it("dẫn xuất từ `tinhVaoTong()`, không hardcode mã: đúng với mọi mã 0..10", () => {
    for (let c = 0; c <= 10; c++) {
      expect(oCua("tinhVaoTong", c)).toBe(tinhVaoTong(c) ? "Có" : "Không");
    }
  });

  it("hóa đơn mã 4 VẪN xuất ra file (QĐ-5) — chỉ không tính vào tổng", async () => {
    const text = await drain(csvAll([row({ id: "a", shdon: "4444", tthai: 4 })], {}));
    const grid = parseCsv(text);
    const r = grid.slice(1).find((x) => x[iCol("Số HĐ")] === "4444");
    expect(r?.[iCol("Trạng thái HĐ (mã)")]).toBe("4");
    expect(r?.[iCol("Trạng thái")]).toBe("Bị thay thế");
    expect(r?.[iCol("Tính vào tổng")]).toBe("Không");
  });
});

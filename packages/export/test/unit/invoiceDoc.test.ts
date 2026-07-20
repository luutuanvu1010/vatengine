// U22 unit — render một hóa đơn (header EXPORT_COLUMNS + dòng hàng) sang XML/HTML tự
// dựng để đóng gói xml.zip/html.zip. Escape ký tự đặc biệt (chống phá cấu trúc file khi
// tên người bán/mua chứa "&", "<", ">" — dữ liệu từ GDT, bên thứ ba, không tin cậy).
import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS } from "../../src/columns";
import { invoiceFileStem, invoiceToHtml, invoiceToXml } from "../../src/invoiceDoc";
import type { ExportRow } from "../../src/rows";

type Line = {
  stt: number | null;
  ten: string | null;
  dvtinh: string | null;
  sluong: string | null;
  dgia: string | null;
  thtien: string | null;
  ltsuat: string | null;
  tsuat: string | null;
  tsuatTien: string | null;
};

function makeRow(over: Partial<ExportRow> = {}): ExportRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "t1",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon: "1",
    nbmst: "0100000001",
    nbten: "Công ty Bán & Con",
    nmmst: "0100000002",
    nmten: "Công ty Mua",
    tdlap: new Date("2026-04-12T09:00:00Z"),
    tgtcthue: "1000000",
    tgtthue: "80000",
    tgtttbso: "1080000",
    dvtte: "VND",
    ttxly: 8,
    tthai: 1,
    chieu: "purchase",
    nguon: "normal",
    rawJson: {},
    ...over,
  } as ExportRow;
}

function makeLine(over: Partial<Line> = {}): Line {
  return {
    stt: 1,
    ten: "Hàng hóa <A>",
    dvtinh: "cái",
    sluong: "10",
    dgia: "100000",
    thtien: "1000000",
    ltsuat: "8%",
    tsuat: "0.08",
    tsuatTien: "80000",
    ...over,
  };
}

describe("invoiceToXml", () => {
  it("sinh XML hợp lệ, chứa trường header + dòng hàng, escape ký tự đặc biệt", () => {
    const xml = invoiceToXml(makeRow(), [makeLine()]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<HoaDon>");
    expect(xml).toContain("<shdon>1</shdon>");
    expect(xml).toContain("Công ty Bán &amp; Con");
    expect(xml).toContain("<DongHangHoa>");
    expect(xml).toContain("Hàng hóa &lt;A&gt;");
    expect(xml).toContain("<thtien>1000000</thtien>");
  });

  it("hóa đơn không dòng hàng → <DongHangHoa/> rỗng, vẫn hợp lệ", () => {
    const xml = invoiceToXml(makeRow(), []);
    expect(xml).toMatch(/<DongHangHoa\s*\/>|<DongHangHoa><\/DongHangHoa>/);
  });
});

describe("invoiceToHtml", () => {
  it("sinh HTML chứa bảng header + bảng dòng hàng, escape ký tự đặc biệt", () => {
    const html = invoiceToHtml(makeRow(), [makeLine()]);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("1080000");
    expect(html).toContain("Công ty Bán &amp; Con");
    expect(html).toContain("Hàng hóa &lt;A&gt;");
  });
});

describe("invoiceFileStem", () => {
  it("dựng tên file từ khhdon + shdon", () => {
    expect(invoiceFileStem(makeRow())).toBe("C26TAA-1");
  });

  it("loại ký tự không hợp lệ trong tên file (vd '/')", () => {
    expect(invoiceFileStem(makeRow({ khhdon: "C26/TAA", shdon: "1/2" }))).toBe("C26_TAA-1_2");
  });
});

// ---------------------------------------------------------------------------
// T11 (U29 §4) — xml/html phải mang ĐỦ cột sau khi EXPORT_COLUMNS nở 16 → 21.
// Vì sao cần canh riêng: invoiceToXml/invoiceToHtml lặp EXPORT_COLUMNS ĐỘNG, nên
// chúng "tự xanh" khi thêm cột — test cũ vẫn qua mà không chứng minh gì về cột mới.
// Ca dưới đây canh cả tính ĐỦ (mọi key có thẻ) lẫn GIÁ TRỊ thật của 5 cột U29.
// ---------------------------------------------------------------------------
describe("T11 — xml/html phủ đủ EXPORT_COLUMNS sau khi mở rộng (U29)", () => {
  const row = makeRow({
    ncnhat: new Date("2026-05-01T10:00:00Z"),
    ttcktmai: "60257129",
    tenHangDau: "Xăng E10 RON 95",
    soDongHang: 3,
    tongSoLuong: "62.925",
  });

  it("xml có thẻ cho MỌI cột trong EXPORT_COLUMNS (không sót cột nào)", () => {
    const xml = invoiceToXml(row, []);
    for (const col of EXPORT_COLUMNS) {
      expect(xml, `thiếu thẻ <${col.key}>`).toContain(`<${col.key}>`);
    }
    expect(EXPORT_COLUMNS.length).toBe(21);
  });

  it("xml mang đúng GIÁ TRỊ của 5 cột U29 (không phải thẻ rỗng)", () => {
    const xml = invoiceToXml(row, []);
    expect(xml).toContain("<ncnhat>2026-05-01 10:00:00</ncnhat>");
    expect(xml).toContain("<ttcktmai>60257129</ttcktmai>");
    expect(xml).toContain("<tenHangDau>Xăng E10 RON 95</tenHangDau>");
    expect(xml).toContain("<soDongHang>3</soDongHang>");
    // Giữ đủ phần thập phân (M1) — không làm tròn thành 63.
    expect(xml).toContain("<tongSoLuong>62.925</tongSoLuong>");
  });

  it("xml KHÔNG có thẻ tgia (M3 — đã loại khỏi phạm vi)", () => {
    expect(invoiceToXml(row, [])).not.toContain("<tgia>");
  });

  it("html có nhãn + giá trị của 5 cột U29", () => {
    const html = invoiceToHtml(row, []);
    for (const col of EXPORT_COLUMNS) {
      expect(html, `thiếu nhãn ${col.label}`).toContain(`<th>${col.label}</th>`);
    }
    expect(html).toContain("<td>60257129</td>");
    expect(html).toContain("<td>62.925</td>");
    expect(html).toContain("<td>Xăng E10 RON 95</td>");
  });
});

// ---------------------------------------------------------------------------
// LỖI LỆCH CỘT (phát hiện khi nghiệm thu 2026-07-20): bảng dòng hàng trong HTML có
// header VIẾT CỨNG 8 cột trong khi dữ liệu sinh từ LINE_FIELDS (9 trường) → mọi ô từ
// `ltsuat` trở đi nằm dưới sai tiêu đề, và `tsuatTien` không có tiêu đề nào.
// Gốc rễ: HAI NGUỒN SỰ THẬT cho cùng một danh sách cột.
// ---------------------------------------------------------------------------
describe("invoiceToHtml — bảng dòng hàng không được lệch cột", () => {
  const line = {
    stt: 1,
    ten: "Xăng E10 RON 95",
    dvtinh: "Lít",
    sluong: "42.492",
    dgia: "1000",
    thtien: "42492",
    ltsuat: "KCT",
    tsuat: "0",
    tsuatTien: "0",
  };

  const oCua = (html: string, tag: "th" | "td", bang: number) => {
    const bangs = html.match(/<table>[\s\S]*?<\/table>/g) ?? [];
    const b = bangs[bang] ?? "";
    return [...b.matchAll(new RegExp(`<${tag}>(.*?)</${tag}>`, "g"))].map((m) => m[1]);
  };

  it("số TIÊU ĐỀ khớp số Ô DỮ LIỆU của một dòng hàng", () => {
    const html = invoiceToHtml(makeRow(), [line]);
    expect(oCua(html, "th", 1).length).toBe(oCua(html, "td", 1).length);
  });

  it("giá trị nằm ĐÚNG dưới tiêu đề của nó (mã thuế suất không chui vào cột thuế suất)", () => {
    const html = invoiceToHtml(makeRow(), [line]);
    const th = oCua(html, "th", 1);
    const td = oCua(html, "td", 1);
    const tai = (nhan: string) => td[th.indexOf(nhan)];
    expect(tai("Tên")).toBe("Xăng E10 RON 95");
    expect(tai("Mã thuế suất")).toBe("KCT");
    expect(tai("Thuế suất")).toBe("0");
    expect(tai("Tiền thuế")).toBe("0");
  });
});

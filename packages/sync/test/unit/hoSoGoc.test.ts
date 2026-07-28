import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  TEN_TEP_HTML,
  TEN_TEP_XML,
  TEP_TINH_DUNG_CHUNG,
  buildHoSoGocMessages,
  isHoSoGocMessage,
  tachHoSoGoc,
} from "../../src/hoSoGoc";

const enc = new TextEncoder();

/**
 * Dựng ZIP đúng hình dạng GDT TRẢ THẬT (đo 2026-07-28, U37 §4.7): 5 file, trong đó 3
 * file tĩnh giống hệt nhau ở mọi hóa đơn và chiếm ~86% dung lượng.
 */
function zipGdt(over: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    "details.js": enc.encode("/*! jQuery v1.8.2 */"),
    "viewinvoice-bg.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    "sign-check.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]),
    "invoice.xml": enc.encode(
      "<HDon><DLHDon><TTChung><PBan>2.1.0</PBan></TTChung></DLHDon></HDon>",
    ),
    "invoice.html": enc.encode('<html><script src="details.js"></script></html>'),
    ...over,
  });
}

describe("tachHoSoGoc — tách gói ZIP của GDT", () => {
  it("lấy đúng invoice.xml và invoice.html, giữ NGUYÊN byte", () => {
    const ket_qua = tachHoSoGoc(zipGdt());

    expect(new TextDecoder().decode(ket_qua.xml)).toContain("<PBan>2.1.0</PBan>");
    expect(new TextDecoder().decode(ket_qua.html)).toContain('src="details.js"');
  });

  it("tách RIÊNG 3 tài nguyên tĩnh dùng chung — nền của việc khử trùng lặp 86% dung lượng", () => {
    const ket_qua = tachHoSoGoc(zipGdt());

    expect(Object.keys(ket_qua.taiNguyenChung).sort()).toEqual([...TEP_TINH_DUNG_CHUNG].sort());
    expect(ket_qua.taiNguyenChung["details.js"]).toBeInstanceOf(Uint8Array);
  });

  it("KHÔNG nhét tài nguyên tĩnh vào phần theo-hóa-đơn (nếu lẫn, kho R2 phình 7,5 lần)", () => {
    const ket_qua = tachHoSoGoc(zipGdt());

    // Chỉ hai file được coi là "của riêng hóa đơn này".
    expect(Object.keys(ket_qua).sort()).toEqual(["html", "taiNguyenChung", "xml"]);
  });

  it("thiếu invoice.xml → NÉM (GDT đổi định dạng), không trả rỗng im lặng", () => {
    const zip = zipSync({
      "details.js": enc.encode("x"),
      "invoice.html": enc.encode("<html></html>"),
    });
    expect(() => tachHoSoGoc(zip)).toThrow(/invoice\.xml/);
  });

  it("thiếu invoice.html → NÉM (mất bản thể hiện xem-bằng-mắt)", () => {
    const zip = zipSync({
      "details.js": enc.encode("x"),
      "invoice.xml": enc.encode("<HDon/>"),
    });
    expect(() => tachHoSoGoc(zip)).toThrow(/invoice\.html/);
  });

  it("byte không phải ZIP → NÉM, không nuốt", () => {
    expect(() => tachHoSoGoc(enc.encode("day khong phai zip"))).toThrow();
  });

  it("GDT thêm file lạ → vẫn tách được, file lạ bị bỏ qua (không ném)", () => {
    const zip = zipGdt({ "readme.txt": enc.encode("thu gi do moi") });
    const ket_qua = tachHoSoGoc(zip);

    expect(ket_qua.xml.length).toBeGreaterThan(0);
    // File lạ KHÔNG được lẫn vào tài nguyên dùng chung — danh sách đó là allowlist cố định.
    expect(Object.keys(ket_qua.taiNguyenChung)).not.toContain("readme.txt");
  });

  it("thiếu MỘT tài nguyên tĩnh → không ném (bản thể hiện vẫn mở được, chỉ xấu đi)", () => {
    const zip = zipSync({
      "invoice.xml": enc.encode("<HDon/>"),
      "invoice.html": enc.encode("<html></html>"),
      "details.js": enc.encode("x"),
    });
    const ket_qua = tachHoSoGoc(zip);

    expect(Object.keys(ket_qua.taiNguyenChung)).toEqual(["details.js"]);
  });

  it("hằng tên tệp khớp đúng những gì GDT trả (canh khi GDT đổi)", () => {
    expect(TEN_TEP_XML).toBe("invoice.xml");
    expect(TEN_TEP_HTML).toBe("invoice.html");
    expect(TEP_TINH_DUNG_CHUNG).toEqual(["details.js", "viewinvoice-bg.jpg", "sign-check.jpg"]);
  });
});

describe("HoSoGocMessage — contract message hàng đợi", () => {
  const REF = {
    nbmst: "0100000001",
    khhdon: "C26TQO",
    khmshdon: "1",
    shdon: "13580",
    source: "normal" as const,
  };

  it("buildHoSoGocMessages: một message / hóa đơn, tenantId TƯỜNG MINH trong payload", () => {
    const msgs = buildHoSoGocMessages({ tenantId: "t1", taikhoanId: "tk1" }, [
      { hoaDonId: "hd1", ref: REF },
      { hoaDonId: "hd2", ref: { ...REF, source: "sco" } },
    ]);

    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({
      kind: "hoso",
      tenantId: "t1",
      taikhoanId: "tk1",
      hoaDonId: "hd1",
      ref: REF,
    });
    expect(msgs[1]?.ref.source).toBe("sco");
  });

  it("isHoSoGocMessage nhận đúng message của mình", () => {
    const [msg] = buildHoSoGocMessages({ tenantId: "t1", taikhoanId: "tk1" }, [
      { hoaDonId: "hd1", ref: REF },
    ]);
    expect(isHoSoGocMessage(msg)).toBe(true);
  });

  it("KHÔNG nhận nhầm message của loại khác đi cùng queue vat-sync", () => {
    // Cùng hàng đợi còn chở: header (không `kind`), detail, audit, delta.
    expect(isHoSoGocMessage({ kind: "detail", tenantId: "t1" })).toBe(false);
    expect(isHoSoGocMessage({ kind: "audit", tenantId: "t1" })).toBe(false);
    expect(isHoSoGocMessage({ kind: "delta", tenantId: "t1" })).toBe(false);
    expect(isHoSoGocMessage({ tenantId: "t1", direction: "purchase" })).toBe(false);
    expect(isHoSoGocMessage(null)).toBe(false);
    expect(isHoSoGocMessage("hoso")).toBe(false);
  });
});

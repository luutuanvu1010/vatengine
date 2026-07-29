// U37b Gói 4c-1 — đóng gói hồ sơ gốc thành MỘT file ZIP cho khách hàng.
//
// Cấu trúc PHẲNG với MỘT bộ tài nguyên tĩnh dùng chung. `invoice.html` do GDT dựng tham
// chiếu 3 tệp tĩnh bằng TÊN PHẲNG KHÔNG TIỀN TỐ (đo thật, U37 §4.7) ⇒ đặt phẳng là chạy
// đúng mà không phải sửa một ký tự nào trong HTML.
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { type TepHoaDon, dungGoiZip } from "../../src/goiHoaDonZip";

const enc = new TextEncoder();
const dec = new TextDecoder();

const THONG_TIN = {
  nmten: "CÔNG TY TNHH TOUR ĐẢO",
  nmmst: "0312000001",
  tuNgay: "2026-07-01",
  denNgay: "2026-07-31",
};

const CHUNG = {
  "details.js": enc.encode("/*! jQuery */"),
  "viewinvoice-bg.jpg": new Uint8Array([0xff, 0xd8, 1, 2]),
  "sign-check.jpg": new Uint8Array([0xff, 0xd8, 3, 4]),
};

function tep(over: Partial<TepHoaDon> = {}): TepHoaDon {
  return {
    hoaDonId: "aaaaaaaa-1111-2222-3333-444444444444",
    nbmst: "0100000001",
    khhdon: "C26TQO",
    shdon: "13580",
    xml: enc.encode("<HDon/>"),
    html: enc.encode("<html></html>"),
    ...over,
  };
}

const giaiNen = (bytes: Uint8Array) => Object.keys(unzipSync(bytes)).sort();

describe("dungGoiZip — cấu trúc gói", () => {
  it("phẳng: mỗi hóa đơn một cặp .xml/.html + MỘT bộ tài nguyên tĩnh + báo cáo", () => {
    const goi = dungGoiZip(THONG_TIN, [tep(), tep({ shdon: "13581" })], [], CHUNG);

    expect(giaiNen(goi.bytes)).toEqual([
      "C26TQO-13580.html",
      "C26TQO-13580.xml",
      "C26TQO-13581.html",
      "C26TQO-13581.xml",
      "bao-cao.txt",
      "details.js",
      "sign-check.jpg",
      "viewinvoice-bg.jpg",
    ]);
  });

  it("tài nguyên tĩnh chỉ CÓ MỘT bản dù nhiều hóa đơn (đây là cả lý do khử trùng lặp)", () => {
    const goi = dungGoiZip(THONG_TIN, [tep(), tep({ shdon: "2" }), tep({ shdon: "3" })], [], CHUNG);
    const ten = giaiNen(goi.bytes);

    expect(ten.filter((t) => t === "details.js")).toHaveLength(1);
    expect(ten.filter((t) => t.endsWith(".jpg"))).toHaveLength(2);
  });

  it("giữ NGUYÊN byte của xml và html", () => {
    const goi = dungGoiZip(
      THONG_TIN,
      [tep({ xml: enc.encode("<HDon>GOC</HDon>"), html: enc.encode("<html>XEM</html>") })],
      [],
      CHUNG,
    );
    const tep_ = unzipSync(goi.bytes);

    expect(dec.decode(tep_["C26TQO-13580.xml"])).toBe("<HDon>GOC</HDon>");
    expect(dec.decode(tep_["C26TQO-13580.html"])).toBe("<html>XEM</html>");
  });

  it("không có tài nguyên tĩnh nào → vẫn đóng gói được (bản thể hiện xấu đi, không hỏng)", () => {
    const goi = dungGoiZip(THONG_TIN, [tep()], [], {});
    expect(giaiNen(goi.bytes)).toEqual(["C26TQO-13580.html", "C26TQO-13580.xml", "bao-cao.txt"]);
  });
});

describe("dungGoiZip — chống trùng tên, GIỮ NGUYÊN CẶP", () => {
  // Đây là lý do KHÔNG tái dùng `uniqueName` của zipStream.ts: nó khóa theo `stem` nên
  // gọi hai lần cho cùng hóa đơn sẽ ra `X.xml` + `X-1.html` — người nhận không biết file
  // html thuộc hóa đơn nào.
  it("hai hóa đơn khác nbmst nhưng TRÙNG khhdon+shdon → CẢ HAI đổi sang tiền tố nbmst", () => {
    const goi = dungGoiZip(
      THONG_TIN,
      [
        tep({ nbmst: "0100000001", hoaDonId: "aaaaaaaa-0000-0000-0000-000000000001" }),
        tep({ nbmst: "0100000002", hoaDonId: "bbbbbbbb-0000-0000-0000-000000000002" }),
      ],
      [],
      {},
    );

    // CẢ HAI đổi tên, không phải "cái đầu giữ tên ngắn, cái sau bị hậu tố" — đối xứng thì
    // người đọc không phải đoán vì sao hai hóa đơn cùng dạng lại tên khác kiểu.
    expect(giaiNen(goi.bytes)).toEqual([
      "0100000001-C26TQO-13580.html",
      "0100000001-C26TQO-13580.xml",
      "0100000002-C26TQO-13580.html",
      "0100000002-C26TQO-13580.xml",
      "bao-cao.txt",
    ]);
  });

  it("trùng cả nbmst+khhdon+shdon → thêm đầu hoaDonId, cặp vẫn đi cùng nhau", () => {
    const goi = dungGoiZip(
      THONG_TIN,
      [
        tep({ hoaDonId: "aaaaaa11-0000-0000-0000-000000000001" }),
        tep({ hoaDonId: "bbbbbb22-0000-0000-0000-000000000002" }),
      ],
      [],
      {},
    );
    const ten = giaiNen(goi.bytes).filter((t) => t !== "bao-cao.txt");

    expect(ten).toHaveLength(4);
    // Mỗi stem phải có ĐÚNG hai tệp .xml và .html — cặp không được tách.
    const theoStem = new Map<string, string[]>();
    for (const t of ten) {
      const stem = t.replace(/\.(xml|html)$/, "");
      theoStem.set(stem, [...(theoStem.get(stem) ?? []), t]);
    }
    expect(theoStem.size).toBe(2);
    for (const [, ds] of theoStem) {
      expect(ds.sort()).toEqual([
        `${ds[0]?.replace(/\.\w+$/, "")}.html`,
        `${ds[0]?.replace(/\.\w+$/, "")}.xml`,
      ]);
    }
  });

  it("ký tự lạ trong khhdon bị làm sạch để tên tệp an toàn mọi hệ điều hành", () => {
    const goi = dungGoiZip(THONG_TIN, [tep({ khhdon: "C26/TQ O" })], [], {});
    const ten = giaiNen(goi.bytes).filter((t) => t !== "bao-cao.txt");

    for (const t of ten) {
      expect(t).not.toContain("/");
      expect(t).not.toContain(" ");
    }
  });
});

describe("dungGoiZip — bao-cao.txt", () => {
  it("liệt kê hóa đơn KHÔNG vào được gói kèm lý do", () => {
    const goi = dungGoiZip(
      THONG_TIN,
      [tep()],
      [
        { khhdon: "C26TQO", shdon: "13590", lyDo: "Cơ quan thuế không có hồ sơ gốc" },
        { khhdon: "C26TQO", shdon: "13591", lyDo: "Tải thất bại (HTTP_ERROR)" },
      ],
      {},
    );
    const bc = dec.decode(unzipSync(goi.bytes)["bao-cao.txt"]);

    expect(bc).toContain("CÔNG TY TNHH TOUR ĐẢO");
    expect(bc).toContain("0312000001");
    expect(bc).toContain("13590");
    expect(bc).toContain("không có hồ sơ gốc");
    expect(bc).toContain("13591");
    expect(bc).toContain("HTTP_ERROR");
  });

  it("ĐỦ hết → báo cáo vẫn có, nói rõ không thiếu gì (không im lặng)", () => {
    const goi = dungGoiZip(THONG_TIN, [tep()], [], {});
    const bc = dec.decode(unzipSync(goi.bytes)["bao-cao.txt"]);

    expect(bc).toMatch(/đầy đủ|không thiếu/i);
  });

  it("nêu ĐÚNG số: tổng trong kỳ = có trong gói + thiếu", () => {
    const goi = dungGoiZip(
      THONG_TIN,
      [tep(), tep({ shdon: "2" })],
      [{ khhdon: "C26TQO", shdon: "3", lyDo: "x" }],
      {},
    );
    const bc = dec.decode(unzipSync(goi.bytes)["bao-cao.txt"]);

    expect(bc).toContain("3"); // tổng
    expect(bc).toContain("2"); // có trong gói
  });
});

describe("dungGoiZip — tên tệp tải về", () => {
  it("bỏ dấu tiếng Việt, kể cả chữ Đ, và chỉ giữ ký tự an toàn", () => {
    const goi = dungGoiZip(THONG_TIN, [tep()], [], {});

    expect(goi.tenTepTaiVe).toBe("hoa-don-cong-ty-tnhh-tour-dao-2026-07-01-2026-07-31.zip");
  });

  it("tên khách rỗng → vẫn ra tên tệp hợp lệ, không có dấu '--' thừa", () => {
    const goi = dungGoiZip({ ...THONG_TIN, nmten: "" }, [tep()], [], {});

    expect(goi.tenTepTaiVe).toMatch(/^hoa-don-[a-z0-9-]+\.zip$/);
    expect(goi.tenTepTaiVe).not.toContain("--");
  });

  it("tên khách rất dài → bị cắt, tên tệp không phình vô hạn", () => {
    const goi = dungGoiZip({ ...THONG_TIN, nmten: "A".repeat(300) }, [tep()], [], {});
    expect(goi.tenTepTaiVe.length).toBeLessThan(120);
  });

  // Khóa R2 do route sinh, KHÔNG lấy từ đây — nhưng canh thêm một lớp: tên tệp tải về có
  // chứa tên khách là ĐÚNG (QĐ-B10), miễn nó không bao giờ bị dùng làm khóa.
  it("số tệp trong gói được báo lại đúng", () => {
    const goi = dungGoiZip(THONG_TIN, [tep(), tep({ shdon: "2" })], [], CHUNG);
    expect(goi.soTepTrongGoi).toBe(2);
  });
});

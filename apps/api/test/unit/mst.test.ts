// Dạng MST và chuẩn hóa (lib/mst) — thuần, không DB.
import { describe, expect, it } from "vitest";
import { MST_RE, chuanHoaMst } from "../../src/lib/mst";

describe("lib/mst", () => {
  it.each(["0100000001", "0305097236-005", "0305097236005", "001199012345"])(
    "MST_RE nhận %s",
    (m) => expect(MST_RE.test(m)).toBe(true),
  );

  it.each(["", "123", "0305097236-05", "0305097236-", "03050972-36005", "010000009A"])(
    "MST_RE từ chối %s",
    (m) => expect(MST_RE.test(m)).toBe(false),
  );

  it("chuanHoaMst bỏ gạch của dạng đơn vị phụ thuộc, giữ nguyên các dạng khác", () => {
    expect(chuanHoaMst("0305097236-005")).toBe("0305097236005");
    expect(chuanHoaMst("  0305097236-005 ")).toBe("0305097236005");
    expect(chuanHoaMst("0100000001")).toBe("0100000001");
    expect(chuanHoaMst("0305097236005")).toBe("0305097236005");
    // Chuỗi sai dạng KHÔNG bị "sửa giúp" — validate vẫn phải từ chối nó.
    expect(chuanHoaMst("0305097236-05")).toBe("0305097236-05");
  });
});

import { boDau, khopTim } from "@vat/domain";
import { describe, expect, it } from "vitest";

describe("boDau — chuẩn hóa chuỗi để tìm kiếm", () => {
  it("bỏ dấu thanh và dấu mũ tiếng Việt", () => {
    expect(boDau("CÔNG TY TNHH")).toBe("cong ty tnhh");
    expect(boDau("Nguyễn Thị Đức")).toBe("nguyen thi duc");
    expect(boDau("Khánh Hòa")).toBe("khanh hoa");
  });

  it("xử lý đ/Đ — chữ KHÔNG tách được bằng NFD, phải thay tường minh", () => {
    // "Đ" (U+0110) không phân rã qua normalize("NFD") như "Ô" → nếu chỉ dùng NFD thì
    // gõ "dao" sẽ không ra "ĐẢO", tức mất luôn khách hàng tên có chữ Đ.
    expect(boDau("TOUR ĐẢO")).toBe("tour dao");
    expect(boDau("đường")).toBe("duong");
  });

  it("hạ chữ thường và gom khoảng trắng thừa", () => {
    expect(boDau("  CÔNG   TY  ")).toBe("cong ty");
  });

  it("chuỗi rỗng/khoảng trắng → rỗng, không ném", () => {
    expect(boDau("")).toBe("");
    expect(boDau("   ")).toBe("");
  });

  it("giữ nguyên chữ số (MST phải tìm được)", () => {
    expect(boDau("0312000001")).toBe("0312000001");
  });
});

describe("khopTim — người dùng gõ có khớp mục này không", () => {
  it("gõ KHÔNG dấu vẫn ra mục CÓ dấu", () => {
    expect(khopTim("cong ty", "CÔNG TY TNHH ABC")).toBe(true);
  });

  it("gõ CÓ dấu vẫn khớp", () => {
    expect(khopTim("công ty", "CÔNG TY TNHH ABC")).toBe(true);
  });

  it("khớp ở GIỮA chuỗi, không chỉ đầu chuỗi", () => {
    expect(khopTim("tnhh", "CÔNG TY TNHH ABC")).toBe(true);
  });

  it("gõ rỗng → khớp mọi mục (hiện cả danh sách)", () => {
    expect(khopTim("", "bất kỳ")).toBe(true);
  });

  it("không khớp thì trả false", () => {
    expect(khopTim("xyz", "CÔNG TY TNHH ABC")).toBe(false);
  });
});

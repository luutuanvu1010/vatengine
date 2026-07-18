// U17a — Kẹp biên giá trị cấu hình đến từ DB (QĐ-5). Giá trị do Admin nhập KHÔNG được
// tin: quá nhỏ → khóa sạch khách; quá lớn → vô hiệu hóa chống lạm dụng; rác → phải rơi
// về mặc định thay vì NaN lan xuống limiter.
import { describe, expect, it } from "vitest";
import { clampInt, clampNumber } from "../../src/configClamp";

describe("clampInt", () => {
  it("giá trị trong biên → giữ nguyên", () => {
    expect(clampInt("120", 1, 1000, 60)).toBe(120);
    expect(clampInt(120, 1, 1000, 60)).toBe(120);
  });

  it("dưới biên → kẹp về min (không để 0 khóa sạch khách)", () => {
    expect(clampInt("0", 1, 1000, 60)).toBe(1);
    expect(clampInt("-5", 1, 1000, 60)).toBe(1);
  });

  it("trên biên → kẹp về max (không để vô hiệu hóa chống lạm dụng)", () => {
    expect(clampInt("999999", 1, 1000, 60)).toBe(1000);
  });

  it("số thập phân → làm tròn", () => {
    expect(clampInt("120.4", 1, 1000, 60)).toBe(120);
    expect(clampInt("120.6", 1, 1000, 60)).toBe(121);
  });

  it("rác / rỗng / thiếu → rơi về fallback, KHÔNG trả NaN", () => {
    expect(clampInt("abc", 1, 1000, 60)).toBe(60);
    expect(clampInt("", 1, 1000, 60)).toBe(60);
    expect(clampInt(undefined, 1, 1000, 60)).toBe(60);
    expect(clampInt(null, 1, 1000, 60)).toBe(60);
    expect(clampInt(Number.NaN, 1, 1000, 60)).toBe(60);
    expect(clampInt(Number.POSITIVE_INFINITY, 1, 1000, 60)).toBe(60);
  });

  it("fallback nằm ngoài biên vẫn bị kẹp (fallback không phải đường vòng)", () => {
    expect(clampInt("abc", 1, 10, 9999)).toBe(10);
  });
});

describe("clampNumber", () => {
  it("GIỮ ĐƯỢC số thập phân — đây là lý do tách khỏi clampInt (QĐ-5)", () => {
    // refillPerSec mặc định 2/s; siết xuống 0.5/s là hành vi Hiến pháp mong muốn nhất.
    // clampInt sẽ làm tròn 0.5 thành 1 và giết mất khả năng siết này.
    expect(clampNumber("0.5", 0.1, 2, 2)).toBe(0.5);
    expect(clampInt("0.5", 0, 2, 2)).toBe(1);
  });

  it("dưới/trên biên → kẹp", () => {
    expect(clampNumber("0.01", 0.1, 2, 2)).toBe(0.1);
    expect(clampNumber("99", 0.1, 2, 2)).toBe(2);
  });

  it("rác → fallback", () => {
    expect(clampNumber("abc", 0.1, 2, 2)).toBe(2);
    expect(clampNumber(undefined, 0.1, 2, 2)).toBe(2);
  });
});

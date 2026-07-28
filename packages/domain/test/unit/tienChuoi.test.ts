// U36.3 — số học TIỀN trên chuỗi. Tiền là `numeric` Postgres, có thể vượt 2^53
// (06-BINDING_MAP §4.2 CẤM `Number()`/`parseFloat`). Test khóa đúng điều đó: mọi ca đều
// phải đúng khi làm bằng BigInt, và ca > 2^53 sẽ SAI ngay nếu ai đó đổi sang float.
import { describe, expect, it } from "vitest";
import { truTienChuoi } from "../../src/tienChuoi";

describe("truTienChuoi — a - b trên chuỗi, không ép float", () => {
  it("số nguyên thường", () => {
    expect(truTienChuoi("1711111", "0")).toBe("1711111");
    expect(truTienChuoi("0", "1711111")).toBe("-1711111");
    expect(truTienChuoi("100", "40")).toBe("60");
    expect(truTienChuoi("40", "100")).toBe("-60");
  });

  it("bằng nhau → '0' (không '-0')", () => {
    expect(truTienChuoi("1711111", "1711111")).toBe("0");
    expect(truTienChuoi("0", "0")).toBe("0");
  });

  it("số > 2^53 vẫn CHÍNH XÁC — chỗ float sẽ sai", () => {
    // 2^53 = 9007199254740992. Với double, 9007199254740993 - 1 cho 9007199254740992
    // (đúng ngẫu nhiên), nhưng 9007199254740993 - 0 đã mất số ngay khi parse.
    expect(truTienChuoi("9007199254740993", "0")).toBe("9007199254740993");
    expect(truTienChuoi("9007199254740993", "1")).toBe("9007199254740992");
    expect(truTienChuoi("123456789012345678901234567890", "1")).toBe(
      "123456789012345678901234567889",
    );
  });

  it("phần thập phân: khác scale vẫn cộng trừ đúng, cắt số 0 đuôi", () => {
    expect(truTienChuoi("100.50", "0.5")).toBe("100");
    expect(truTienChuoi("1.005", "0.005")).toBe("1");
    expect(truTienChuoi("10", "0.01")).toBe("9.99");
    expect(truTienChuoi("0.1", "0.3")).toBe("-0.2");
  });

  it("chuỗi rỗng / null / undefined coi như 0 — API có thể trả null (QĐ-10)", () => {
    expect(truTienChuoi(null, "5")).toBe("-5");
    expect(truTienChuoi("5", null)).toBe("5");
    expect(truTienChuoi(undefined, undefined)).toBe("0");
    expect(truTienChuoi("", "")).toBe("0");
  });

  it("đầu vào có dấu + hoặc số 0 dẫn đầu vẫn đúng", () => {
    expect(truTienChuoi("+100", "50")).toBe("50");
    expect(truTienChuoi("007", "3")).toBe("4");
  });

  it("đầu vào KHÔNG phải số → ném lỗi, KHÔNG trả số bịa", () => {
    expect(() => truTienChuoi("mot trieu", "0")).toThrow();
    expect(() => truTienChuoi("1e9", "0")).toThrow();
  });
});

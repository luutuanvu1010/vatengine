import { describe, expect, it } from "vitest";
import { formatDateVN, formatMoney, formatMoneyShort } from "../../src/lib/format";

describe("formatMoney — chuỗi numeric, KHÔNG ép float", () => {
  it("phân nhóm nghìn bằng dấu chấm", () => {
    expect(formatMoney("45000000")).toBe("45.000.000");
    expect(formatMoney("1230000000")).toBe("1.230.000.000");
    expect(formatMoney("0")).toBe("0");
    expect(formatMoney("999")).toBe("999");
  });

  it("giữ chính xác số > 2^53 (bẫy Number/parseFloat)", () => {
    // 2^53 + 1 = 9007199254740993; Number() sẽ làm tròn thành …992.
    expect(formatMoney("9007199254740993")).toBe("9.007.199.254.740.993");
  });

  it("xử lý số âm", () => {
    expect(formatMoney("-500")).toBe("-500");
    expect(formatMoney("-1234567")).toBe("-1.234.567");
  });

  it("phần thập phân: bỏ số 0 đuôi, dùng dấu phẩy", () => {
    expect(formatMoney("28749500.00")).toBe("28.749.500");
    expect(formatMoney("1234.50")).toBe("1.234,5");
    expect(formatMoney("1234.05")).toBe("1.234,05");
  });

  it("null/rỗng → chuỗi rỗng (không giá trị giả)", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney("")).toBe("");
  });
});

describe("formatMoneyShort — rút gọn tr/tỷ (BigInt, không float)", () => {
  it("triệu (tr)", () => {
    expect(formatMoneyShort("389100000")).toBe("389,1 tr");
    expect(formatMoneyShort("3520000")).toBe("3,52 tr");
  });
  it("tỷ", () => {
    expect(formatMoneyShort("2080000000")).toBe("2,08 tỷ");
  });
  it("dưới 1 triệu → đầy đủ", () => {
    expect(formatMoneyShort("45000")).toBe("45.000");
  });
  it("null → rỗng", () => {
    expect(formatMoneyShort(null)).toBe("");
  });
});

describe("formatDateVN — UTC → giờ VN (UTC+7), không lệch ngày", () => {
  it("mốc nửa đêm VN lưu 17:00:00Z ngày hôm trước → đúng ngày VN", () => {
    // 03/04 00:00 giờ VN = 02/04 17:00 UTC. Hiển thị UTC thô sẽ ra 02/04 (SAI).
    expect(formatDateVN("2026-04-02T17:00:00.000Z")).toBe("03/04/2026");
  });
  it("kèm giờ khi yêu cầu", () => {
    expect(formatDateVN("2026-07-14T10:30:00.000Z", true)).toBe("14/07/2026 17:30");
  });
  it("null/không hợp lệ → rỗng", () => {
    expect(formatDateVN(null)).toBe("");
    expect(formatDateVN("không-phải-ngày")).toBe("");
  });
});

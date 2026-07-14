// U10 unit — phân loại trạng thái hủy/thay thế THUẦN theo bảng mã TIÊM vào (không I/O).
//
// ⚠️ Bảng mã dưới đây là GIẢ ĐỊNH (CHƯA KIỂM CHỨNG) chỉ dùng để kiểm CƠ CHẾ phân loại.
// ADR-0001 (dòng 45) mới chỉ quan sát `tthai=1`. Giá trị mã thật cho hủy/thay thế phải
// được probe (xem test/contract/statusCodes.contract.test.ts) rồi mới điền map production
// (statusCodes.ts vẫn RỖNG cho tới lúc đó — Nguyên tắc bằng chứng của Hiến pháp).
import { describe, expect, it } from "vitest";
import { classifyStatus } from "../../src/statusAnomaly";
import type { StatusCodeMap } from "../../src/types";

const TEST_MAP: StatusCodeMap = {
  huy: { tthai: [5], ttxly: [9] },
  thayThe: { tthai: [3], ttxly: [] },
};

describe("classifyStatus (unit, thuần)", () => {
  it("tthai trong tập hủy → 'huy'", () => {
    expect(classifyStatus({ tthai: 5, ttxly: 8 }, TEST_MAP)).toBe("huy");
  });

  it("tthai trong tập thay thế → 'thay_the'", () => {
    expect(classifyStatus({ tthai: 3, ttxly: 8 }, TEST_MAP)).toBe("thay_the");
  });

  it("ttxly trong tập hủy → 'huy' (khớp theo ttxly)", () => {
    expect(classifyStatus({ tthai: 1, ttxly: 9 }, TEST_MAP)).toBe("huy");
  });

  it("mã gốc (tthai=1) → 'binh_thuong'", () => {
    expect(classifyStatus({ tthai: 1, ttxly: 8 }, TEST_MAP)).toBe("binh_thuong");
  });

  it("null → 'binh_thuong' (không suy đoán)", () => {
    expect(classifyStatus({ tthai: null, ttxly: null }, TEST_MAP)).toBe("binh_thuong");
  });

  it("map RỖNG (production CHƯA KIỂM CHỨNG) → luôn 'binh_thuong'", () => {
    const empty: StatusCodeMap = { huy: {}, thayThe: {} };
    expect(classifyStatus({ tthai: 5, ttxly: 9 }, empty)).toBe("binh_thuong");
  });

  it("hủy được ưu tiên hơn thay thế khi mã trùng hai tập", () => {
    const overlap: StatusCodeMap = { huy: { tthai: [7] }, thayThe: { tthai: [7] } };
    expect(classifyStatus({ tthai: 7, ttxly: null }, overlap)).toBe("huy");
  });
});

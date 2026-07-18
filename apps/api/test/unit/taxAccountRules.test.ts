// U23-D2 — quy tắc tài khoản thuế thuần (không route/DB): hạn mức + validate tiền tố con.
import { describe, expect, it } from "vitest";
import { HAN_MUC_MAC_DINH } from "../../src/goiDichVuConfig";
import {
  getGioiHanTkThue,
  isSubAccountEnabled,
  isValidSubUsername,
} from "../../src/routes/taxAccounts";

describe("U23-D2 — quy tắc tài khoản thuế (unit)", () => {
  it("getGioiHanTkThue lấy hạn mức từ GÓI, không còn hardcode (U17a)", () => {
    expect(getGioiHanTkThue(HAN_MUC_MAC_DINH)).toBe(1);
    expect(getGioiHanTkThue({ ...HAN_MUC_MAC_DINH, soMstToiDa: 5 })).toBe(5);
  });

  it("module tài khoản con theo GÓI; gói free = tắt", () => {
    expect(isSubAccountEnabled(HAN_MUC_MAC_DINH)).toBe(false);
    expect(isSubAccountEnabled({ ...HAN_MUC_MAC_DINH, choTaiKhoanCon: true })).toBe(true);
  });

  it("isValidSubUsername: username con phải bắt đầu bằng MST gốc", () => {
    expect(isValidSubUsername("0100000001", "0100000001-001")).toBe(true);
    expect(isValidSubUsername("0100000001", "0100000001001")).toBe(true);
    // Sai tiền tố → không hợp lệ (chống MST ngoài doanh nghiệp).
    expect(isValidSubUsername("0100000001", "0200000002-001")).toBe(false);
    expect(isValidSubUsername("0100000001", "999")).toBe(false);
    // Trùng đúng MST gốc (không phải nhánh con) → không hợp lệ.
    expect(isValidSubUsername("0100000001", "0100000001")).toBe(false);
  });
});

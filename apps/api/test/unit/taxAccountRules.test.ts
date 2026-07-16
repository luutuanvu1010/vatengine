// U23-D2 — quy tắc tài khoản thuế thuần (không route/DB): hạn mức + validate tiền tố con.
import { describe, expect, it } from "vitest";
import {
  SUB_ACCOUNT_MODULE_ENABLED,
  getGioiHanTkThue,
  isValidSubUsername,
} from "../../src/routes/taxAccounts";

describe("U23-D2 — quy tắc tài khoản thuế (unit)", () => {
  it("getGioiHanTkThue tạm = 1 (TODO nối gói dịch vụ U17)", () => {
    expect(getGioiHanTkThue({ goiDichVu: null })).toBe(1);
    expect(getGioiHanTkThue({ goiDichVu: "Miễn phí" })).toBe(1);
  });

  it("module tài khoản con mặc định TẮT ở U23-D (chỉ dựng nền)", () => {
    expect(SUB_ACCOUNT_MODULE_ENABLED).toBe(false);
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

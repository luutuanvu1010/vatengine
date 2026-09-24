import { describe, expect, it } from "vitest";
import { GdtContractDriftError, GdtError, coChuKyWaf, isWafBlocked } from "../../src/errors";

// KIỂM CHỨNG 2026-09-24 (curl thật): WAF GDT trả 403 kèm đúng câu này khi thiếu header request-id.
const THONG_DIEP_WAF = "Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn.";

describe("coChuKyWaf", () => {
  it("nhận đúng thông điệp WAF đã quan sát", () => {
    expect(coChuKyWaf(THONG_DIEP_WAF)).toBe(true);
  });
  it("không phân biệt hoa thường và dạng Unicode (NFD)", () => {
    expect(coChuKyWaf("HỆ THỐNG PHÁT HIỆN HÀNH VI KHÔNG HỢP LỆ")).toBe(true);
    expect(coChuKyWaf(THONG_DIEP_WAF.normalize("NFD"))).toBe(true);
  });
  it("undefined/rỗng/thông điệp khác → false", () => {
    expect(coChuKyWaf(undefined)).toBe(false);
    expect(coChuKyWaf("")).toBe(false);
    expect(coChuKyWaf("Mã captcha không đúng.")).toBe(false);
  });
});

describe("isWafBlocked", () => {
  it("GdtError 403 + chữ ký → true", () => {
    expect(isWafBlocked(new GdtError(THONG_DIEP_WAF, "HTTP_ERROR", 403))).toBe(true);
  });
  it("GdtError 403 KHÔNG chữ ký → false (chặn địa lý/khác)", () => {
    expect(isWafBlocked(new GdtError("Forbidden", "HTTP_ERROR", 403))).toBe(false);
  });
  it("GdtError 401 dù có chữ ký → false (không phải WAF)", () => {
    expect(isWafBlocked(new GdtError(THONG_DIEP_WAF, "HTTP_ERROR", 401))).toBe(false);
  });
  it("lỗi không phải GdtError → false", () => {
    expect(isWafBlocked(new GdtContractDriftError(THONG_DIEP_WAF))).toBe(false);
    expect(isWafBlocked(new Error(THONG_DIEP_WAF))).toBe(false);
    expect(isWafBlocked(undefined)).toBe(false);
  });
});

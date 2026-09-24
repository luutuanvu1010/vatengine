import { describe, expect, it } from "vitest";
import { classify } from "../../src/transport";

describe("classify", () => {
  it("TIMEOUT khi timedOut = true", () => {
    expect(classify(undefined, true, false)).toBe("TIMEOUT");
  });

  it("ERROR khi errored = true", () => {
    expect(classify(undefined, false, true)).toBe("ERROR");
  });

  it("ERROR khi không có status", () => {
    expect(classify(undefined, false, false)).toBe("ERROR");
  });

  it("GEO_BLOCKED cho 403 và 451", () => {
    expect(classify(403, false, false)).toBe("GEO_BLOCKED");
    expect(classify(451, false, false)).toBe("GEO_BLOCKED");
  });

  it("RATE_LIMITED cho 429", () => {
    expect(classify(429, false, false)).toBe("RATE_LIMITED");
  });

  it("OK cho 200..499 (trừ 403/429/451) — tới được máy chủ", () => {
    expect(classify(200, false, false)).toBe("OK");
    expect(classify(404, false, false)).toBe("OK");
  });

  it("ERROR cho 5xx", () => {
    expect(classify(500, false, false)).toBe("ERROR");
  });

  // KIỂM CHỨNG 2026-09-24: 403 + thân mang chữ ký WAF = chặn theo HEADER (không theo IP).
  // Xếp nhầm vào GEO_BLOCKED thì hệ thống tính chuyển relay VN — nơi cũng bị chặn y hệt.
  it("WAF_BLOCKED cho 403 + thân mang chữ ký WAF", () => {
    const than =
      '{"status":403,"message":"Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn."}';
    expect(classify(403, false, false, than)).toBe("WAF_BLOCKED");
  });

  it("GEO_BLOCKED cho 403 có thân nhưng KHÔNG chữ ký, và 403 không thân", () => {
    expect(classify(403, false, false, "<html>Forbidden</html>")).toBe("GEO_BLOCKED");
    expect(classify(403, false, false, undefined)).toBe("GEO_BLOCKED");
  });

  it("chữ ký WAF ở status khác 403 KHÔNG đổi verdict", () => {
    expect(classify(200, false, false, "hành vi không hợp lệ")).toBe("OK");
    expect(classify(500, false, false, "hành vi không hợp lệ")).toBe("ERROR");
  });
});

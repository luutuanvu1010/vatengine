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
});

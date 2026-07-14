import { describe, expect, it } from "vitest";
import { deriveTokenExpiry } from "../../src";

// JWT tổng hợp: header.payload.signature; payload {exp}. base64url không cần chữ ký thật.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

describe("deriveTokenExpiry", () => {
  it("JWT có exp → Date đúng thời điểm", () => {
    const exp = 1_800_000_000; // giây epoch
    expect(deriveTokenExpiry(fakeJwt({ exp })).getTime()).toBe(exp * 1000);
  });

  it("token không phải JWT / thiếu exp → ném lỗi (không đoán TTL)", () => {
    expect(() => deriveTokenExpiry("khong-phai-jwt")).toThrow();
    expect(() => deriveTokenExpiry(fakeJwt({ sub: "x" }))).toThrow();
  });
});

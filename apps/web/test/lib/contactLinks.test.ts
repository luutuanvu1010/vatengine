import { describe, expect, it } from "vitest";
import { whatsappUrl, zaloUrl } from "../../src/lib/contactLinks";

describe("zaloUrl", () => {
  it("bỏ khoảng trắng, giữ số nội địa", () => {
    expect(zaloUrl("0989 929 373")).toBe("https://zalo.me/0989929373");
  });
});

describe("whatsappUrl — E.164", () => {
  it("số 0 đầu → mã quốc gia 84", () => {
    expect(whatsappUrl("0989929373")).toBe("https://wa.me/84989929373");
  });
  it("đã có 84 → giữ nguyên", () => {
    expect(whatsappUrl("84989929373")).toBe("https://wa.me/84989929373");
  });
  it("bỏ ký tự không phải số (+, khoảng trắng)", () => {
    expect(whatsappUrl("+84 989 929 373")).toBe("https://wa.me/84989929373");
  });
});

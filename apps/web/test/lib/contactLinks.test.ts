import { describe, expect, it } from "vitest";
import { hienThiSoDienThoai, telUrl, whatsappUrl, zaloUrl } from "../../src/lib/contactLinks";

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

describe("telUrl — E.164 để bấm gọi", () => {
  it("số 0 đầu → mã quốc gia 84, có dấu cộng", () => {
    expect(telUrl("0989929373")).toBe("tel:+84989929373");
  });
  it("đã có 84 → giữ nguyên", () => {
    expect(telUrl("84989929373")).toBe("tel:+84989929373");
  });
  it("bỏ ký tự không phải số", () => {
    expect(telUrl("+84 989 929 373")).toBe("tel:+84989929373");
  });
});

describe("hienThiSoDienThoai — số để đọc trên màn hình", () => {
  it("đúng 10 chữ số → tách 4-3-3 như cách viết quen thuộc ở Việt Nam", () => {
    expect(hienThiSoDienThoai("0989929373")).toBe("0989 929 373");
  });
  it("đầu vào đã có khoảng trắng vẫn cho ra cùng kết quả", () => {
    expect(hienThiSoDienThoai("0989 929 373")).toBe("0989 929 373");
  });
  // Không đoán cách chia cho độ dài lạ — đoán sai còn tệ hơn hiện nguyên dãy.
  it("độ dài khác 10 → trả nguyên dãy chữ số, không tách", () => {
    expect(hienThiSoDienThoai("02871234567")).toBe("02871234567");
  });
});

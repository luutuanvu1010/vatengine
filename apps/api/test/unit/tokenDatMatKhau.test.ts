import { describe, expect, it } from "vitest";
import { thuDatMatKhau } from "../../src/email/mau";
import {
  HAN_GIO_DAT_MAT_KHAU,
  hanTokenDatMatKhau,
  lienKetDatMatKhau,
} from "../../src/email/tokenDatMatKhau";

describe("hạn token đặt mật khẩu", () => {
  it("đúng 72 giờ — dài hơn token xác thực email (24h)", () => {
    expect(HAN_GIO_DAT_MAT_KHAU).toBe(72);
    const bayGio = new Date("2026-07-22T10:00:00.000Z");
    expect(hanTokenDatMatKhau(bayGio).toISOString()).toBe("2026-07-25T10:00:00.000Z");
  });
});

describe("lienKetDatMatKhau", () => {
  it("trỏ tới TRANG SPA /dat-mat-khau, không trỏ vào /api", () => {
    const l = lienKetDatMatKhau("https://vatengine.tourdao.vn", "abc-123");
    expect(l).toBe("https://vatengine.tourdao.vn/dat-mat-khau?token=abc-123");
  });

  it("bỏ dấu / thừa ở cuối url nền", () => {
    expect(lienKetDatMatKhau("https://x.vn///", "t")).toBe("https://x.vn/dat-mat-khau?token=t");
  });

  it("mã hoá token cho an toàn trong query string", () => {
    expect(lienKetDatMatKhau("https://x.vn", "a+b/c=")).toContain("token=a%2Bb%2Fc%3D");
  });
});

describe("thuDatMatKhau", () => {
  const thu = thuDatMatKhau("Cty <Thử> & Co", "https://x.vn/dat-mat-khau?token=t1");

  it("có CẢ html lẫn text — bản text tự đủ nghĩa", () => {
    expect(thu.html).toContain("https://x.vn/dat-mat-khau?token=t1");
    expect(thu.text).toContain("https://x.vn/dat-mat-khau?token=t1");
    expect(thu.text).toContain("72 giờ");
  });

  it("🔴 thoát HTML cho tên doanh nghiệp (người lạ nhập vào form công khai)", () => {
    expect(thu.html).toContain("Cty &lt;Thử&gt; &amp; Co");
    expect(thu.html).not.toContain("<Thử>");
  });

  it("🔴 KHÔNG chứa mật khẩu nào — QĐ-14 bỏ hẳn mã 6 số", () => {
    expect(thu.html).not.toMatch(/\b\d{6}\b/);
    expect(thu.text).not.toMatch(/\b\d{6}\b/);
  });

  it("nói rõ hạn 72 giờ và dùng một lần", () => {
    expect(thu.html).toContain("72 giờ");
    expect(thu.text).toContain("một lần");
  });
});

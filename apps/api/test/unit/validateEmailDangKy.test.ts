// U17b (§3.4) — Validate email đăng ký công khai. Thứ tự kiểm CÓ CHỦ Ý: dạng → alias '+' →
// miền dùng-1-lần → allowlist đuôi. Mỗi tầng chặn một kiểu lạm dụng khác nhau, và thứ tự
// quyết định THÔNG BÁO người dùng nhận được.
import { describe, expect, it } from "vitest";
import { validateEmailDangKy } from "../../src/lib/validateEmailDangKy";

describe("validateEmailDangKy", () => {
  it("email doanh nghiệp hợp lệ → ok", () => {
    for (const e of [
      "ketoan@tourdao.com.vn",
      "a@congty.vn",
      "x@abc.com",
      "y@abc.net.vn",
      "z@truong.edu.vn",
      "w@to-chuc.org",
    ])
      expect(validateEmailDangKy(e)).toEqual({ ok: true });
  });

  it("gmail/yahoo được phép (khách nhỏ thường dùng)", () => {
    expect(validateEmailDangKy("anh.nguyen@gmail.com")).toEqual({ ok: true });
    expect(validateEmailDangKy("chi@yahoo.com")).toEqual({ ok: true });
  });

  it("dạng sai → dang_sai", () => {
    for (const e of ["", "khongcoa", "@abc.com", "a@", "a@b", "a b@abc.com", "a@@b.com"])
      expect(validateEmailDangKy(e)).toEqual({ ok: false, ly_do: "dang_sai" });
  });

  it("alias dấu cộng bị chặn (một người tạo vô hạn tài khoản từ 1 hộp thư)", () => {
    expect(validateEmailDangKy("a+1@gmail.com")).toEqual({ ok: false, ly_do: "alias_cong" });
    expect(validateEmailDangKy("ketoan+test@tourdao.com.vn")).toEqual({
      ok: false,
      ly_do: "alias_cong",
    });
  });

  it("miền dùng-1-lần bị chặn", () => {
    expect(validateEmailDangKy("a@mailinator.com")).toEqual({
      ok: false,
      ly_do: "mien_dung_mot_lan",
    });
    // KHÔNG phân biệt hoa/thường — miền là case-insensitive.
    expect(validateEmailDangKy("a@MAILINATOR.COM")).toEqual({
      ok: false,
      ly_do: "mien_dung_mot_lan",
    });
  });

  it("đuôi ngoài allowlist bị chặn", () => {
    for (const e of ["a@abc.xyz", "a@abc.top", "a@abc.ru"])
      expect(validateEmailDangKy(e)).toEqual({ ok: false, ly_do: "mien_khong_duoc_phep" });
  });

  it("THỨ TỰ: miền dùng-1-lần được kiểm TRƯỚC allowlist đuôi", () => {
    // mailinator.com có đuôi .com hợp lệ — nếu kiểm allowlist trước thì nó lọt.
    expect(validateEmailDangKy("a@mailinator.com").ok).toBe(false);
    expect(validateEmailDangKy("a@mailinator.com")).toEqual({
      ok: false,
      ly_do: "mien_dung_mot_lan",
    });
  });

  it("THỨ TỰ: alias '+' kiểm TRƯỚC miền — báo đúng lý do người dùng sửa được", () => {
    expect(validateEmailDangKy("a+x@mailinator.com")).toEqual({
      ok: false,
      ly_do: "alias_cong",
    });
  });

  it("khoảng trắng thừa hai đầu được bỏ qua, không làm sai kết quả", () => {
    expect(validateEmailDangKy("  a@abc.com  ")).toEqual({ ok: true });
  });
});

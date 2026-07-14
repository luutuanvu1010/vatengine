// U8 unit — băm/so khớp mật khẩu nội bộ (PBKDF2/WebCrypto). Offline, không DB.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/password";

describe("password (PBKDF2)", () => {
  it("hash rồi verify với đúng mật khẩu → true", async () => {
    const stored = await hashPassword("s3cret-pass");
    expect(await verifyPassword("s3cret-pass", stored)).toBe(true);
  });

  it("verify với mật khẩu SAI → false", async () => {
    const stored = await hashPassword("s3cret-pass");
    expect(await verifyPassword("sai-mat-khau", stored)).toBe(false);
  });

  it("hai lần băm CÙNG mật khẩu → chuỗi khác nhau (salt ngẫu nhiên) nhưng đều verify được", async () => {
    const a = await hashPassword("trung-mat-khau");
    const b = await hashPassword("trung-mat-khau");
    expect(a).not.toBe(b);
    expect(await verifyPassword("trung-mat-khau", a)).toBe(true);
    expect(await verifyPassword("trung-mat-khau", b)).toBe(true);
  });

  it("định dạng lưu tự mô tả: pbkdf2$<iter>$<salt>$<hash>", async () => {
    const stored = await hashPassword("x");
    const parts = stored.split("$");
    expect(parts[0]).toBe("pbkdf2");
    expect(Number(parts[1])).toBeGreaterThan(0);
    expect(parts.length).toBe(4);
  });

  it("chuỗi lưu hỏng/không đúng định dạng → false (không ném)", async () => {
    expect(await verifyPassword("x", "khong-phai-hash")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$0$aa$bb")).toBe(false); // iter không hợp lệ
    expect(await verifyPassword("x", "pbkdf2$100$!!!$bb")).toBe(false); // base64 hỏng → catch
    expect(await verifyPassword("x", "")).toBe(false);
  });
});

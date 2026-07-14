import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "../../src/envelope";

// KEK giả 32 byte (AES-256) — CHỈ cho test, KHÔNG phải bí mật thật (security.md).
// Trong sản xuất, KEK nạp từ Workers Secret, không hard-code.
const KEK_B64 = btoa("0123456789abcdef0123456789abcdef"); // 32 ký tự = 32 byte
const OTHER_KEK_B64 = btoa("FEDCBA9876543210FEDCBA9876543210");

describe("envelope encryption (seal/open)", () => {
  it("round-trips plaintext về đúng giá trị gốc", async () => {
    const pt = "eyJhbGciOiJIUzI1NiJ9.token-thue-gia";
    const sealed = await sealSecret(pt, KEK_B64);
    expect(await openSecret(sealed, KEK_B64)).toBe(pt);
  });

  it("round-trips chuỗi rỗng và UTF-8 tiếng Việt", async () => {
    for (const pt of ["", "Hóa đơn điện tử — Tổng cục Thuế 🧾"]) {
      const sealed = await sealSecret(pt, KEK_B64);
      expect(await openSecret(sealed, KEK_B64)).toBe(pt);
    }
  });

  it("ciphertext KHÁC plaintext (không lộ ở dạng thô)", async () => {
    const pt = "mat-khau-khong-duoc-lo";
    const sealed = await sealSecret(pt, KEK_B64);
    expect(sealed).not.toContain(pt);
  });

  it("không tất định: seal hai lần cùng plaintext → chuỗi khác (IV/DEK ngẫu nhiên)", async () => {
    const pt = "token";
    const a = await sealSecret(pt, KEK_B64);
    const b = await sealSecret(pt, KEK_B64);
    expect(a).not.toBe(b);
  });

  it("chuỗi sealed tự mô tả: bắt đầu bằng version tag v1 (mở đường rotation)", async () => {
    const sealed = await sealSecret("x", KEK_B64);
    expect(sealed.startsWith("v1$aesgcm$")).toBe(true);
  });

  it("KEK sai → giải mã thất bại (ném lỗi, KHÔNG trả rác)", async () => {
    const sealed = await sealSecret("bi-mat", KEK_B64);
    await expect(openSecret(sealed, OTHER_KEK_B64)).rejects.toThrow();
  });

  it("chuỗi sealed hỏng/thiếu trường → thất bại có kiểm soát", async () => {
    await expect(openSecret("v1$aesgcm$chi-co-mot-truong", KEK_B64)).rejects.toThrow();
    await expect(openSecret("khong-phai-dinh-dang", KEK_B64)).rejects.toThrow();
    await expect(openSecret("v2$aesgcm$a$b$c$d", KEK_B64)).rejects.toThrow();
  });
});

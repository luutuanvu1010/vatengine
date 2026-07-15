// H-A.5a — PBKDF2 iterations cấu hình qua env (nâng lên 600k khi Paid — H-A.3; đo cho
// thấy 600k ~42ms > trần Free 10ms nên default GIỮ 100k an toàn Free). Hash tự mô tả số
// vòng ⇒ tương thích ngược: hash cũ 100k vẫn verify được sau khi đổi default.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PBKDF2_ITERATIONS,
  hashPassword,
  resolvePbkdf2Iterations,
  verifyPassword,
} from "../../src/password";

describe("PBKDF2 iterations cấu hình được (H-A.5a)", () => {
  it("hashPassword nhúng đúng số vòng vào định dạng tự mô tả", async () => {
    const h = await hashPassword("mk", 250_000);
    expect(h.split("$")[1]).toBe("250000");
    expect(await verifyPassword("mk", h)).toBe(true);
  });

  it("default = 100k (an toàn Free)", async () => {
    expect(DEFAULT_PBKDF2_ITERATIONS).toBe(100_000);
    const h = await hashPassword("mk");
    expect(h.split("$")[1]).toBe("100000");
  });

  it("TƯƠNG THÍCH NGƯỢC: hash 100k cũ vẫn verify sau khi nâng vòng mới", async () => {
    const old = await hashPassword("mk", 100_000);
    const fresh = await hashPassword("mk", 600_000);
    expect(await verifyPassword("mk", old)).toBe(true);
    expect(await verifyPassword("mk", fresh)).toBe(true);
    expect(await verifyPassword("sai", old)).toBe(false);
  });

  describe("resolvePbkdf2Iterations", () => {
    it("không đặt env → default", () => {
      expect(resolvePbkdf2Iterations({})).toBe(DEFAULT_PBKDF2_ITERATIONS);
    });
    it("env hợp lệ ≥ default → dùng giá trị env (flip 600k khi Paid)", () => {
      expect(resolvePbkdf2Iterations({ PBKDF2_ITERATIONS: "600000" })).toBe(600_000);
    });
    it("KHÔNG cho hạ dưới sàn 100k (chống cấu hình sai làm yếu)", () => {
      expect(resolvePbkdf2Iterations({ PBKDF2_ITERATIONS: "5000" })).toBe(
        DEFAULT_PBKDF2_ITERATIONS,
      );
    });
    it("giá trị rác → default (fail-safe)", () => {
      expect(resolvePbkdf2Iterations({ PBKDF2_ITERATIONS: "abc" })).toBe(DEFAULT_PBKDF2_ITERATIONS);
    });
  });
});

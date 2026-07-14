import { describe, expect, it } from "vitest";
import { maskSensitive } from "../../src/mask";

describe("maskSensitive", () => {
  it("che các khóa nhạy cảm (token/password/secret/authorization) theo tên khóa", () => {
    const out = maskSensitive({
      token: "eyJ.jwt.thue",
      password: "mat-khau",
      matKhau: "mat-khau-2",
      secret_ref: "ref-bi-mat",
      authorization: "Bearer abc",
      username: "0123456789",
    }) as Record<string, unknown>;
    expect(out.token).toBe("***");
    expect(out.password).toBe("***");
    expect(out.matKhau).toBe("***");
    expect(out.secret_ref).toBe("***");
    expect(out.authorization).toBe("***");
    // Khóa vô hại giữ nguyên.
    expect(out.username).toBe("0123456789");
  });

  it("che khóa raw_json / rawJson (dữ liệu hóa đơn thô nhạy cảm, security.md)", () => {
    const out = maskSensitive({ raw_json: { a: 1 }, rawJson: { b: 2 } }) as Record<string, unknown>;
    expect(out.raw_json).toBe("***");
    expect(out.rawJson).toBe("***");
  });

  it("che connection string trong giá trị chuỗi (postgres://user:pass@host)", () => {
    const out = maskSensitive({
      note: "postgres://admin:hunter2@db.example.com:5432/vat",
    }) as Record<string, unknown>;
    expect(out.note).not.toContain("hunter2");
  });

  it("che JWT nhúng trong chuỗi tự do dưới khóa vô hại (phòng lỗi echo token)", () => {
    // JWT thô lọt vào message lỗi rồi gán cho khóa không nhạy cảm (`reason`).
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.s5-abc_DEF123";
    const out = maskSensitive({
      reason: `GDT tra loi voi token ${jwt} het han`,
    }) as Record<string, unknown>;
    expect(out.reason).not.toContain(jwt);
  });

  it("đệ quy vào object và array lồng nhau", () => {
    const out = maskSensitive({
      outer: { token: "x", list: [{ password: "y" }, { ok: "z" }] },
    }) as { outer: { token: string; list: Array<Record<string, unknown>> } };
    expect(out.outer.token).toBe("***");
    expect(out.outer.list[0]?.password).toBe("***");
    expect(out.outer.list[1]?.ok).toBe("z");
  });

  it("giá trị null/undefined/nguyên thủy an toàn (không ném)", () => {
    expect(maskSensitive(null)).toBe(null);
    expect(maskSensitive(undefined)).toBe(undefined);
    expect(maskSensitive(42)).toBe(42);
    expect(maskSensitive("chuoi-thuong")).toBe("chuoi-thuong");
  });

  it("không đột biến đối tượng gốc (trả bản sao đã che)", () => {
    const original = { token: "bi-mat" };
    maskSensitive(original);
    expect(original.token).toBe("bi-mat");
  });
});

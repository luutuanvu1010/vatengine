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

  // ── QĐ-17 (2026-07-22) — email là dữ liệu cá nhân ────────────────────────────────────
  // Vì sao đây không phải chuyện nhỏ: `audit_log` KHÔNG SỬA, KHÔNG XOÁ được (trigger
  // append-only, 0002). Một email lọt vào đó là lọt vĩnh viễn — không có đường gỡ, kể cả
  // khi khách yêu cầu xoá dữ liệu. Trước ngày 22-07, `routes/dangKy.ts` ghi thẳng email
  // vào `chi_tiet`, tức mỗi lượt đăng ký để lại một địa chỉ không bao giờ lấy ra được.
  describe("che email", () => {
    it("🔴 khoá `email` bị che", () => {
      expect(maskSensitive({ email: "ketoan@congty.vn", mst: "0101234567" })).toEqual({
        email: "***",
        mst: "0101234567", // MST là dữ liệu đăng ký kinh doanh công khai → GIỮ
      });
    });

    it("🔴 email LẪN trong chuỗi tự do cũng bị che", () => {
      // Che theo KHOÁ không với tới được ca này. Lỗi UNIQUE của Postgres có thể kèm nguyên
      // giá trị bị trùng — tức chính địa chỉ email của khách — rồi `app.ts` ghi `err.message`.
      expect(maskSensitive({ message: "duplicate key: (email)=(ketoan@congty.vn)" })).toEqual({
        message: "duplicate key: (email)=(***)",
      });
    });

    it("che nhiều email trong cùng một chuỗi", () => {
      expect(maskSensitive("gui tu a.b@x.vn toi c@y.com.vn")).toBe("gui tu *** toi ***");
    });

    it("KHÔNG che nhầm chuỗi chỉ trông hao hao", () => {
      // Giữ được ngữ cảnh chẩn đoán: che quá tay thì log thành vô dụng.
      expect(maskSensitive("ty-le 5@ngay")).toBe("ty-le 5@ngay");
      expect(maskSensitive("khong-co-a-cong")).toBe("khong-co-a-cong");
    });

    it("🔴 chuỗi kết nối DB vẫn che đúng như cũ, KHÔNG bị regex email cướp mất", () => {
      // `postgres://user:pass@host` có dạng hao hao email. CONN_STRING chạy TRƯỚC nên phần
      // credential đã bị che rồi; ca này khoá đúng thứ tự đó lại.
      expect(maskSensitive("postgres://vat_app:sieumat@db.neon.tech/vat")).toBe(
        "postgres://vat_app:***@db.neon.tech/vat",
      );
    });
  });
});

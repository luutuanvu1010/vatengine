// SỰ CỐ 2026-07-18: Drizzle ném DrizzleQueryError với message = TOÀN BỘ SQL + tham số
// (kể cả raw_json hóa đơn) — production đã lưu một thong_diep_loi 11.476.737 ký tự vào
// lan_dong_bo, còn nguyên nhân PG thật nằm trong `cause` thì MẤT. tomTatLoi phải:
// (1) giữ được chuỗi nguyên nhân (cause chain), (2) chặn trần độ dài, (3) không ném
// với input bất kỳ. Cũng là chốt security.md: không dump raw_json vào bảng vết.
import { describe, expect, it } from "vitest";
import { tomTatLoi } from "../../src/sync";

describe("tomTatLoi — tóm tắt lỗi có cause, chặn trần độ dài", () => {
  it("Error thường → giữ nguyên message", () => {
    expect(tomTatLoi(new Error("lỗi mạng"))).toBe("lỗi mạng");
  });

  it("Error có cause chain → nối cả nguyên nhân gốc (chẩn đoán được từ DB)", () => {
    const goc = new Error("bind message has 65535 parameter formats");
    const giua = new Error("Failed query: insert into hoa_don ...", { cause: goc });
    const s = tomTatLoi(giua);
    expect(s).toContain("Failed query");
    expect(s).toContain("bind message has 65535 parameter formats");
  });

  it("message khổng lồ (mô phỏng 11.5MB SQL dump) → cắt còn ≤ 2100 ký tự, có ghi chú cắt", () => {
    const khongLo = new Error(`Failed query: insert ${"x".repeat(500_000)}`, {
      cause: new Error("nguyên nhân thật ở cuối"),
    });
    const s = tomTatLoi(khongLo);
    expect(s.length).toBeLessThanOrEqual(2100);
    // Nguyên nhân thật KHÔNG được biến mất vì phần SQL dài (cắt từng phần, không cắt đuôi).
    expect(s).toContain("nguyên nhân thật ở cuối");
    expect(s).toContain("cắt bớt");
  });

  it("không phải Error → String(err), không ném", () => {
    expect(tomTatLoi("chuỗi thô")).toBe("chuỗi thô");
    expect(tomTatLoi(undefined)).toBe("undefined");
  });

  it("cause vòng lặp/quá sâu → dừng an toàn (tối đa 3 tầng)", () => {
    const a = new Error("tầng 1");
    const b = new Error("tầng 2", { cause: a });
    a.cause = b; // cố ý tạo vòng để kiểm an toàn
    const s = tomTatLoi(b);
    expect(s.length).toBeLessThan(500);
  });
});

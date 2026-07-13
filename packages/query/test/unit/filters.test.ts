// U6 unit — validate bộ lọc/phân trang (Zod, thuần, offline) + fail-loud ngày sai.
import { describe, expect, it } from "vitest";
import { buildWhere, invoiceFilterSchema, pageSchema } from "../../src/filters";

describe("invoiceFilterSchema", () => {
  it("chấp nhận bộ lọc hợp lệ + ép kiểu số từ query string", () => {
    const f = invoiceFilterSchema.parse({
      chieu: "purchase",
      nguon: "sco",
      tuNgay: "2026-04-01",
      denNgay: "2026-04-30",
      ttxly: "8", // query string → số
      tthai: "1",
      nbmst: "0100000001",
    });
    expect(f).toMatchObject({ chieu: "purchase", nguon: "sco", ttxly: 8, tthai: 1 });
  });

  it("bỏ qua key lạ (limit/offset thuộc pageSchema) thay vì ném", () => {
    const f = invoiceFilterSchema.parse({ limit: "10", offset: "5" });
    expect(f).not.toHaveProperty("limit");
  });

  it("từ chối chieu ngoài tập {purchase, sold}", () => {
    expect(() => invoiceFilterSchema.parse({ chieu: "mua" })).toThrow();
  });

  it("từ chối nguon ngoài tập {normal, sco}", () => {
    expect(() => invoiceFilterSchema.parse({ nguon: "may" })).toThrow();
  });

  it("từ chối ngày sai định dạng YYYY-MM-DD", () => {
    expect(() => invoiceFilterSchema.parse({ tuNgay: "01/04/2026" })).toThrow();
  });
});

describe("pageSchema", () => {
  it("mặc định limit=50, offset=0 khi không truyền", () => {
    expect(pageSchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it("ép kiểu số từ query string", () => {
    expect(pageSchema.parse({ limit: "20", offset: "40" })).toEqual({ limit: 20, offset: 40 });
  });

  it("chặn limit vượt trần (>200) → lỗi", () => {
    expect(() => pageSchema.parse({ limit: "500" })).toThrow();
  });

  it("từ chối offset âm", () => {
    expect(() => pageSchema.parse({ offset: "-1" })).toThrow();
  });
});

describe("buildWhere", () => {
  it("luôn dựng điều kiện (kể cả bộ lọc rỗng — có ràng buộc tenant)", () => {
    expect(buildWhere("11111111-1111-1111-1111-111111111111", {})).toBeDefined();
  });

  it("fail-loud khi ngày hợp lệ định dạng nhưng KHÔNG có thật (2026-13-40)", () => {
    // Zod chỉ kiểm định dạng; ngày phi thực tế phải bị chặn ở dựng khoảng (không đoán).
    expect(() =>
      buildWhere("11111111-1111-1111-1111-111111111111", { tuNgay: "2026-13-40" }),
    ).toThrow();
  });

  // `new Date` CUỘN âm thầm ngày tràn-tháng (Feb 30 → Mar 2) thay vì NaN → phải đối
  // chiếu lại Y-M-D để fail-loud, nếu không lọc/tổng hợp SAI KỲ mà không báo lỗi.
  const T = "11111111-1111-1111-1111-111111111111";
  it.each(["2026-02-30", "2026-04-31", "2026-11-31", "2026-02-29"])(
    "fail-loud khi ngày tràn số ngày của tháng (%s)",
    (bad) => {
      expect(() => buildWhere(T, { tuNgay: bad })).toThrow();
      expect(() => buildWhere(T, { denNgay: bad })).toThrow();
    },
  );

  it("chấp nhận 29/02 của năm NHUẬN (2028-02-29)", () => {
    expect(() => buildWhere(T, { tuNgay: "2028-02-29" })).not.toThrow();
  });
});

// U6 unit — validate bộ lọc/phân trang (Zod, thuần, offline) + fail-loud ngày sai.
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  MAX_EXPORT_IDS,
  buildWhere,
  dayBoundaryVn,
  exportSelectionSchema,
  invoiceFilterSchema,
  pageSchema,
} from "../../src/filters";

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

// BUG lọc-dư-1-ngày (2026-07-20): `tdlap` lưu là khoảnh khắc UTC của ngày VN — hoá đơn
// VN ngày D lưu `(D-1)T17:00:00Z` (bằng chứng prod: VN 18/07 → 17/07T17:00Z). Biên lọc
// PHẢI theo giờ VN (UTC+7); nếu dựng bằng UTC (`Z`) thì cửa sổ dịch 7h → dư ngày cuối +
// thiếu ngày đầu (chọn [1,2] trả [2,3]).
describe("dayBoundaryVn — biên ngày theo giờ VN (UTC+7)", () => {
  it("đầu ngày VN = 00:00+07:00 = 17:00Z hôm TRƯỚC", () => {
    expect(dayBoundaryVn("2026-07-01", false).toISOString()).toBe("2026-06-30T17:00:00.000Z");
  });
  it("cuối ngày VN = 23:59:59.999+07:00 = 16:59:59.999Z cùng ngày", () => {
    expect(dayBoundaryVn("2026-07-02", true).toISOString()).toBe("2026-07-02T16:59:59.999Z");
  });
  it("khoảng [01→02]: upper KHÔNG chạm hoá đơn VN ngày 03 (tdlap 2026-07-02T17:00Z)", () => {
    // Đây là chốt chặn triệu chứng: denNgay=02 không được lọt VN-ngày-03.
    expect(dayBoundaryVn("2026-07-02", true).getTime()).toBeLessThan(
      Date.parse("2026-07-02T17:00:00.000Z"),
    );
  });
  it("khoảng [01→02]: lower CHẠM hoá đơn VN ngày 01 (tdlap 2026-06-30T17:00Z)", () => {
    // Không được rớt ngày đầu: tuNgay=01 phải bao được VN-ngày-01.
    expect(dayBoundaryVn("2026-07-01", false).getTime()).toBeLessThanOrEqual(
      Date.parse("2026-06-30T17:00:00.000Z"),
    );
  });
  it("vẫn fail-loud ngày phi thực tế (2026-02-30)", () => {
    expect(() => dayBoundaryVn("2026-02-30", false)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// U30 — chọn dòng để xuất. `ids` do CLIENT gửi lên ⇒ input không tin cậy.
// Bất biến an toàn: ids chỉ THU HẸP tập, không bao giờ MỞ RỘNG — `tenant_id` luôn là
// điều kiện đầu tiên trong buildWhere và không thể bị ids ghi đè.
// ---------------------------------------------------------------------------

describe("U30 — exportSelectionSchema (danh sách ID chọn tay)", () => {
  const ID_A = "11111111-1111-4111-8111-111111111111";
  const ID_B = "22222222-2222-4222-8222-222222222222";

  it("chấp nhận mảng uuid hợp lệ", () => {
    expect(exportSelectionSchema.parse({ ids: [ID_A, ID_B] }).ids).toEqual([ID_A, ID_B]);
  });

  it("thiếu ids / body rỗng → hợp lệ, ids undefined (giữ hành vi xuất theo bộ lọc)", () => {
    expect(exportSelectionSchema.parse({}).ids).toBeUndefined();
  });

  it("từ chối phần tử không phải uuid (chống nhét chuỗi tùy ý vào IN)", () => {
    expect(() => exportSelectionSchema.parse({ ids: ["không-phải-uuid"] })).toThrow();
    expect(() => exportSelectionSchema.parse({ ids: [ID_A, "1 OR 1=1"] })).toThrow();
  });

  it("từ chối mảng rỗng (client phải bỏ hẳn ids, không gửi mảng rỗng mơ hồ)", () => {
    expect(() => exportSelectionSchema.parse({ ids: [] })).toThrow();
  });

  it(`từ chối quá MAX_EXPORT_IDS (${MAX_EXPORT_IDS})`, () => {
    const vua = Array.from({ length: MAX_EXPORT_IDS }, () => ID_A);
    const qua = Array.from({ length: MAX_EXPORT_IDS + 1 }, () => ID_A);
    expect(() => exportSelectionSchema.parse({ ids: vua })).not.toThrow();
    expect(() => exportSelectionSchema.parse({ ids: qua })).toThrow();
  });
});

describe("U30 — buildWhere với ids", () => {
  const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ID_A = "11111111-1111-4111-8111-111111111111";

  // Dựng SQL THẬT (sql + params) thay vì soi object — chỉ cách này mới chứng minh được
  // tenant_id nằm trong câu lệnh và ids đi qua tham số bind chứ không nối chuỗi.
  const render = (sel: Parameters<typeof buildWhere>[1]) =>
    new PgDialect().sqlToQuery(buildWhere(TENANT, sel));

  it("có ids → GIAO thêm điều kiện id, KHÔNG thay thế điều kiện tenant_id", () => {
    const q = render({ ids: [ID_A] });
    expect(q.sql).toContain("tenant_id");
    expect(q.sql).toContain(" in ");
    // Bất biến an toàn: tenant vẫn là tham số của câu lệnh, ids chỉ thu hẹp thêm.
    expect(q.params).toContain(TENANT);
    expect(q.params).toContain(ID_A);
  });

  it("ids đi qua tham số BIND, không nối chuỗi vào câu lệnh", () => {
    const q = render({ ids: [ID_A] });
    expect(q.sql).not.toContain(ID_A);
  });

  it("không có ids → câu lệnh y hệt bộ lọc thường (không hồi quy U6)", () => {
    expect(render({ chieu: "sold" }).sql).toBe(render({ chieu: "sold", ids: undefined }).sql);
  });

  it("ids rỗng → KHÔNG sinh mệnh đề IN (tránh 'IN ()' luôn sai)", () => {
    expect(render({ ids: [] }).sql).not.toContain(" in ");
  });
});

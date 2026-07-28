// U6 unit — validate bộ lọc/phân trang (Zod, thuần, offline) + fail-loud ngày sai.
import { TTHAI, sortableKeys } from "@vat/domain";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  MAX_EXPORT_IDS,
  SORT_BY_VALUES,
  buildOrderBy,
  buildWhere,
  cotSapXep,
  dayBoundaryVn,
  exportSelectionSchema,
  invoiceFilterSchema,
  kiemAllowlistKhopRegistry,
  pageSchema,
  sortSchema,
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

// ---------------------------------------------------------------------------
// U31 — lọc & sắp xếp theo cột. RỦI RO LỚN NHẤT: tên cột sắp xếp đến từ client và đi vào
// ORDER BY. Nội suy chuỗi vào đó là injection trực tiếp — phải qua ALLOWLIST.
// ---------------------------------------------------------------------------

describe("U31 — sortSchema (allowlist cột sắp xếp)", () => {
  it("chấp nhận cột hợp lệ + hai chiều", () => {
    expect(sortSchema.parse({ sortBy: "nbten", sortDir: "asc" })).toMatchObject({
      sortBy: "nbten",
      sortDir: "asc",
    });
  });

  it("mặc định chiều giảm dần khi không truyền", () => {
    expect(sortSchema.parse({}).sortDir).toBe("desc");
  });

  it("TỪ CHỐI tên cột ngoài allowlist — kể cả payload injection", () => {
    expect(() => sortSchema.parse({ sortBy: "id; drop table hoa_don" })).toThrow();
    expect(() => sortSchema.parse({ sortBy: "raw_json" })).toThrow();
    expect(() => sortSchema.parse({ sortBy: "tenant_id" })).toThrow();
    expect(() => sortSchema.parse({ sortBy: "1" })).toThrow();
  });

  it("TỪ CHỐI chiều lạ", () => {
    expect(() => sortSchema.parse({ sortBy: "tdlap", sortDir: "; --" })).toThrow();
  });

  it("KHÔNG cho sắp xếp theo cột nhạy cảm/nội bộ", () => {
    for (const k of ["tenantId", "rawJson", "createdAt"]) {
      expect(() => sortSchema.parse({ sortBy: k })).toThrow();
    }
  });
});

// U-K2 — allowlist ORDER BY nay DẪN XUẤT từ Registry miền hoá đơn (@vat/domain) thay vì
// khai tay hai nơi. Vẫn là allowlist ĐÓNG: Registry chỉ *sinh ra* danh sách khóa, khóa lạ
// vẫn bị Zod từ chối và không bao giờ có đường vào ORDER BY.
describe("U-K2 — SORT_COLUMNS dẫn xuất từ Registry, allowlist vẫn ĐÓNG", () => {
  it("tập khóa sắp xếp bằng ĐÚNG sortableKeys() của Registry", () => {
    expect([...SORT_BY_VALUES].sort()).toEqual([...sortableKeys()].sort());
  });

  it("mọi khóa Registry đều sắp xếp được thật (không khai suông)", () => {
    for (const k of sortableKeys()) {
      expect(() => sortSchema.parse({ sortBy: k })).not.toThrow();
    }
  });

  it("khóa KHÔNG có trong Registry vẫn bị từ chối (chống SQL injection)", () => {
    for (const k of ["tenantId", "rawJson", "hangHoa", "soLuong", "id; DROP TABLE hoa_don"]) {
      expect(sortableKeys()).not.toContain(k);
      expect(() => sortSchema.parse({ sortBy: k })).toThrow();
    }
  });

  // Ép DẪN XUẤT chứ không chỉ "tình cờ trùng": bảng tra key→cột Drizzle phải phủ HẾT khóa
  // Registry. Khai `sapDuoc: true` cho một trường chưa có cột ⇒ hàm này ném ngay lúc nạp
  // module, không âm thầm rơi về `tdlap` (sắp sai cột là lỗi im lặng, người dùng không thấy).
  it("mọi khóa Registry có cột Drizzle tương ứng — thiếu ánh xạ là ném, không im lặng", () => {
    for (const k of sortableKeys()) {
      expect(() => cotSapXep(k), `khóa ${k} thiếu ánh xạ cột`).not.toThrow();
    }
    expect(() => cotSapXep("khong_ton_tai")).toThrow(/ánh xạ|allowlist/i);
  });

  // Cổng chỉ đáng tin khi đã chứng minh nó BIẾT KÊU — không chỉ im lặng lúc mọi thứ khớp.
  it("cổng chống trôi kêu khi hai bên lệch, im khi trùng", () => {
    expect(() => kiemAllowlistKhopRegistry(["a", "b"], ["b", "a"])).not.toThrow();
    expect(() => kiemAllowlistKhopRegistry(["a", "b"], ["a"])).toThrow(/lệch Registry/);
    expect(() => kiemAllowlistKhopRegistry(["a"], ["a", "b"])).toThrow(/lệch Registry/);
  });
});

describe("U31 — buildOrderBy", () => {
  const render = (sql: SQL) => new PgDialect().sqlToQuery(sql);

  // Duyệt HẾT allowlist, không lấy mẫu vài cột: chỉ cần MỘT cột thiếu tie-breaker là
  // phân trang bỏ/lặp bản ghi ở đúng cột đó, và ca lấy mẫu sẽ không bắt được.
  it("MỌI cột trong allowlist đều kết thúc bằng tie-breaker `id`", () => {
    expect(SORT_BY_VALUES.length).toBeGreaterThan(0);
    for (const col of SORT_BY_VALUES) {
      for (const dir of ["asc", "desc"] as const) {
        const parts = buildOrderBy({ sortBy: col, sortDir: dir });
        const last = render(parts[parts.length - 1] as SQL).sql;
        expect(last, `cột ${col}/${dir} thiếu tie-breaker`).toContain("id");
      }
    }
  });

  // T3 — chứng minh tên cột đi vào SQL dưới dạng ĐỊNH DANH ĐƯỢC TRÍCH DẪN do Drizzle sinh,
  // không phải chuỗi client nối vào, và không có giá trị nào bị bind từ tên cột.
  it("T3 — tên cột render thành định danh trích dẫn, KHÔNG có tham số bind nào", () => {
    for (const col of SORT_BY_VALUES) {
      const q = render(buildOrderBy({ sortBy: col, sortDir: "asc" })[0] as SQL);
      expect(q.sql).toMatch(/"[a-z_]+"/); // định danh có dấu nháy kép do Drizzle sinh
      expect(q.params, `cột ${col} không được sinh tham số`).toEqual([]);
    }
  });

  it("không truyền sortBy → thứ tự MẶC ĐỊNH y hệt trước U31 (tdlap desc, id desc)", () => {
    const parts = buildOrderBy({ sortDir: "desc" });
    const sql = parts.map((p) => render(p as SQL).sql).join(", ");
    expect(sql).toContain("tdlap");
    expect(sql).toContain("id");
  });

  it("chiều asc/desc render khác nhau", () => {
    const a = render(buildOrderBy({ sortBy: "nbten", sortDir: "asc" })[0] as SQL).sql;
    const d = render(buildOrderBy({ sortBy: "nbten", sortDir: "desc" })[0] as SQL).sql;
    expect(a).not.toBe(d);
  });
});

describe("U31 — lọc văn bản theo cột", () => {
  const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const render = (sel: Parameters<typeof buildWhere>[1]) =>
    new PgDialect().sqlToQuery(buildWhere(TENANT, sel));

  it("nbten/nmten/shdon sinh mệnh đề ilike với tham số bind", () => {
    const q = render({ nbten: "tour dao" });
    expect(q.sql.toLowerCase()).toContain("ilike");
    expect(q.sql).not.toContain("tour dao"); // giá trị KHÔNG nằm trong câu lệnh
    expect(q.params.some((p) => String(p).includes("tour dao"))).toBe(true);
  });

  // Nếu không escape, "50%" thành ký tự đại diện → khớp mọi bản ghi, SAI ÂM THẦM.
  it("ESCAPE ký tự đại diện % và _ trong chuỗi người dùng nhập", () => {
    const q = render({ nbten: "50%_x" });
    const bound = q.params.map(String).find((p) => p.includes("50"));
    expect(bound).toBe("%50\\%\\_x%");
  });

  it("chuỗi rỗng → KHÔNG sinh mệnh đề lọc (tránh lọc bằng '' vô nghĩa)", () => {
    expect(render({ nbten: "" }).sql.toLowerCase()).not.toContain("ilike");
  });

  it("khoảng tiền ttbsoTu/ttbsoDen bao gồm hai đầu mút (>= và <=)", () => {
    const q = render({ ttbsoTu: "1000", ttbsoDen: "2000" });
    expect(q.sql).toContain(">=");
    expect(q.sql).toContain("<=");
  });

  it("điều kiện tenant_id VẪN đứng đầu dù thêm bao nhiêu bộ lọc cột", () => {
    const q = render({ nbten: "x", nmten: "y", shdon: "1", dvtte: "VND", ttbsoTu: "5" });
    expect(q.params[0]).toBe(TENANT);
  });
});

// U39 — cờ `biSua`: lọc riêng nhóm hóa đơn ĐÃ BỊ một hóa đơn khác sửa (mã 4 bị thay thế +
// mã 5 bị điều chỉnh). Đây là nhóm người dùng cần soi khi kê khai, và là thứ nút "Hóa đơn
// vừa thay đổi" KHÔNG trả lời được — nút đó chỉ thấy hóa đơn đổi trạng thái TRONG LÚC hệ
// thống đang theo dõi (16/17 hóa đơn mã 4 đã là mã 4 ngay lần đồng bộ đầu, đo 2026-07-29).
describe("invoiceFilterSchema + buildWhere — cờ biSua (U39)", () => {
  const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("nhận biSua=true từ query string", () => {
    const r = invoiceFilterSchema.safeParse({ biSua: "true" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.biSua).toBe(true);
  });

  // BẪY: `z.coerce.boolean()` gọi Boolean("false") = TRUE. Nếu client lỡ gửi biSua=false,
  // server sẽ lọc ngược lại ý người dùng — chỉ hiện hóa đơn lệch trong khi họ muốn xem tất
  // cả. Schema phải tự chịu được, không dựa vào client nhớ đừng gửi.
  it('chuỗi "false"/"0" → false, KHÔNG bị coerce thành true', () => {
    for (const v of ["false", "0", ""]) {
      const r = invoiceFilterSchema.safeParse({ biSua: v });
      expect(r.success, `biSua=${v}`).toBe(true);
      expect(r.success && r.data.biSua, `biSua=${v}`).toBeFalsy();
    }
  });

  it('chuỗi "true"/"1" → true', () => {
    for (const v of ["true", "1"]) {
      const r = invoiceFilterSchema.safeParse({ biSua: v });
      expect(r.success && r.data.biSua, `biSua=${v}`).toBe(true);
    }
  });

  it("không truyền → undefined, KHÔNG sinh mệnh đề lọc", () => {
    const r = invoiceFilterSchema.safeParse({});
    expect(r.success && r.data.biSua).toBeUndefined();
  });

  it("biSua=true → SQL lọc đúng hai mã 4 và 5, KHÔNG đụng mã 1/2/3", () => {
    const sql = new PgDialect().sqlToQuery(buildWhere(TENANT, { biSua: true }));
    expect(sql.sql).toContain("in (");
    // Tham số hóa: giá trị mã nằm ở params, không nối chuỗi.
    expect(sql.params).toContain(TTHAI.BI_THAY_THE);
    expect(sql.params).toContain(TTHAI.BI_DIEU_CHINH);
    expect(sql.params).not.toContain(TTHAI.THAY_THE);
    expect(sql.params).not.toContain(TTHAI.GOC);
  });

  it("biSua=false → KHÔNG lọc gì (không vô tình đảo thành 'chỉ hóa đơn lành')", () => {
    const co = new PgDialect().sqlToQuery(buildWhere(TENANT, { biSua: true })).sql;
    const khong = new PgDialect().sqlToQuery(buildWhere(TENANT, { biSua: false })).sql;
    expect(khong).not.toBe(co);
    expect(khong).toBe(new PgDialect().sqlToQuery(buildWhere(TENANT, {})).sql);
  });

  it("kết hợp được với bộ lọc kỳ — vẫn giữ lọc tenant", () => {
    const sql = new PgDialect().sqlToQuery(
      buildWhere(TENANT, { biSua: true, tuNgay: "2026-07-01", denNgay: "2026-07-31" }),
    );
    expect(sql.params).toContain(TENANT);
    expect(sql.sql).toContain("in (");
  });
});

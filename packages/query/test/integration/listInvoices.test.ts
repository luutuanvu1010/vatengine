import { withTenant } from "@vat/db";
// U6 integration (PGlite) — tra cứu + lọc + phân trang trên hóa đơn đã lưu.
import { beforeEach, describe, expect, it } from "vitest";
import { invoiceFilterSchema } from "../../src/filters";
import { listInvoices } from "../../src/listInvoices";
import { summarizeInvoices } from "../../src/summarize";
import { type Db, freshDb, makeTenant, seedInvoice, seedLine } from "../helpers";

const PAGE = { limit: 50, offset: 0 };

describe("listInvoices (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");

    // Tenant A: 3 hóa đơn khác chiều/nguồn/ngày/ttxly/nbmst.
    await seedInvoice(db, tenantA, {
      shdon: "1",
      tdlap: new Date("2026-04-10T08:00:00Z"),
      chieu: "purchase",
      nguon: "normal",
      ttxly: 8,
      nbmst: "0100000001",
    });
    await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-12T09:00:00Z"),
      chieu: "sold",
      nguon: "normal",
      ttxly: 8,
      nbmst: "0100000009",
    });
    await seedInvoice(db, tenantA, {
      shdon: "3",
      tdlap: new Date("2026-04-15T10:00:00Z"),
      chieu: "purchase",
      nguon: "sco",
      ttxly: 6,
      nbmst: "0100000002",
    });

    // Tenant B: 2 hóa đơn (trùng shdon với A để bắt lỗi rò tenant nếu có).
    await seedInvoice(db, tenantB, { shdon: "1", tdlap: new Date("2026-04-11T08:00:00Z") });
    await seedInvoice(db, tenantB, {
      shdon: "2",
      tdlap: new Date("2026-04-13T08:00:00Z"),
      chieu: "sold",
    });
  });

  it("trả đúng hóa đơn của tenant + sắp tdlap giảm dần", async () => {
    const r = await listInvoices(db, tenantA, {}, PAGE);
    expect(r.total).toBe(3);
    expect(r.rows.map((x) => x.shdon)).toEqual(["3", "2", "1"]); // desc tdlap
    expect(r.rows.every((x) => x.tenantId === tenantA)).toBe(true);
  });

  it("phân trang: limit/offset đúng, total giữ nguyên tổng khớp bộ lọc", async () => {
    const p1 = await listInvoices(db, tenantA, {}, { limit: 2, offset: 0 });
    expect(p1.total).toBe(3);
    expect(p1.rows.map((x) => x.shdon)).toEqual(["3", "2"]);
    const p2 = await listInvoices(db, tenantA, {}, { limit: 2, offset: 2 });
    expect(p2.total).toBe(3);
    expect(p2.rows.map((x) => x.shdon)).toEqual(["1"]);
  });

  it("lọc theo chieu", async () => {
    expect((await listInvoices(db, tenantA, { chieu: "purchase" }, PAGE)).total).toBe(2);
    expect((await listInvoices(db, tenantA, { chieu: "sold" }, PAGE)).total).toBe(1);
  });

  it("lọc theo nguon / ttxly / nbmst", async () => {
    expect((await listInvoices(db, tenantA, { nguon: "sco" }, PAGE)).total).toBe(1);
    expect((await listInvoices(db, tenantA, { ttxly: 6 }, PAGE)).total).toBe(1);
    expect((await listInvoices(db, tenantA, { nbmst: "0100000001" }, PAGE)).total).toBe(1);
  });

  it("lọc theo khoảng tdlap (bao gồm hai đầu, theo ngày UTC)", async () => {
    const only12 = await listInvoices(
      db,
      tenantA,
      { tuNgay: "2026-04-12", denNgay: "2026-04-12" },
      PAGE,
    );
    expect(only12.rows.map((x) => x.shdon)).toEqual(["2"]);
    const mid = await listInvoices(
      db,
      tenantA,
      { tuNgay: "2026-04-11", denNgay: "2026-04-14" },
      PAGE,
    );
    expect(mid.rows.map((x) => x.shdon)).toEqual(["2"]);
  });

  it("kết hợp nhiều tiêu chí (giao nhau)", async () => {
    const r = await listInvoices(db, tenantA, { chieu: "purchase", nguon: "sco" }, PAGE);
    expect(r.rows.map((x) => x.shdon)).toEqual(["3"]);
  });

  it("cách ly tenant: tenant B không thấy hóa đơn của A (kể cả trong withTenant/RLS)", async () => {
    await withTenant(db, tenantB, async (tx) => {
      const r = await listInvoices(tx, tenantB, {}, PAGE);
      expect(r.total).toBe(2);
      expect(r.rows.every((x) => x.tenantId === tenantB)).toBe(true);
    });
  });

  it("phân trang ỔN ĐỊNH khi nhiều hóa đơn TRÙNG tdlap (khóa phụ theo id) — không bỏ/lặp", async () => {
    // tdlap GDT chỉ tới giây → hóa đơn phát hành theo lô trùng tdlap chính xác. Thiếu
    // tie-breaker → sắp không xác định → phân trang bỏ/lặp bản ghi.
    const tenantC = await makeTenant(db, "Cty C", "0100000123");
    const same = new Date("2026-05-01T03:00:00Z");
    for (const s of ["10", "11", "12", "13", "14"]) {
      await seedInvoice(db, tenantC, { shdon: s, tdlap: same });
    }
    // Duyệt hết bằng phân trang limit=2 → hợp của các trang phải là 5 id PHÂN BIỆT.
    const seen = new Set<string>();
    for (let offset = 0; offset < 5; offset += 2) {
      const p = await listInvoices(db, tenantC, {}, { limit: 2, offset });
      for (const row of p.rows) seen.add(row.id);
    }
    expect(seen.size).toBe(5); // không lặp, không bỏ sót

    // Thứ tự trong nhóm trùng tdlap phải xác định (id giảm dần) — chứng minh có tie-breaker.
    const all = await listInvoices(db, tenantC, {}, PAGE);
    const ids = all.rows.map((x) => x.id);
    expect([...ids].sort((a, b) => (a < b ? 1 : -1))).toEqual(ids);
  });
});

// ---------------------------------------------------------------------------
// U31 — lọc & sắp xếp theo cột, chạy thật trên PGlite.
// ---------------------------------------------------------------------------

describe("U31 — lọc theo cột (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;
  const PAGE = { limit: 50, offset: 0 };

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    await seedInvoice(db, tenantA, { shdon: "1001", nbten: "Công ty Xăng Dầu", tgtttbso: "1000" });
    await seedInvoice(db, tenantA, { shdon: "1002", nbten: "CÔNG TY ĐIỆN LỰC", tgtttbso: "5000" });
    await seedInvoice(db, tenantA, { shdon: "2001", nbten: "Giảm giá 50% Co", tgtttbso: "9000" });
  });

  const ten = async (f: Parameters<typeof listInvoices>[2]) =>
    (await listInvoices(db, tenantA, f, PAGE)).rows.map((r) => r.shdon).sort();

  it("T4 — nbten 'chứa', KHÔNG phân biệt hoa thường", async () => {
    expect(await ten({ nbten: "công ty" })).toEqual(["1001", "1002"]);
    expect(await ten({ nbten: "CÔNG TY" })).toEqual(["1001", "1002"]);
  });

  // Nếu quên escape, '%' thành ký tự đại diện → khớp CẢ 3 bản ghi, sai âm thầm.
  it("T5 — ký tự '%' trong chuỗi tìm được hiểu theo NGHĨA ĐEN", async () => {
    expect(await ten({ nbten: "50%" })).toEqual(["2001"]);
  });

  it("T5b — ký tự '_' cũng theo nghĩa đen (không phải 'một ký tự bất kỳ')", async () => {
    // "C_ng" nếu không escape sẽ khớp "Công"; escape rồi thì không khớp gì.
    expect(await ten({ nbten: "C_ng" })).toEqual([]);
  });

  it("shdon lọc 'chứa' — tìm theo tiền tố số hóa đơn", async () => {
    expect(await ten({ shdon: "100" })).toEqual(["1001", "1002"]);
  });

  it("T6 — khoảng tiền bao gồm HAI đầu mút", async () => {
    expect(await ten({ ttbsoTu: "1000", ttbsoDen: "5000" })).toEqual(["1001", "1002"]);
    expect(await ten({ ttbsoTu: "5000" })).toEqual(["1002", "2001"]);
    expect(await ten({ ttbsoDen: "1000" })).toEqual(["1001"]);
  });

  it("chuỗi rỗng → KHÔNG lọc (trả đủ), không phải lọc bằng rỗng", async () => {
    expect(await ten({ nbten: "" })).toEqual(["1001", "1002", "2001"]);
  });

  it("T9 — CÁCH LY tenant giữ nguyên với bộ lọc cột mới", async () => {
    await seedInvoice(db, tenantB, { shdon: "1001", nbten: "Công ty Xăng Dầu" });
    await withTenant(db, tenantA, async (tx) => {
      const r = await listInvoices(tx, tenantA, { nbten: "công ty" }, PAGE);
      expect(r.rows.length).toBe(2); // không lẫn bản ghi trùng tên của B
      expect(r.total).toBe(2);
    });
  });
});

describe("U31 — sắp xếp theo cột (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    await seedInvoice(db, tenantA, { shdon: "1", nbten: "Cty C", tgtttbso: "300" });
    await seedInvoice(db, tenantA, { shdon: "2", nbten: "Cty A", tgtttbso: "100" });
    await seedInvoice(db, tenantA, { shdon: "3", nbten: "Cty B", tgtttbso: "200" });
  });

  const PAGE = { limit: 50, offset: 0 };

  it("T7 — sắp theo nbten tăng/giảm đúng thứ tự", async () => {
    const asc = await listInvoices(db, tenantA, {}, PAGE, { sortBy: "nbten", sortDir: "asc" });
    expect(asc.rows.map((r) => r.nbten)).toEqual(["Cty A", "Cty B", "Cty C"]);
    const desc = await listInvoices(db, tenantA, {}, PAGE, { sortBy: "nbten", sortDir: "desc" });
    expect(desc.rows.map((r) => r.nbten)).toEqual(["Cty C", "Cty B", "Cty A"]);
  });

  it("sắp theo tiền — numeric so sánh theo SỐ, không theo chuỗi", async () => {
    // Nếu so như chuỗi thì "100" < "200" < "300" trùng hợp đúng; dùng giá trị bẫy:
    await seedInvoice(db, tenantA, { shdon: "4", nbten: "Cty D", tgtttbso: "1000" });
    const r = await listInvoices(db, tenantA, {}, PAGE, { sortBy: "tgtttbso", sortDir: "asc" });
    expect(r.rows.map((x) => x.tgtttbso)).toEqual(["100", "200", "300", "1000"]);
  });

  it("T12 — không truyền sort → thứ tự MẶC ĐỊNH y hệt trước U31 (tdlap desc)", async () => {
    const cu = await listInvoices(db, tenantA, {}, PAGE);
    const moi = await listInvoices(db, tenantA, {}, PAGE, { sortDir: "desc" });
    expect(cu.rows.map((r) => r.id)).toEqual(moi.rows.map((r) => r.id));
  });

  // Bẫy phân trang: sắp theo cột có NHIỀU giá trị trùng. Thiếu tie-breaker `id` thì
  // Postgres tự do đổi thứ tự giữa hai truy vấn → trang 2 lặp hoặc bỏ bản ghi.
  it("T8 — sắp theo cột TRÙNG giá trị: hai trang không bỏ, không lặp", async () => {
    const db2 = await freshDb();
    const t = await makeTenant(db2, "Cty T", "0100000002");
    for (let i = 0; i < 10; i++) {
      await seedInvoice(db2, t, { shdon: `s${i}`, nbten: "TRÙNG HẾT" });
    }
    const sort = { sortBy: "nbten", sortDir: "asc" } as const;
    const p1 = await listInvoices(db2, t, {}, { limit: 5, offset: 0 }, sort);
    const p2 = await listInvoices(db2, t, {}, { limit: 5, offset: 5 }, sort);
    const ids = [...p1.rows, ...p2.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(10); // không lặp
    expect(ids.length).toBe(10); // không sót
  });
});

describe("U31 — T10: tổng hợp và danh sách KHỚP nhau trên cùng bộ lọc cột", () => {
  // Vì sao đáng một test riêng: nếu lọc cột đi qua hệ khác với bộ lọc chung, con số
  // "Tổng thanh toán" dưới bảng sẽ nói khác những gì bảng đang hiện — với phần mềm kế
  // toán đó là lỗi niềm tin, không phải lỗi hiển thị.
  let db: Db;
  let tenantA: string;
  const PAGE = { limit: 50, offset: 0 };

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    await seedInvoice(db, tenantA, { shdon: "1", nbten: "Alpha", tgtttbso: "1000" });
    await seedInvoice(db, tenantA, { shdon: "2", nbten: "Alpha", tgtttbso: "2000" });
    await seedInvoice(db, tenantA, { shdon: "3", nbten: "Beta", tgtttbso: "9000" });
  });

  it("lọc cột nbten → count của summarize khớp total của listInvoices", async () => {
    const loc = { nbten: "alpha" };
    const ds = await listInvoices(db, tenantA, loc, PAGE);
    const tong = await summarizeInvoices(db, tenantA, loc);
    expect(ds.total).toBe(2);
    expect(tong.total.count).toBe(2);
    expect(tong.total.tongTtbso).toBe("3000"); // 1000 + 2000, KHÔNG gồm Beta
  });

  it("lọc khoảng tiền → hai bên vẫn khớp", async () => {
    const loc = { ttbsoTu: "2000" };
    const ds = await listInvoices(db, tenantA, loc, PAGE);
    const tong = await summarizeInvoices(db, tenantA, loc);
    expect(ds.total).toBe(tong.total.count);
  });
});

describe("U31 — trần độ dài ô lọc (phòng thủ DoS)", () => {
  it("chuỗi lọc quá dài bị Zod từ chối (ilike '%…%' quét tuần tự)", () => {
    const qua = "x".repeat(201);
    expect(invoiceFilterSchema.safeParse({ nbten: qua }).success).toBe(false);
    expect(invoiceFilterSchema.safeParse({ shdon: qua }).success).toBe(false);
    // Vừa trần thì vẫn chấp nhận — không chặn nhầm ca dùng hợp lệ.
    expect(invoiceFilterSchema.safeParse({ nbten: "x".repeat(200) }).success).toBe(true);
  });
});

describe("U31 — T9b: cách ly tenant giữ nguyên khi có SẮP XẾP theo cột mới", () => {
  // T9 gốc chỉ phủ bộ lọc. Sắp xếp không đụng WHERE nên về lý thuyết an toàn — nhưng
  // "về lý thuyết" không phải bằng chứng (Hiến pháp §Nguyên tắc bằng chứng).
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    await seedInvoice(db, tenantA, { shdon: "A1", nbten: "Zeta" });
    await seedInvoice(db, tenantB, { shdon: "B1", nbten: "Alpha" }); // sắp asc sẽ đứng TRƯỚC
  });

  it("sắp asc theo nbten: A không thấy bản ghi của B dù nó đứng đầu thứ tự", async () => {
    await withTenant(db, tenantA, async (tx) => {
      const r = await listInvoices(
        tx,
        tenantA,
        {},
        { limit: 50, offset: 0 },
        {
          sortBy: "nbten",
          sortDir: "asc",
        },
      );
      expect(r.rows.map((x) => x.shdon)).toEqual(["A1"]);
      expect(r.total).toBe(1);
    });
  });
});

describe("Danh sách — mỗi mặt hàng đi KÈM số lượng của chính nó (nghiệm thu 2026-07-20)", () => {
  // Lỗi gốc: tên hàng và số lượng đi bằng HAI đường riêng (tenHangDau + tongSoLuong) nên
  // bảng hiện "Xăng E10" cạnh 62.925 — trong khi 62.925 là TỔNG của hai mặt hàng. Người
  // đọc hiểu sai rằng riêng xăng E10 có 62.925 lít. Nay tên/số lượng/ĐVT đi CÙNG một
  // cấu trúc nên không thể lệch nhau.
  let db: Db;
  let tenantA: string;
  const PAGE = { limit: 50, offset: 0 };

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  it("trả từng mặt hàng kèm ĐÚNG số lượng và đơn vị của nó, theo thứ tự stt", async () => {
    const id = await seedInvoice(db, tenantA, { shdon: "1" });
    await seedLine(db, tenantA, id, { stt: 2, ten: "Dầu Điêzen", sluong: "20.433", dvtinh: "Lít" });
    await seedLine(db, tenantA, id, { stt: 1, ten: "Xăng E10", sluong: "42.492", dvtinh: "Lít" });

    const [r] = (await listInvoices(db, tenantA, {}, PAGE)).rows;
    expect(r?.hangHoa).toEqual([
      { ten: "Xăng E10", sluong: "42.492", dvtinh: "Lít" },
      { ten: "Dầu Điêzen", sluong: "20.433", dvtinh: "Lít" },
    ]);
    // Tổng vẫn đúng, nhưng nay là con số RIÊNG chứ không bị hiểu là của mặt hàng đầu.
  });

  it("hóa đơn chưa có dòng hàng → mảng RỖNG (không null)", async () => {
    await seedInvoice(db, tenantA, { shdon: "2" });
    const [r] = (await listInvoices(db, tenantA, {}, PAGE)).rows;
    expect(r?.hangHoa).toEqual([]);
  });

  it("cách ly tenant: không gom mặt hàng của tenant khác", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000009");
    const id = await seedInvoice(db, tenantA, { shdon: "3" });
    await seedLine(db, tenantA, id, { stt: 1, ten: "Của A", sluong: "1" });
    await seedLine(db, tenantB, id, { stt: 2, ten: "Của B", sluong: "99" });
    const [r] = (await listInvoices(db, tenantA, {}, PAGE)).rows;
    expect(r?.hangHoa.map((h) => h.ten)).toEqual(["Của A"]);
  });

  it("dòng hàng thiếu số lượng vẫn xuất hiện (không im lặng bỏ mặt hàng)", async () => {
    const id = await seedInvoice(db, tenantA, { shdon: "4" });
    await seedLine(db, tenantA, id, { stt: 1, ten: "Dịch vụ trọn gói", sluong: null });
    const [r] = (await listInvoices(db, tenantA, {}, PAGE)).rows;
    expect(r?.hangHoa).toEqual([{ ten: "Dịch vụ trọn gói", sluong: null, dvtinh: "cái" }]);
  });
});

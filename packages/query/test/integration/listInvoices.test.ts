import { withTenant } from "@vat/db";
// U6 integration (PGlite) — tra cứu + lọc + phân trang trên hóa đơn đã lưu.
import { beforeEach, describe, expect, it } from "vitest";
import { listInvoices } from "../../src/listInvoices";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

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

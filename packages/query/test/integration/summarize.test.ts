// U6 integration (PGlite) — tổng hợp (count + sum tiền) gom theo chiều. Tiền giữ
// dạng CHUỖI (cột numeric) — không ép float (mục 7.1: tránh sai số).
import { beforeEach, describe, expect, it } from "vitest";
import { summarizeInvoices } from "../../src/summarize";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

describe("summarizeInvoices (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  it("gom theo chiều: count + sum tiền đúng; tổng chung khớp", async () => {
    // purchase: 2 hóa đơn.
    await seedInvoice(db, tenantA, {
      shdon: "1",
      chieu: "purchase",
      tgtcthue: "1000000",
      tgtthue: "80000",
      tgtttbso: "1080000",
    });
    await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-13T09:00:00Z"),
      chieu: "purchase",
      tgtcthue: "2000000",
      tgtthue: "160000",
      tgtttbso: "2160000",
    });
    // sold: 1 hóa đơn.
    await seedInvoice(db, tenantA, {
      shdon: "3",
      chieu: "sold",
      tgtcthue: "5000000",
      tgtthue: "400000",
      tgtttbso: "5400000",
    });

    const s = await summarizeInvoices(db, tenantA, {});

    const purchase = s.byChieu.find((x) => x.chieu === "purchase");
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    expect(purchase?.count).toBe(2);
    expect(Number(purchase?.tongTcthue)).toBe(3000000);
    expect(Number(purchase?.tongTthue)).toBe(240000);
    expect(typeof purchase?.tongTcthue).toBe("string"); // giữ chuỗi (không float)
    expect(sold?.count).toBe(1);
    expect(Number(sold?.tongTtbso)).toBe(5400000);

    expect(s.total.count).toBe(3);
    expect(Number(s.total.tongTcthue)).toBe(8000000);
    expect(Number(s.total.tongTthue)).toBe(640000);
    expect(Number(s.total.tongTtbso)).toBe(8640000);
  });

  it("tôn trọng bộ lọc (chỉ tổng hợp phần khớp)", async () => {
    await seedInvoice(db, tenantA, { shdon: "1", chieu: "purchase", tgtttbso: "1000000" });
    await seedInvoice(db, tenantA, { shdon: "2", chieu: "sold", tgtttbso: "9000000" });
    const s = await summarizeInvoices(db, tenantA, { chieu: "purchase" });
    expect(s.total.count).toBe(1);
    expect(Number(s.total.tongTtbso)).toBe(1000000);
  });

  it("giữ chính xác số lớn hơn 2^53 (không mất số qua float)", async () => {
    // 9007199254740993 = 2^53 + 1 (không biểu diễn được bằng double). Postgres numeric
    // cộng chính xác → chuỗi "9007199254740994"; nếu code ép Number sẽ sai.
    await seedInvoice(db, tenantA, { shdon: "1", chieu: "purchase", tgtcthue: "9007199254740993" });
    await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-13T09:00:00Z"),
      chieu: "purchase",
      tgtcthue: "1",
    });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.total.tongTcthue).toBe("9007199254740994");
  });

  it("không có hóa đơn khớp → byChieu rỗng, total.count = 0", async () => {
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.byChieu).toEqual([]);
    expect(s.total.count).toBe(0);
  });
});

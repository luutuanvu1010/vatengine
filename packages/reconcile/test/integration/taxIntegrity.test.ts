// U10 integration (PGlite) — đối chiếu SỐ HỌC NỘI TẠI header (lệch thuế). Phép tính
// chạy trong SQL trên cột `numeric` (Postgres cộng chính xác) — KHÔNG ép float (mục 7.1).
// Định danh đối chiếu (đã duyệt ở plan U10): tgtcthue − ttcktmai + tgtthue = tgtttbso.
import { beforeEach, describe, expect, it } from "vitest";
import { findTaxMismatches } from "../../src/taxIntegrity";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

describe("findTaxMismatches (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  it("hóa đơn khớp số học → KHÔNG bị cờ", async () => {
    await seedInvoice(db, tenantA, {
      shdon: "1",
      tgtcthue: "1000000",
      tgtthue: "80000",
      tgtttbso: "1080000",
    });
    expect(await findTaxMismatches(db, tenantA, {})).toEqual([]);
  });

  it("hóa đơn lệch → bị cờ, `lech` là hiệu tuyệt đối chính xác", async () => {
    const id = await seedInvoice(db, tenantA, {
      shdon: "2",
      tgtcthue: "1000000",
      tgtthue: "80000",
      tgtttbso: "1090000", // lệch 10.000
    });
    const found = await findTaxMismatches(db, tenantA, {});
    expect(found).toHaveLength(1);
    expect(found[0]?.hoaDonId).toBe(id);
    expect(found[0]?.shdon).toBe("2");
    expect(found[0]?.lech).toBe("10000");
  });

  it("có chiết khấu: khớp theo tgtcthue − ttcktmai + tgtthue = tgtttbso → không cờ", async () => {
    await seedInvoice(db, tenantA, {
      shdon: "3",
      tgtcthue: "1000000",
      ttcktmai: "50000",
      tgtthue: "80000",
      tgtttbso: "1030000",
    });
    expect(await findTaxMismatches(db, tenantA, {})).toEqual([]);
  });

  it("có chiết khấu nhưng lệch → bị cờ", async () => {
    await seedInvoice(db, tenantA, {
      shdon: "4",
      tgtcthue: "1000000",
      ttcktmai: "50000",
      tgtthue: "80000",
      tgtttbso: "1040000", // đúng phải 1.030.000 → lệch 10.000
    });
    const found = await findTaxMismatches(db, tenantA, {});
    expect(found).toHaveLength(1);
    expect(found[0]?.lech).toBe("10000");
  });

  it("thiếu trường tiền (null) → KHÔNG cờ (không false-positive)", async () => {
    await seedInvoice(db, tenantA, {
      shdon: "5",
      tgtcthue: "1000000",
      tgtthue: null,
      tgtttbso: "1080000",
    });
    expect(await findTaxMismatches(db, tenantA, {})).toEqual([]);
  });

  it("dung sai: lệch trong ngưỡng → không cờ; vượt ngưỡng → cờ", async () => {
    await seedInvoice(db, tenantA, {
      shdon: "6",
      tgtcthue: "1000000",
      tgtthue: "80000",
      tgtttbso: "1080100", // lệch 100
    });
    expect(await findTaxMismatches(db, tenantA, {}, "100")).toEqual([]); // đúng biên → không cờ
    const found = await findTaxMismatches(db, tenantA, {}, "99");
    expect(found).toHaveLength(1);
    expect(found[0]?.lech).toBe("100");
  });

  it("giữ chính xác số lớn hơn 2^53 (không ép float)", async () => {
    // 9007199254740993 = 2^53 + 1 (double không biểu diễn được).
    await seedInvoice(db, tenantA, {
      shdon: "7",
      tgtcthue: "9007199254740993",
      tgtthue: "1",
      tgtttbso: "9007199254740994", // khớp chính xác
    });
    expect(await findTaxMismatches(db, tenantA, {})).toEqual([]);

    await seedInvoice(db, tenantA, {
      shdon: "8",
      tdlap: new Date("2026-04-13T09:00:00Z"),
      tgtcthue: "9007199254740993",
      tgtthue: "1",
      tgtttbso: "9007199254740995", // lệch chính xác 1
    });
    const found = await findTaxMismatches(db, tenantA, {});
    expect(found).toHaveLength(1);
    expect(found[0]?.lech).toBe("1");
  });

  it("tôn trọng bộ lọc kỳ (chỉ đối chiếu phần khớp filter)", async () => {
    await seedInvoice(db, tenantA, {
      shdon: "9",
      tdlap: new Date("2026-03-10T09:00:00Z"),
      tgtttbso: "1090000", // lệch nhưng ngoài kỳ lọc
    });
    await seedInvoice(db, tenantA, {
      shdon: "10",
      tdlap: new Date("2026-04-10T09:00:00Z"),
      tgtttbso: "1090000", // lệch, trong kỳ
    });
    const found = await findTaxMismatches(db, tenantA, {
      tuNgay: "2026-04-01",
      denNgay: "2026-04-30",
    });
    expect(found.map((f) => f.shdon)).toEqual(["10"]);
  });
});

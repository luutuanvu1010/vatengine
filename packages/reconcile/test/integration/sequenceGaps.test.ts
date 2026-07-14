// U10 integration (PGlite) — phát hiện KHOẢNG TRỐNG dãy số `shdon` cho hóa đơn ĐẦU RA
// (`chieu='sold'`). DN tự phát số nên gap có nghĩa (nghi ngờ thiếu hóa đơn). Chỉ áp cho
// đầu ra; đầu vào (số của nhiều người bán) KHÔNG xét. Nhóm theo (nbmst, khhdon).
import { beforeEach, describe, expect, it } from "vitest";
import { findSequenceGaps } from "../../src/sequenceGaps";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

// Seed hóa đơn đầu ra với shdon cho trước (tdlap phải khác nhau để không đụng khóa tự nhiên).
async function seedSold(db: Db, tenantId: string, shdon: string, over = {}) {
  const n = Number(shdon) || 0;
  return seedInvoice(db, tenantId, {
    chieu: "sold",
    shdon,
    tdlap: new Date(Date.UTC(2026, 3, 1, 0, n % 3600)),
    ...over,
  });
}

describe("findSequenceGaps (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  it("dãy liền (1,2,3) → không có khoảng trống", async () => {
    for (const s of ["1", "2", "3"]) await seedSold(db, tenantA, s);
    expect(await findSequenceGaps(db, tenantA, {})).toEqual([]);
  });

  it("thiếu số giữa dãy (1,2,4) → cờ số 3", async () => {
    for (const s of ["1", "2", "4"]) await seedSold(db, tenantA, s);
    const gaps = await findSequenceGaps(db, tenantA, {});
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.kind).toBe("thieu_so_dau_ra");
    expect(gaps[0]?.khhdon).toBe("C26TAA");
    expect(gaps[0]?.shdonThieu).toBe(3);
  });

  it("nhiều số thiếu (1,5) → cờ 2,3,4 tăng dần", async () => {
    for (const s of ["1", "5"]) await seedSold(db, tenantA, s);
    const gaps = await findSequenceGaps(db, tenantA, {});
    expect(gaps.map((g) => g.shdonThieu)).toEqual([2, 3, 4]);
  });

  it("CHỈ đầu ra: hóa đơn đầu vào có gap → KHÔNG cờ", async () => {
    await seedInvoice(db, tenantA, { chieu: "purchase", shdon: "1" });
    await seedInvoice(db, tenantA, {
      chieu: "purchase",
      shdon: "3",
      tdlap: new Date("2026-04-02T09:00:00Z"),
    });
    expect(await findSequenceGaps(db, tenantA, {})).toEqual([]);
  });

  it("hai nhóm khhdon độc lập: (C26TAA:1,3)→thiếu 2; (C26TAB:5,6)→không", async () => {
    await seedSold(db, tenantA, "1", { khhdon: "C26TAA" });
    await seedSold(db, tenantA, "3", { khhdon: "C26TAA" });
    await seedSold(db, tenantA, "5", { khhdon: "C26TAB" });
    await seedSold(db, tenantA, "6", { khhdon: "C26TAB" });
    const gaps = await findSequenceGaps(db, tenantA, {});
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.khhdon).toBe("C26TAA");
    expect(gaps[0]?.shdonThieu).toBe(2);
  });

  it("shdon không phải số nguyên → bỏ qua an toàn (không nổ, không cờ bừa)", async () => {
    await seedSold(db, tenantA, "1");
    await seedSold(db, tenantA, "ABC", { tdlap: new Date("2026-05-05T09:00:00Z") });
    await seedSold(db, tenantA, "3");
    // Chỉ {1,3} là số nguyên hợp lệ → thiếu 2.
    const gaps = await findSequenceGaps(db, tenantA, {});
    expect(gaps.map((g) => g.shdonThieu)).toEqual([2]);
  });

  it("shdon '0' (không phải số dương) → bỏ qua; gap tính trên số hợp lệ còn lại", async () => {
    await seedSold(db, tenantA, "0");
    await seedSold(db, tenantA, "1");
    await seedSold(db, tenantA, "3");
    // {1,3} hợp lệ ('0' bị loại vì ≤ 0) → thiếu 2.
    const gaps = await findSequenceGaps(db, tenantA, {});
    expect(gaps.map((g) => g.shdonThieu)).toEqual([2]);
  });

  it("trần maxGapsPerGroup: cắt có kiểm soát (không im lặng vượt trần)", async () => {
    await seedSold(db, tenantA, "1");
    await seedSold(db, tenantA, "5"); // thiếu 2,3,4
    const gaps = await findSequenceGaps(db, tenantA, {}, { maxGapsPerGroup: 1 });
    expect(gaps.map((g) => g.shdonThieu)).toEqual([2]); // dừng đúng trần 1
  });

  it("tôn trọng cách ly nhóm nbmst khác nhau", async () => {
    await seedSold(db, tenantA, "1", { nbmst: "0100000001" });
    await seedSold(db, tenantA, "3", { nbmst: "0100000002" });
    // Hai nbmst khác nhau, mỗi nhóm chỉ 1 số → không có khoảng trống trong nhóm.
    expect(await findSequenceGaps(db, tenantA, {})).toEqual([]);
  });
});

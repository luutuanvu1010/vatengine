// U7 integration (PGlite) — iterateInvoices: nạp TOÀN BỘ hóa đơn khớp bộ lọc theo lô
// keyset (tdlap, id), đúng một lần, đúng thứ tự, không lặp/không sót ở ranh giới trang —
// kể cả khi nhiều hóa đơn TRÙNG tdlap. Cách ly tenant + dùng lại bộ lọc U6. Offline.
import { withTenant } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { iterateInvoices } from "../../src/rows";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

async function collect(gen: AsyncGenerator<{ id: string; shdon: string }[]>) {
  const out: { id: string; shdon: string }[] = [];
  for await (const batch of gen) out.push(...batch);
  return out;
}

describe("iterateInvoices (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
  });

  it("phát đủ hóa đơn của tenant, đúng thứ tự tdlap desc, id desc", async () => {
    await seedInvoice(db, tenantA, { shdon: "1", tdlap: new Date("2026-04-10T08:00:00Z") });
    await seedInvoice(db, tenantA, { shdon: "2", tdlap: new Date("2026-04-12T09:00:00Z") });
    await seedInvoice(db, tenantA, { shdon: "3", tdlap: new Date("2026-04-15T10:00:00Z") });

    const all = await collect(iterateInvoices(db, tenantA, {}, 2));
    expect(all.map((r) => r.shdon)).toEqual(["3", "2", "1"]);
  });

  it("không lặp / không sót khi nhiều hóa đơn TRÙNG tdlap (qua ranh giới lô)", async () => {
    const same = new Date("2026-05-01T03:00:00Z");
    for (const s of ["10", "11", "12", "13", "14"]) {
      await seedInvoice(db, tenantA, { shdon: s, tdlap: same });
    }
    const all = await collect(iterateInvoices(db, tenantA, {}, 2)); // pageSize < tổng
    expect(new Set(all.map((r) => r.id)).size).toBe(5);
    expect(all.length).toBe(5);
  });

  it("dùng lại bộ lọc U6 (chieu/khoảng tdlap)", async () => {
    await seedInvoice(db, tenantA, { shdon: "1", chieu: "purchase" });
    await seedInvoice(db, tenantA, {
      shdon: "2",
      chieu: "sold",
      tdlap: new Date("2026-04-20T09:00:00Z"),
    });
    const sold = await collect(iterateInvoices(db, tenantA, { chieu: "sold" }, 10));
    expect(sold.map((r) => r.shdon)).toEqual(["2"]);
  });

  it("cách ly tenant: A không phát hóa đơn của B (kể cả trong withTenant/RLS)", async () => {
    await seedInvoice(db, tenantA, { shdon: "1" });
    await seedInvoice(db, tenantB, { shdon: "1" });
    await withTenant(db, tenantA, async (tx) => {
      const all = await collect(iterateInvoices(tx, tenantA, {}, 10));
      expect(all.length).toBe(1);
    });
  });

  it("tập rỗng → không phát lô nào (hoặc lô rỗng), tổng 0", async () => {
    const all = await collect(iterateInvoices(db, tenantA, {}, 10));
    expect(all.length).toBe(0);
  });
});

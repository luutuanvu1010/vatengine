// Task 4 (delta-sync) — demHoaDonTheoNguon: đếm hoa_don trong DB theo (tenant, chiều,
// kỳ tháng VN), tách theo nguồn (normal/sco). Dùng để đối chiếu với `total` GDT trong
// `decideAudit`. Offline — PGlite (không mạng thật, mirror mẫu backfillCoverage.test.ts
// / missingLines.test.ts).
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, tenants, withTenant } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { demHoaDonTheoNguon } from "../../src/audit";

const MIGRATIONS = new URL("../../../db/migrations", import.meta.url).pathname;
type Db = ReturnType<typeof drizzle>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

interface InvOpts {
  chieu: InvoiceDirection;
  nguon: "normal" | "sco";
  tdlap: string; // ISO instant UTC — test dựng sẵn theo biên giờ VN cần kiểm.
}

let shdonSeq = 0;

async function makeInvoice(db: Db, tenantId: string, o: InvOpts): Promise<void> {
  shdonSeq += 1;
  await withTenant(db, tenantId, (tx) =>
    tx.insert(hoaDon).values({
      tenantId,
      nbmst: "0100000001",
      nmmst: null,
      khmshdon: "1",
      khhdon: "C26TAA",
      shdon: String(shdonSeq),
      tdlap: new Date(o.tdlap),
      chieu: o.chieu,
      nguon: o.nguon,
      rawJson: {},
    }),
  );
}

describe("demHoaDonTheoNguon — đếm hoa_don theo nguồn (Task 4, delta-sync)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  const dem = (chieu: InvoiceDirection, period: string) =>
    withTenant(db, tenantA, (tx) => demHoaDonTheoNguon(tx, tenantA, chieu, period));

  it("đếm đúng theo nguồn (normal/sco) trong cùng kỳ + chiều", async () => {
    await makeInvoice(db, tenantA, {
      chieu: "purchase",
      nguon: "normal",
      tdlap: "2026-06-15T04:00:00Z",
    });
    await makeInvoice(db, tenantA, {
      chieu: "purchase",
      nguon: "normal",
      tdlap: "2026-06-16T04:00:00Z",
    });
    await makeInvoice(db, tenantA, {
      chieu: "purchase",
      nguon: "sco",
      tdlap: "2026-06-17T04:00:00Z",
    });

    const r = await dem("purchase", "2026-06");
    expect(r).toEqual({ normal: 2, sco: 1 });
  });

  it("nguồn không có hóa đơn nào trong kỳ → 0 (không throw)", async () => {
    await makeInvoice(db, tenantA, {
      chieu: "purchase",
      nguon: "normal",
      tdlap: "2026-06-15T04:00:00Z",
    });

    const r = await dem("purchase", "2026-06");
    expect(r).toEqual({ normal: 1, sco: 0 });
  });

  it("tách CHIỀU: hóa đơn 'sold' không lẫn vào đếm 'purchase' cùng kỳ", async () => {
    await makeInvoice(db, tenantA, {
      chieu: "purchase",
      nguon: "normal",
      tdlap: "2026-06-15T04:00:00Z",
    });
    await makeInvoice(db, tenantA, {
      chieu: "sold",
      nguon: "normal",
      tdlap: "2026-06-15T04:00:00Z",
    });

    expect(await dem("purchase", "2026-06")).toEqual({ normal: 1, sco: 0 });
    expect(await dem("sold", "2026-06")).toEqual({ normal: 1, sco: 0 });
  });

  it("biên tháng THEO GIỜ VN: tdlap 23:59 30/06 (VN) → tháng 6; 00:30 01/07 (VN) → tháng 7", async () => {
    // 30/06 23:59 giờ VN = 30/06T16:59:00Z (UTC-7h từ mốc VN) — vẫn thuộc tháng 6 VN.
    await makeInvoice(db, tenantA, {
      chieu: "purchase",
      nguon: "normal",
      tdlap: "2026-06-30T16:59:00.000Z",
    });
    // 01/07 00:30 giờ VN = 30/06T17:30:00Z — đã sang tháng 7 VN.
    await makeInvoice(db, tenantA, {
      chieu: "purchase",
      nguon: "normal",
      tdlap: "2026-06-30T17:30:00.000Z",
    });

    expect(await dem("purchase", "2026-06")).toEqual({ normal: 1, sco: 0 });
    expect(await dem("purchase", "2026-07")).toEqual({ normal: 1, sco: 0 });
  });

  it("cách ly TENANT: hóa đơn tenant B không lọt vào đếm tenant A (lọc tenant_id tường minh)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000002");
    await makeInvoice(db, tenantB, {
      chieu: "purchase",
      nguon: "normal",
      tdlap: "2026-06-15T04:00:00Z",
    });
    await makeInvoice(db, tenantA, {
      chieu: "purchase",
      nguon: "normal",
      tdlap: "2026-06-15T04:00:00Z",
    });

    expect(await dem("purchase", "2026-06")).toEqual({ normal: 1, sco: 0 });
    const b = await withTenant(db, tenantB, (tx) =>
      demHoaDonTheoNguon(tx, tenantB, "purchase", "2026-06"),
    );
    expect(b).toEqual({ normal: 1, sco: 0 });
  });

  it("period sai định dạng → ném lỗi (fail-loud)", async () => {
    await expect(dem("purchase", "2026-6")).rejects.toThrow(/YYYY-MM/);
  });
});

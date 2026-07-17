// U26 (backfill) — listInvoicesMissingLines: tập hóa đơn ĐANG THIẾU dòng hàng của một
// tài khoản (lọc tenant_id TƯỜNG MINH + MST bên-mình theo chiều: purchase→nmmst,
// sold→nbmst — hoa_don không có taikhoan_id nên MST là cầu nối tài khoản↔hóa đơn).
// Trigger backfill-lines enqueue message pha 2 từ tập này (trần limit mỗi lần gọi).
import { PGlite } from "@electric-sql/pglite";
import { dongHangHoa, hoaDon, tenants, withTenant } from "@vat/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { listInvoicesMissingLines } from "../../src/missingLines";

const MIGRATIONS = new URL("../../../db/migrations", import.meta.url).pathname;
type Db = ReturnType<typeof drizzle>;

const MST = "0100000002"; // MST bên-mình (username tài khoản thuế)

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
  chieu: "purchase" | "sold";
  nguon?: "normal" | "sco";
  nbmst?: string;
  nmmst?: string;
  tdlap?: string;
  withLines?: boolean;
}

async function makeInvoice(db: Db, tenantId: string, shdon: string, o: InvOpts): Promise<string> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(hoaDon)
      .values({
        tenantId,
        nbmst: o.nbmst ?? "0100000001",
        nmmst: o.nmmst ?? null,
        khmshdon: "1",
        khhdon: "C26TAA",
        shdon,
        tdlap: new Date(o.tdlap ?? "2026-04-12T17:00:00Z"),
        chieu: o.chieu,
        nguon: o.nguon ?? "normal",
        rawJson: {},
      })
      .returning({ id: hoaDon.id }),
  );
  const row = rows[0];
  if (!row) throw new Error("insert hoa_don không trả về id");
  if (o.withLines) {
    await withTenant(db, tenantId, (tx) =>
      tx.insert(dongHangHoa).values({ tenantId, hoaDonId: row.id, stt: 1, ten: "SP", rawJson: {} }),
    );
  }
  return row.id;
}

describe("listInvoicesMissingLines — tập hóa đơn thiếu dòng hàng (U26 backfill)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", MST);
  });

  it("chỉ trả HĐ 0 dòng hàng thuộc MST bên-mình; ref đúng nguồn; HĐ có dòng / MST khác bị loại", async () => {
    const idMua = await makeInvoice(db, tenantA, "1", { chieu: "purchase", nmmst: MST });
    await makeInvoice(db, tenantA, "2", { chieu: "purchase", nmmst: MST, withLines: true });
    await makeInvoice(db, tenantA, "3", { chieu: "purchase", nmmst: "9999999999" });
    const idBan = await makeInvoice(db, tenantA, "4", { chieu: "sold", nbmst: MST });
    await makeInvoice(db, tenantA, "5", { chieu: "sold", nbmst: "9999999999" });
    const idSco = await makeInvoice(db, tenantA, "6", {
      chieu: "purchase",
      nmmst: MST,
      nguon: "sco",
    });

    const r = await withTenant(db, tenantA, (tx) =>
      listInvoicesMissingLines(tx, tenantA, { ownMst: MST, limit: 100 }),
    );
    expect(r.tongThieu).toBe(3);
    const byId = new Map(r.candidates.map((c) => [c.hoaDonId, c]));
    expect(byId.size).toBe(3);
    expect(byId.get(idMua)?.ref).toMatchObject({ shdon: "1", source: "normal" });
    expect(byId.get(idBan)?.ref).toMatchObject({ shdon: "4", source: "normal" });
    expect(byId.get(idSco)?.ref).toMatchObject({ shdon: "6", source: "sco" });
  });

  it("tôn trọng limit (trần mỗi lần gọi) nhưng tongThieu vẫn là TỔNG thiếu", async () => {
    await makeInvoice(db, tenantA, "1", { chieu: "purchase", nmmst: MST });
    await makeInvoice(db, tenantA, "2", { chieu: "purchase", nmmst: MST });
    await makeInvoice(db, tenantA, "3", { chieu: "purchase", nmmst: MST });

    const r = await withTenant(db, tenantA, (tx) =>
      listInvoicesMissingLines(tx, tenantA, { ownMst: MST, limit: 2 }),
    );
    expect(r.candidates).toHaveLength(2);
    expect(r.tongThieu).toBe(3);
  });

  it("cách ly tenant: HĐ thiếu của tenant B không lọt vào kết quả tenant A (lọc tường minh)", async () => {
    // tenants.mst là unique — tenant B mang MST khác, nhưng DỮ LIỆU hóa đơn của B có
    // nmmst trùng MST của A (A là đối tác mua). Ranh giới phải là tenant_id, không phải MST.
    const tenantB = await makeTenant(db, "Cty B", "0100000009");
    await makeInvoice(db, tenantB, "9", { chieu: "purchase", nmmst: MST });

    const r = await withTenant(db, tenantA, (tx) =>
      listInvoicesMissingLines(tx, tenantA, { ownMst: MST, limit: 100 }),
    );
    expect(r.tongThieu).toBe(0);
    expect(r.candidates).toHaveLength(0);
  });
});

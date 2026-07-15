// U22 integration (PGlite) — fetchLinesForInvoices: nạp dong_hang_hoa cho một LÔ hóa đơn,
// gom theo hoadon_id, lọc tenant_id tường minh (multi-tenant.md), sắp theo stt.
import { dongHangHoa } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { fetchLinesForInvoices } from "../../src/lineRows";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

async function seedLine(
  db: Db,
  tenantId: string,
  hoaDonId: string,
  over: Partial<typeof dongHangHoa.$inferInsert> = {},
) {
  await db.insert(dongHangHoa).values({
    hoaDonId,
    tenantId,
    stt: 1,
    ten: "Hàng A",
    dvtinh: "cái",
    sluong: "1",
    dgia: "1000",
    thtien: "1000",
    ltsuat: "8%",
    tsuat: "0.08",
    tsuatTien: "80",
    rawJson: {},
    ...over,
  });
}

describe("fetchLinesForInvoices (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
  });

  it("gom dòng hàng theo hoadon_id, sắp theo stt", async () => {
    const inv1 = await seedInvoice(db, tenantA, { shdon: "1" });
    await seedLine(db, tenantA, inv1, { stt: 2, ten: "Hàng B" });
    await seedLine(db, tenantA, inv1, { stt: 1, ten: "Hàng A" });

    const map = await fetchLinesForInvoices(db, tenantA, [inv1]);
    const lines = map.get(inv1) ?? [];
    expect(lines.map((l) => l.ten)).toEqual(["Hàng A", "Hàng B"]);
  });

  it("hóa đơn không dòng hàng → không có entry (hoặc mảng rỗng)", async () => {
    const inv1 = await seedInvoice(db, tenantA, { shdon: "1" });
    const map = await fetchLinesForInvoices(db, tenantA, [inv1]);
    expect(map.get(inv1) ?? []).toEqual([]);
  });

  it("cách ly tenant: A không thấy dòng hàng của B dù cùng truy vấn theo id", async () => {
    const invB = await seedInvoice(db, tenantB, { shdon: "1" });
    await seedLine(db, tenantB, invB, { ten: "Hàng B bí mật" });

    const map = await fetchLinesForInvoices(db, tenantA, [invB]);
    expect(map.get(invB) ?? []).toEqual([]);
  });
});

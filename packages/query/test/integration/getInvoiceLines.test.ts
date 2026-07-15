// ĐV4 (U6) integration (PGlite) — lấy dòng hàng của một hóa đơn, trong phạm vi tenant.
// Lọc tenant_id + hoadon_id tường minh; cách ly chéo tenant; sắp theo stt.
import { dongHangHoa } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { getInvoiceLines } from "../../src/getInvoice";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

async function seedLine(
  db: Db,
  tenantId: string,
  hoaDonId: string,
  over: Partial<typeof dongHangHoa.$inferInsert> = {},
): Promise<void> {
  await db.insert(dongHangHoa).values({
    tenantId,
    hoaDonId,
    stt: 1,
    ten: "SP",
    rawJson: {},
    ...over,
  });
}

describe("getInvoiceLines (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;
  let idA: string;
  let idB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    idA = await seedInvoice(db, tenantA, { shdon: "1" });
    idB = await seedInvoice(db, tenantB, { shdon: "1" });
  });

  it("trả dòng hàng của hóa đơn trong tenant, sắp theo stt", async () => {
    await seedLine(db, tenantA, idA, { stt: 2, ten: "Dòng 2" });
    await seedLine(db, tenantA, idA, { stt: 1, ten: "Dòng 1" });

    const lines = await getInvoiceLines(db, tenantA, idA);
    expect(lines.map((l) => l.ten)).toEqual(["Dòng 1", "Dòng 2"]);
    expect(lines.every((l) => l.tenantId === tenantA)).toBe(true);
  });

  it("hóa đơn không có dòng hàng → mảng rỗng", async () => {
    expect(await getInvoiceLines(db, tenantA, idA)).toEqual([]);
  });

  it("KHÔNG trả dòng hàng của tenant khác dù truyền hoadon_id của họ (cách ly)", async () => {
    await seedLine(db, tenantB, idB, { ten: "Của B" });
    // tenant A hỏi dòng hàng của hóa đơn B → rỗng (lọc tenant_id chặn).
    expect(await getInvoiceLines(db, tenantA, idB)).toEqual([]);
  });
});

// U6 integration (PGlite) — lấy một hóa đơn header theo id, trong phạm vi tenant.
import { beforeEach, describe, expect, it } from "vitest";
import { getInvoiceById } from "../../src/getInvoice";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

describe("getInvoiceById (integration, PGlite)", () => {
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

  it("thấy hóa đơn trong tenant của mình", async () => {
    const row = await getInvoiceById(db, tenantA, idA);
    expect(row?.id).toBe(idA);
    expect(row?.tenantId).toBe(tenantA);
  });

  it("KHÔNG thấy hóa đơn của tenant khác → null (không rò chéo)", async () => {
    expect(await getInvoiceById(db, tenantA, idB)).toBeNull();
  });

  it("id không tồn tại → null", async () => {
    expect(await getInvoiceById(db, tenantA, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

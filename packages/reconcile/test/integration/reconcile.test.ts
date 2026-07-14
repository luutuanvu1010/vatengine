// U10 integration (PGlite) — điều phối reconcile() gộp 3 kiểm tra + findStatusAnomalies +
// CÁCH LY TENANT (multi-tenant.md: tenant A không thấy anomaly của B, kể cả trong RLS).
import { withTenant } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { reconcile } from "../../src/reconcile";
import { findStatusAnomalies } from "../../src/statusAnomaly";
import type { StatusCodeMap } from "../../src/types";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

// Map GIẢ ĐỊNH (CHƯA KIỂM CHỨNG) — chỉ để kiểm cơ chế, KHÔNG phải mã production.
const TEST_MAP: StatusCodeMap = { huy: { tthai: [5] }, thayThe: { tthai: [3] } };

describe("findStatusAnomalies (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  it("map RỖNG (production) → KHÔNG cờ gì (chưa chốt mã)", async () => {
    await seedInvoice(db, tenantA, { shdon: "1", tthai: 5 });
    expect(await findStatusAnomalies(db, tenantA, {}, { huy: {}, thayThe: {} })).toEqual([]);
  });

  it("map giả định → phân loại hủy/thay thế đúng, bỏ qua hóa đơn gốc", async () => {
    const idHuy = await seedInvoice(db, tenantA, { shdon: "1", tthai: 5 });
    const idThay = await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-13T09:00:00Z"),
      tthai: 3,
    });
    await seedInvoice(db, tenantA, {
      shdon: "3",
      tdlap: new Date("2026-04-14T09:00:00Z"),
      tthai: 1,
    });
    const found = await findStatusAnomalies(db, tenantA, {}, TEST_MAP);
    const byId = new Map(found.map((f) => [f.hoaDonId, f.kind]));
    expect(byId.get(idHuy)).toBe("huy");
    expect(byId.get(idThay)).toBe("thay_the");
    expect(found).toHaveLength(2); // hóa đơn gốc (tthai=1) không cờ
  });
});

describe("reconcile (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
  });

  it("gộp lệch thuế + thiếu số đầu ra + trạng thái; summary đếm đúng", async () => {
    // Lệch thuế:
    await seedInvoice(db, tenantA, { shdon: "1", tgtttbso: "1090000" });
    // Đầu ra thiếu số (1,3 → thiếu 2):
    await seedInvoice(db, tenantA, {
      shdon: "1",
      khhdon: "C26SOLD",
      chieu: "sold",
      tdlap: new Date("2026-04-05T09:00:00Z"),
    });
    await seedInvoice(db, tenantA, {
      shdon: "3",
      khhdon: "C26SOLD",
      chieu: "sold",
      tdlap: new Date("2026-04-06T09:00:00Z"),
    });
    // Trạng thái hủy (dùng map giả định qua opts):
    await seedInvoice(db, tenantA, {
      shdon: "9",
      tdlap: new Date("2026-04-07T09:00:00Z"),
      tthai: 5,
    });

    const report = await reconcile(db, tenantA, {}, { statusCodeMap: TEST_MAP });
    expect(report.summary.lechThue).toBe(1);
    expect(report.summary.thieuSoDauRa).toBe(1);
    expect(report.summary.huy).toBe(1);
    expect(report.summary.thayThe).toBe(0);
    expect(report.findings).toHaveLength(3);
  });

  it("map mặc định (production RỖNG) → không sinh finding trạng thái", async () => {
    await seedInvoice(db, tenantA, { shdon: "1", tthai: 5 });
    const report = await reconcile(db, tenantA, {});
    expect(report.summary.huy).toBe(0);
    expect(report.summary.thayThe).toBe(0);
  });

  it("CÁCH LY TENANT: reconcile trong withTenant(B) chỉ thấy anomaly của B", async () => {
    // A có 1 lệch thuế; B có 1 lệch thuế khác.
    await seedInvoice(db, tenantA, { shdon: "1", tgtttbso: "1090000" });
    await seedInvoice(db, tenantB, { shdon: "1", tgtttbso: "2222222" });

    await withTenant(db, tenantB, async (tx) => {
      const report = await reconcile(tx, tenantB, {});
      expect(report.summary.lechThue).toBe(1);
      // Không finding nào rò từ A: chỉ shdon "1" của B, tổng B.
      expect(report.findings).toHaveLength(1);
    });
  });
});

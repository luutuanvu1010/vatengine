// Quyết định chủ dự án 2026-07-17 (thay quyết định U23-A "dòng hàng chỉ ở màn chi
// tiết"): DANH SÁCH hóa đơn phải hiện được Tên hàng hóa + Số lượng. listInvoices trả
// thêm tóm tắt dòng hàng cho MỖI hàng: tenHangDau (tên dòng stt nhỏ nhất), soDongHang,
// tongSoLuong (tổng sluong, numeric → chuỗi qua JSON). Lọc tenant TƯỜNG MINH ở cả
// subquery (multi-tenant.md).
import { dongHangHoa, withTenant } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { listInvoices } from "../../src/listInvoices";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

const PAGE = { limit: 50, offset: 0 };

async function seedLine(
  db: Db,
  tenantId: string,
  hoaDonId: string,
  stt: number,
  ten: string,
  sluong: string,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.insert(dongHangHoa).values({ tenantId, hoaDonId, stt, ten, sluong, rawJson: {} }),
  );
}

describe("listInvoices — tóm tắt dòng hàng cho danh sách (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;
  let hdCoDong: string;
  let hdTrong: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");

    hdCoDong = await seedInvoice(db, tenantA, {
      shdon: "1",
      tdlap: new Date("2026-04-10T08:00:00Z"),
    });
    hdTrong = await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-12T09:00:00Z"),
    });
    // HĐ nhiều dòng (bằng chứng thật HĐ 7048: 2 dòng NL/TE) — dòng stt 2 chèn TRƯỚC
    // để chốt "tên dòng ĐẦU = stt nhỏ nhất", không phải thứ tự chèn.
    await seedLine(db, tenantA, hdCoDong, 2, "VW tiêu chuẩn TE", "2");
    await seedLine(db, tenantA, hdCoDong, 1, "VW tiêu chuẩn NL", "13");

    // Tenant B có dòng hàng riêng — không được lẫn vào kết quả tenant A.
    const hdB = await seedInvoice(db, tenantB, {
      shdon: "1",
      tdlap: new Date("2026-04-10T08:00:00Z"),
    });
    await seedLine(db, tenantB, hdB, 1, "SP của B", "999");
  });

  it("mỗi hàng mang tenHangDau (stt nhỏ nhất) + soDongHang + tongSoLuong; HĐ trống → null/0", async () => {
    const r = await withTenant(db, tenantA, (tx) => listInvoices(tx, tenantA, {}, PAGE));
    const byShdon = new Map(r.rows.map((row) => [row.shdon, row]));

    const co = byShdon.get("1");
    expect(co?.tenHangDau).toBe("VW tiêu chuẩn NL");
    expect(co?.soDongHang).toBe(2);
    expect(Number(co?.tongSoLuong)).toBe(15);

    const trong = byShdon.get("2");
    expect(trong?.tenHangDau).toBeNull();
    expect(trong?.soDongHang).toBe(0);
    expect(trong?.tongSoLuong).toBeNull();
  });

  it("cách ly tenant: dòng hàng của B không lẫn vào tóm tắt của A (dù trùng shdon)", async () => {
    const r = await withTenant(db, tenantA, (tx) => listInvoices(tx, tenantA, {}, PAGE));
    const co = byShdonOf(r.rows).get("1");
    expect(co?.tenHangDau).toBe("VW tiêu chuẩn NL");
    expect(co?.soDongHang).toBe(2); // không phải 3 (dòng của B bị loại)
  });
});

function byShdonOf<T extends { shdon: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.shdon, r]));
}

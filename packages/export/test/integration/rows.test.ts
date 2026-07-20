// U7 integration (PGlite) — iterateInvoices: nạp TOÀN BỘ hóa đơn khớp bộ lọc theo lô
// keyset (tdlap, id), đúng một lần, đúng thứ tự, không lặp/không sót ở ranh giới trang —
// kể cả khi nhiều hóa đơn TRÙNG tdlap. Cách ly tenant + dùng lại bộ lọc U6. Offline.
import { withTenant } from "@vat/db";
import { listInvoices } from "@vat/query";
import { beforeEach, describe, expect, it } from "vitest";
import type { ExportRow } from "../../src/rows";
import { iterateInvoices } from "../../src/rows";
import { type Db, freshDb, makeTenant, seedInvoice, seedLine } from "../helpers";

async function collect(gen: AsyncGenerator<{ id: string; shdon: string }[]>) {
  const out: { id: string; shdon: string }[] = [];
  for await (const batch of gen) out.push(...batch);
  return out;
}

async function collectFull(gen: AsyncGenerator<ExportRow[]>): Promise<ExportRow[]> {
  const out: ExportRow[] = [];
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

// ---------------------------------------------------------------------------
// U29 — tóm tắt dòng hàng trong truy vấn export (phương án 3a).
// Dùng CHUNG lineSummarySelect với listInvoices ⇒ file xuất và bảng danh sách không
// thể lệch số. Xem docs/plans/U29-plan.md §3.1.
// ---------------------------------------------------------------------------

describe("U29 — iterateInvoices trả tóm tắt dòng hàng", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
  });

  it("tenHangDau lấy dòng stt NHỎ NHẤT; soDongHang đếm đúng", async () => {
    const id = await seedInvoice(db, tenantA, { shdon: "1" });
    // Gieo LỘN XỘN thứ tự stt để chứng minh có sắp xếp, không phải "dòng insert đầu".
    await seedLine(db, tenantA, id, { stt: 3, ten: "Hàng C", sluong: "1" });
    await seedLine(db, tenantA, id, { stt: 1, ten: "Hàng A", sluong: "2" });
    await seedLine(db, tenantA, id, { stt: 2, ten: "Hàng B", sluong: "4" });

    const [r] = await collectFull(iterateInvoices(db, tenantA, {}, 10));
    expect(r?.tenHangDau).toBe("Hàng A");
    expect(r?.soDongHang).toBe(3);
  });

  it("số lượng từng mặt hàng giữ CHUỖI + đủ thập phân (xăng dầu — E4)", async () => {
    const id = await seedInvoice(db, tenantA, { shdon: "1" });
    await seedLine(db, tenantA, id, { stt: 1, ten: "Xăng", sluong: "62.925", dvtinh: "Lít" });
    await seedLine(db, tenantA, id, { stt: 2, ten: "Dầu", sluong: "0.075", dvtinh: "Lít" });

    const [r] = await collectFull(iterateInvoices(db, tenantA, {}, 10));
    expect(r?.hangHoa).toEqual([
      { ten: "Xăng", sluong: "62.925", dvtinh: "Lít" },
      { ten: "Dầu", sluong: "0.075", dvtinh: "Lít" },
    ]);
    // CHUỖI, không ép float — numeric lớn phải giữ nguyên chính xác.
    expect(typeof r?.hangHoa[0]?.sluong).toBe("string");
  });

  it("hóa đơn CHƯA có dòng hàng → soDongHang=0, tenHangDau=null, hangHoa=[]", async () => {
    await seedInvoice(db, tenantA, { shdon: "1" });
    const [r] = await collectFull(iterateInvoices(db, tenantA, {}, 10));
    expect(r?.soDongHang).toBe(0);
    expect(r?.tenHangDau).toBeNull();
    expect(r?.hangHoa).toEqual([]);
  });

  // Bẫy drizzle đã ghi ở listInvoices.ts:50-52 — `${hoaDon.id}` render thành "id" TRẦN,
  // tự khớp d.id ⇒ mỗi hóa đơn nhận nhầm dòng hàng của hóa đơn khác, SAI ÂM THẦM.
  it("hai hóa đơn KHÔNG nhận nhầm dòng hàng của nhau", async () => {
    const idA = await seedInvoice(db, tenantA, { shdon: "100" });
    const idB = await seedInvoice(db, tenantA, {
      shdon: "200",
      tdlap: new Date("2026-04-10T08:00:00Z"),
    });
    await seedLine(db, tenantA, idA, { stt: 1, ten: "Của 100", sluong: "5" });
    await seedLine(db, tenantA, idB, { stt: 1, ten: "Của 200", sluong: "9" });
    await seedLine(db, tenantA, idB, { stt: 2, ten: "Của 200 nữa", sluong: "1" });

    const rows = await collectFull(iterateInvoices(db, tenantA, {}, 10));
    const byShdon = new Map(rows.map((r) => [r.shdon, r]));
    expect(byShdon.get("100")?.tenHangDau).toBe("Của 100");
    expect(byShdon.get("100")?.soDongHang).toBe(1);
    expect(byShdon.get("200")?.tenHangDau).toBe("Của 200");
    expect(byShdon.get("200")?.soDongHang).toBe(2);
  });

  it("cách ly tenant: tóm tắt của A không đếm dòng hàng của B", async () => {
    const idA = await seedInvoice(db, tenantA, { shdon: "1" });
    await seedLine(db, tenantA, idA, { stt: 1, ten: "Của A", sluong: "2" });
    // Dòng hàng mang tenant_id của B nhưng TRỎ vào hóa đơn của A (kịch bản dữ liệu bẩn /
    // rò rỉ) — lọc tenant tường minh trong sub-select phải loại nó ra.
    await seedLine(db, tenantB, idA, { stt: 0, ten: "Của B", sluong: "99" });

    await withTenant(db, tenantA, async (tx) => {
      const [r] = await collectFull(iterateInvoices(tx, tenantA, {}, 10));
      expect(r?.soDongHang).toBe(1);
      expect(r?.tenHangDau).toBe("Của A");
    });
  });

  it("MỘT NGUỒN SỰ THẬT: iterateInvoices và listInvoices trả cùng tóm tắt", async () => {
    const id1 = await seedInvoice(db, tenantA, { shdon: "1" });
    const id2 = await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-15T10:00:00Z"),
    });
    await seedLine(db, tenantA, id1, { stt: 1, ten: "X", sluong: "1.5" });
    await seedLine(db, tenantA, id1, { stt: 2, ten: "Y", sluong: "2.5" });
    await seedLine(db, tenantA, id2, { stt: 1, ten: "Z", sluong: "7" });

    const exported = await collectFull(iterateInvoices(db, tenantA, {}, 10));
    const listed = await listInvoices(db, tenantA, {}, { limit: 50, offset: 0 });

    const key = (r: {
      shdon: string;
      tenHangDau: string | null;
      soDongHang: number;
    }) => `${r.shdon}|${r.tenHangDau}|${r.soDongHang}`;
    expect(exported.map(key).sort()).toEqual(listed.rows.map(key).sort());
  });
});

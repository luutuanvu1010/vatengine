// U26 (pha 1) — sync() phải trả `detailCandidates`: danh sách {hoaDonId, ref} của hóa
// đơn cần lấy dòng hàng pha 2 = MỚI ∪ ĐỔI TRẠNG THÁI ∪ ĐANG THIẾU DÒNG HÀNG trong lô
// (docs/plans/U26-plan.md §2 bước C). Vế "đang thiếu" làm pha 1 TỰ LÀNH: nếu enqueue
// pha 2 lỗi sau khi header đã commit, lượt đồng bộ sau tự enqueue lại — không có hóa
// đơn kẹt 0 dòng vĩnh viễn. Hóa đơn không đổi VÀ đã có dòng hàng KHÔNG được enqueue
// lại (tránh gọi GDT vô ích — "tôn trọng máy chủ thuế").
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, taiKhoanThue, tenants, withTenant } from "@vat/db";
import { INVOICE_ENDPOINTS } from "@vat/gdt-client";
import type { GdtTransport, InvoiceRow } from "@vat/gdt-client";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { sync } from "../../src/sync";

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

async function makeTaxAccount(db: Db, tenantId: string, username: string): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  return row.id;
}

function inv(shdon: string, over: Record<string, unknown> = {}): InvoiceRow {
  return {
    nbmst: "0100000001",
    nbten: "Cty Bán X",
    nmmst: "0100000002",
    nmten: "Cty Mua Y",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon,
    tdlap: "2026-04-12T17:00:00Z",
    ncnhat: "2026-04-13T09:44:51.456Z",
    tgtcthue: 1000000,
    tgtthue: 80000,
    tgtttbso: 1080000,
    ttxly: 8,
    tthai: 1,
    _source: "normal",
    _direction: "purchase",
    ...over,
  };
}

/** Transport phục vụ purchase thường + sco (mỗi endpoint một trang, state=null). */
function makeTransport(normalRows: InvoiceRow[], scoRows: InvoiceRow[] = []): GdtTransport {
  return {
    name: "mock",
    async fetch(url: string) {
      const u = new URL(url);
      if (u.pathname === INVOICE_ENDPOINTS.purchase)
        return new Response(JSON.stringify({ datas: normalRows, state: null }), { status: 200 });
      if (u.pathname === INVOICE_ENDPOINTS.scoPurchase)
        return new Response(JSON.stringify({ datas: scoRows, state: null }), { status: 200 });
      return new Response("not found", { status: 404 });
    },
    async probe() {
      throw new Error("không dùng");
    },
  } as unknown as GdtTransport;
}

const BASE_OPTS = {
  token: "jwt-token-test",
  direction: "purchase" as const,
  dateFrom: "01/04/2026",
  dateTo: "30/04/2026",
  includeSco: false,
};

/** fetchDetail giả cho đường inline (test cần trạng thái "dòng hàng đã có"). */
function fakeDetail(ref: { shdon: string | number }) {
  return Promise.resolve([
    {
      stt: 1,
      ten: `SP của HĐ ${String(ref.shdon)}`,
      sluong: 1,
      ltsuat: "8%",
      tsuat: 0.08,
      tthue: null,
      raw: {},
    },
  ]);
}

describe("sync — detailCandidates cho queue 2 pha (U26 pha 1)", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000002");
    taikhoanId = await makeTaxAccount(db, tenantId, "0100000002");
  });

  it("hóa đơn MỚI → mỗi HĐ một candidate: hoaDonId là id thật trong DB, ref đủ 4 trường + source", async () => {
    const transport = makeTransport([inv("1"), inv("2")]);
    const r = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r.trangThai).toBe("completed");
    expect(r.detailCandidates).toHaveLength(2);

    await withTenant(db, tenantId, async (tx) => {
      const invoices = await tx.select().from(hoaDon);
      const idByShdon = new Map(invoices.map((i) => [i.shdon, i.id]));
      for (const c of r.detailCandidates) {
        expect(c.ref).toMatchObject({
          nbmst: "0100000001",
          khhdon: "C26TAA",
          khmshdon: "1",
          source: "normal",
        });
        expect(idByShdon.get(c.ref.shdon)).toBe(c.hoaDonId);
      }
    });
  });

  it("đồng bộ lại y nguyên KHI dòng hàng đã có → detailCandidates rỗng (không gọi GDT vô ích)", async () => {
    const transport = makeTransport([inv("1")]);
    // Lượt 1 lấy dòng hàng qua đường inline (điểm inject fetchDetail — hành vi cũ giữ nguyên).
    await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS, fetchDetail: fakeDetail });
    const r2 = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r2.trangThai).toBe("completed");
    expect(r2.soHdMoi).toBe(0);
    expect(r2.soHdCapNhat).toBe(0);
    expect(r2.detailCandidates).toHaveLength(0);
  });

  it("hóa đơn KHÔNG đổi nhưng ĐANG THIẾU dòng hàng → vẫn là candidate (pha 1 tự lành)", async () => {
    const transport = makeTransport([inv("1")]);
    // Lượt 1 KHÔNG có pha 2 (mô phỏng enqueue lỗi / pha 2 chưa chạy) → HĐ còn 0 dòng.
    await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });
    const r2 = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r2.soHdMoi).toBe(0);
    expect(r2.soHdCapNhat).toBe(0);
    expect(r2.detailCandidates).toHaveLength(1);
    expect(r2.detailCandidates[0]?.ref.shdon).toBe("1");
  });

  it("hóa đơn ĐỔI TRẠNG THÁI (ttxly) → candidate cho HĐ đó dù dòng hàng đã có", async () => {
    await sync({
      db,
      transport: makeTransport([inv("1"), inv("2")]),
      tenantId,
      taikhoanId,
      ...BASE_OPTS,
      fetchDetail: fakeDetail,
    });
    const r2 = await sync({
      db,
      transport: makeTransport([inv("1", { ttxly: 5 }), inv("2")]),
      tenantId,
      taikhoanId,
      ...BASE_OPTS,
    });
    expect(r2.soHdCapNhat).toBe(1);
    expect(r2.detailCandidates).toHaveLength(1);
    expect(r2.detailCandidates[0]?.ref.shdon).toBe("1");
  });

  it("hóa đơn máy tính tiền (sco) → candidate mang ref.source='sco'", async () => {
    const transport = makeTransport([inv("1")], [inv("7048", { _source: "sco" })]);
    const r = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS, includeSco: true });
    expect(r.trangThai).toBe("completed");
    const sco = r.detailCandidates.filter((c) => c.ref.source === "sco");
    expect(sco).toHaveLength(1);
    expect(sco[0]?.ref.shdon).toBe("7048");
  });
});

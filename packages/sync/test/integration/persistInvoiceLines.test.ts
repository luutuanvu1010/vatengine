// ─────────────────────────────────────────────────────────────────────────────
// ĐV3 — Test primitive persist dòng hàng (idempotent theo hoadon_id, Quyết định C)
// + hành vi 2 pha ở sync() khi fetchDetail lỗi 401.
//
// Bằng chứng nghiệp vụ (docs/CHAN-DOAN-thieu-truong-va-mtt.md, HĐ 7048 thật): một
// hóa đơn CÓ THỂ có NHIỀU dòng (NL/TE) — persist phải lưu ĐỦ mọi dòng, ánh xạ đúng
// trường, và chạy lại KHÔNG nhân đôi. Không log giá trị dòng hàng (security.md).
// ─────────────────────────────────────────────────────────────────────────────
import { PGlite } from "@electric-sql/pglite";
import { dongHangHoa, hoaDon, taiKhoanThue, tenants, withTenant } from "@vat/db";
import type { InvoiceLine, InvoiceRow } from "@vat/gdt-client";
import { INVOICE_ENDPOINTS } from "@vat/gdt-client";
import type { GdtTransport } from "@vat/gdt-client";
import { GdtError } from "@vat/gdt-client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { persistInvoiceLines } from "../../src/detailLines";
import { sync } from "../../src/sync";

const MIGRATIONS = new URL("../../../db/migrations", import.meta.url).pathname;
type Db = ReturnType<typeof drizzle>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function seed(db: Db): Promise<{ tenantId: string; taikhoanId: string; hoaDonId: string }> {
  const [t] = await db
    .insert(tenants)
    .values({ ten: "Cty A", mst: "0100000001" })
    .returning({ id: tenants.id });
  const tenantId = t?.id as string;
  const [a] = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username: "u1" })
    .returning({ id: taiKhoanThue.id });
  const taikhoanId = a?.id as string;
  const hoaDonId = await withTenant(db, tenantId, async (tx) => {
    const [h] = await tx
      .insert(hoaDon)
      .values({
        tenantId,
        nbmst: "0100000001",
        khmshdon: "1",
        khhdon: "C26TAA",
        shdon: "7048",
        tdlap: new Date("2026-06-16T00:00:00Z"),
        chieu: "purchase",
        nguon: "sco",
        rawJson: {},
      })
      .returning({ id: hoaDon.id });
    return h?.id as string;
  });
  return { tenantId, taikhoanId, hoaDonId };
}

// HĐ 7048 thật: 2 dòng NL/TE, thuế suất 8%.
const TWO_LINES: InvoiceLine[] = [
  {
    stt: 1,
    ten: "VW tiêu chuẩn NL",
    dvtinh: "Gói",
    sluong: 13,
    dgia: 100000,
    thtien: 1300000,
    ltsuat: "8%",
    tsuat: 0.08,
    tthue: 104000,
    raw: { stt: 1, ten: "VW tiêu chuẩn NL" },
  },
  {
    stt: 2,
    ten: "VW tiêu chuẩn TE",
    dvtinh: "Gói",
    sluong: 2,
    dgia: 100000,
    thtien: 200000,
    ltsuat: "8%",
    tsuat: 0.08,
    tthue: 16000,
    raw: { stt: 2, ten: "VW tiêu chuẩn TE" },
  },
];

describe("persistInvoiceLines — lưu đủ dòng, ánh xạ đúng, idempotent (ĐV3)", () => {
  let db: Db;
  let tenantId: string;
  let hoaDonId: string;

  beforeEach(async () => {
    db = await freshDb();
    ({ tenantId, hoaDonId } = await seed(db));
  });

  it("lưu ĐỦ mọi dòng của hóa đơn nhiều dòng + ánh xạ đúng trường + gắn tenant_id", async () => {
    await withTenant(db, tenantId, (tx) => persistInvoiceLines(tx, tenantId, hoaDonId, TWO_LINES));

    const rows = await db
      .select()
      .from(dongHangHoa)
      .where(and(eq(dongHangHoa.hoaDonId, hoaDonId), eq(dongHangHoa.tenantId, tenantId)));
    expect(rows.length).toBe(2);

    const nl = rows.find((r) => r.ten === "VW tiêu chuẩn NL");
    expect(nl).toBeDefined();
    expect(nl?.tenantId).toBe(tenantId);
    expect(nl?.dvtinh).toBe("Gói");
    expect(String(nl?.sluong)).toBe("13");
    expect(String(nl?.dgia)).toBe("100000");
    expect(String(nl?.thtien)).toBe("1300000");
    expect(nl?.ltsuat).toBe("8%"); // giữ chuỗi hiển thị
    expect(String(nl?.tsuat)).toBe("0.08"); // giữ số
    expect(String(nl?.tsuatTien)).toBe("104000"); // tthue → tsuat_tien
  });

  it("chạy lại (xóa-chèn theo hoadon_id) KHÔNG nhân đôi — idempotent", async () => {
    await withTenant(db, tenantId, (tx) => persistInvoiceLines(tx, tenantId, hoaDonId, TWO_LINES));
    await withTenant(db, tenantId, (tx) => persistInvoiceLines(tx, tenantId, hoaDonId, TWO_LINES));

    const rows = await db.select().from(dongHangHoa).where(eq(dongHangHoa.hoaDonId, hoaDonId));
    expect(rows.length).toBe(2); // vẫn 2, không phải 4
  });

  it("danh sách dòng rỗng → xóa sạch dòng cũ, không còn dòng nào", async () => {
    await withTenant(db, tenantId, (tx) => persistInvoiceLines(tx, tenantId, hoaDonId, TWO_LINES));
    await withTenant(db, tenantId, (tx) => persistInvoiceLines(tx, tenantId, hoaDonId, []));

    const rows = await db.select().from(dongHangHoa).where(eq(dongHangHoa.hoaDonId, hoaDonId));
    expect(rows.length).toBe(0);
  });
});

function inv(shdon: string): InvoiceRow {
  return {
    nbmst: "0100000001",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon,
    tdlap: "2026-04-12T17:00:00Z",
    _source: "normal",
    _direction: "purchase",
  } as InvoiceRow;
}

function transportListOnly(rows: InvoiceRow[]): GdtTransport {
  return {
    name: "mock",
    async fetch(url: string) {
      const u = new URL(url);
      if (u.pathname !== INVOICE_ENDPOINTS.purchase)
        return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ datas: rows, state: null }), { status: 200 });
    },
  } as unknown as GdtTransport;
}

describe("sync — 401 ở pha lấy detail → dừng session_expired, KHÔNG ghi dở dang (ĐV3)", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    ({ tenantId, taikhoanId } = await seed(db));
  });

  it("fetchDetail ném SESSION_EXPIRED → trangThai failed + failureKind session_expired, dong_hang_hoa rỗng", async () => {
    const transport = transportListOnly([inv("1")]);
    const fetchDetail = () => Promise.reject(new GdtError("Phiên hết hạn", "SESSION_EXPIRED"));
    const r = await sync({
      db,
      transport,
      tenantId,
      taikhoanId,
      token: "tok",
      direction: "purchase",
      dateFrom: "01/04/2026",
      dateTo: "30/04/2026",
      includeSco: false,
      // biome-ignore lint/suspicious/noExplicitAny: fetchDetail điểm inject.
      ...({ fetchDetail } as any),
    });
    expect(r.trangThai).toBe("failed");
    expect(r.failureKind).toBe("session_expired");

    const lines = await db.select().from(dongHangHoa).where(eq(dongHangHoa.tenantId, tenantId));
    expect(lines.length).toBe(0);
  });
});

describe("sync — CÁCH LY TENANT ở đường dòng hàng: 2 tenant TRÙNG shdon không lẫn dòng (ĐV3)", () => {
  let db: Db;

  beforeEach(async () => {
    db = await freshDb();
  });

  it("resolve hoadon_id lọc theo tenant_id → mỗi tenant chỉ thấy dòng của mình dù trùng shdon", async () => {
    // Hai tenant, CÙNG shdon "999" (nbmst/khhdon giống nhau) — nếu resolve hoadon_id
    // không lọc tenant_id, tenant B có thể ghi đè/đọc nhầm dòng của tenant A.
    const [ta] = await db
      .insert(tenants)
      .values({ ten: "Cty A", mst: "0100000001" })
      .returning({ id: tenants.id });
    const [tb] = await db
      .insert(tenants)
      .values({ ten: "Cty B", mst: "0100000002" })
      .returning({ id: tenants.id });
    const tenantA = ta?.id as string;
    const tenantB = tb?.id as string;
    const [aa] = await db
      .insert(taiKhoanThue)
      .values({ tenantId: tenantA, username: "a" })
      .returning({ id: taiKhoanThue.id });
    const [ab] = await db
      .insert(taiKhoanThue)
      .values({ tenantId: tenantB, username: "b" })
      .returning({ id: taiKhoanThue.id });

    const base = {
      token: "tok",
      direction: "purchase" as const,
      dateFrom: "01/04/2026",
      dateTo: "30/04/2026",
      includeSco: false,
    };
    const detailFor = (ten: string) => () =>
      Promise.resolve([{ ten, raw: { ten } } as InvoiceLine]);

    await sync({
      db,
      transport: transportListOnly([inv("999")]),
      tenantId: tenantA,
      taikhoanId: aa?.id as string,
      ...base,
      // biome-ignore lint/suspicious/noExplicitAny: fetchDetail điểm inject.
      ...({ fetchDetail: detailFor("Dòng của A") } as any),
    });
    await sync({
      db,
      transport: transportListOnly([inv("999")]),
      tenantId: tenantB,
      taikhoanId: ab?.id as string,
      ...base,
      // biome-ignore lint/suspicious/noExplicitAny: fetchDetail điểm inject.
      ...({ fetchDetail: detailFor("Dòng của B") } as any),
    });

    const linesA = await db.select().from(dongHangHoa).where(eq(dongHangHoa.tenantId, tenantA));
    const linesB = await db.select().from(dongHangHoa).where(eq(dongHangHoa.tenantId, tenantB));
    expect(linesA.map((l) => l.ten)).toEqual(["Dòng của A"]);
    expect(linesB.map((l) => l.ten)).toEqual(["Dòng của B"]);
  });
});

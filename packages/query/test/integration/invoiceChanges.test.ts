import { withTenant } from "@vat/db";
import { lichSuThayDoiHoaDon } from "@vat/db";
// U35 (A5) — tra cứu + đánh dấu đã đọc thay đổi trạng thái hóa đơn. Integration PGlite:
// lọc tenant/unread/khoảng ngày, phân trang, join định danh hóa đơn, mark-read chỉ đổi
// da_doc, không rò tenant khác qua ids[].
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { listInvoiceChanges, markInvoiceChangesRead } from "../../src/invoiceChanges";
import { type Db, freshDb, makeTenant, seedInvoice, seedInvoiceChange } from "../helpers";

const PAGE = { limit: 50, offset: 0 };

describe("listInvoiceChanges (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;
  let invA: string;
  let invB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    invA = await seedInvoice(db, tenantA, { shdon: "1" });
    invB = await seedInvoice(db, tenantB, { shdon: "1" });
  });

  it("cách ly tenant: chỉ trả thay đổi của tenant hỏi, không lẫn tenant khác", async () => {
    await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6 });
    await seedInvoiceChange(db, tenantB, invB, { giaTriMoi: 5 });

    const result = await listInvoiceChanges(db, tenantA, {}, PAGE);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.hoaDonId).toBe(invA);
  });

  it("kèm định danh hóa đơn qua join (khhdon/shdon/nbten) — panel không cần gọi thêm API", async () => {
    await seedInvoiceChange(db, tenantA, invA);
    const result = await listInvoiceChanges(db, tenantA, {}, PAGE);
    expect(result.rows[0]).toMatchObject({
      khmshdon: "1",
      khhdon: "C26TAA",
      shdon: "1",
      nbten: "Cty Bán",
      truong: "ttxly",
      giaTriCu: 8,
      giaTriMoi: 6,
      daDoc: false,
    });
  });

  it("unread=true → chỉ trả chưa đọc; unreadCount luôn phản ánh TOÀN BỘ tenant (không phụ thuộc filter)", async () => {
    const idDaDoc = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6, daDoc: true });
    await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 5, daDoc: false });

    const all = await listInvoiceChanges(db, tenantA, {}, PAGE);
    expect(all.total).toBe(2);
    expect(all.unreadCount).toBe(1);

    const unreadOnly = await listInvoiceChanges(db, tenantA, { unread: true }, PAGE);
    expect(unreadOnly.total).toBe(1);
    expect(unreadOnly.rows.some((r) => r.id === idDaDoc)).toBe(false);
    expect(unreadOnly.unreadCount).toBe(1);
  });

  it("lọc khoảng ngày theo phat_hien_luc (giờ VN) — trong khoảng thì có, ngoài khoảng thì không", async () => {
    await seedInvoiceChange(db, tenantA, invA, {
      giaTriMoi: 6,
      phatHienLuc: new Date("2026-04-12T10:00:00Z"), // 17:00 VN 12/04
    });
    await seedInvoiceChange(db, tenantA, invA, {
      giaTriMoi: 5,
      phatHienLuc: new Date("2026-05-01T10:00:00Z"), // ngoài khoảng
    });

    const result = await listInvoiceChanges(
      db,
      tenantA,
      { tuNgay: "2026-04-01", denNgay: "2026-04-30" },
      PAGE,
    );
    expect(result.total).toBe(1);
    expect(result.rows[0]?.giaTriMoi).toBe(6);
  });

  it("mới nhất trước (order by phat_hien_luc desc)", async () => {
    await seedInvoiceChange(db, tenantA, invA, {
      giaTriMoi: 1,
      phatHienLuc: new Date("2026-04-01T00:00:00Z"),
    });
    await seedInvoiceChange(db, tenantA, invA, {
      giaTriMoi: 2,
      phatHienLuc: new Date("2026-04-10T00:00:00Z"),
    });
    const result = await listInvoiceChanges(db, tenantA, {}, PAGE);
    expect(result.rows.map((r) => r.giaTriMoi)).toEqual([2, 1]);
  });

  it("phân trang: limit/offset đúng, total không đổi theo trang", async () => {
    for (let i = 0; i < 5; i++) {
      await seedInvoiceChange(db, tenantA, invA, {
        giaTriMoi: i,
        phatHienLuc: new Date(2026, 3, 1 + i),
      });
    }
    const page1 = await listInvoiceChanges(db, tenantA, {}, { limit: 2, offset: 0 });
    const page2 = await listInvoiceChanges(db, tenantA, {}, { limit: 2, offset: 2 });
    expect(page1.total).toBe(5);
    expect(page2.total).toBe(5);
    expect(page1.rows).toHaveLength(2);
    expect(page2.rows).toHaveLength(2);
    expect(page1.rows.map((r) => r.id)).not.toEqual(page2.rows.map((r) => r.id));
  });

  it("không có thay đổi nào → rows rỗng, total 0, unreadCount 0 (trạng thái rỗng)", async () => {
    const result = await listInvoiceChanges(db, tenantA, {}, PAGE);
    expect(result).toMatchObject({ rows: [], total: 0, unreadCount: 0 });
  });
});

describe("markInvoiceChangesRead (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;
  let invA: string;
  let invB: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    invA = await seedInvoice(db, tenantA, { shdon: "1" });
    invB = await seedInvoice(db, tenantB, { shdon: "1" });
  });

  it("không truyền ids → đánh dấu TẤT CẢ chưa đọc của tenant; chỉ đổi da_doc, không đụng trường khác", async () => {
    const id1 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6 });
    const id2 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 5 });

    const n = await withTenant(db, tenantA, (tx) => markInvoiceChangesRead(tx, tenantA));
    expect(n).toBe(2);

    const rows = await db
      .select()
      .from(lichSuThayDoiHoaDon)
      .where(eq(lichSuThayDoiHoaDon.tenantId, tenantA));
    expect(rows.every((r) => r.daDoc)).toBe(true);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(id1)?.giaTriMoi).toBe(6); // trường khác giữ nguyên
    expect(byId.get(id2)?.giaTriMoi).toBe(5);
  });

  it("truyền ids[] cụ thể → chỉ đánh dấu đúng những id đó", async () => {
    const id1 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6 });
    const id2 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 5 });

    const n = await withTenant(db, tenantA, (tx) => markInvoiceChangesRead(tx, tenantA, [id1]));
    expect(n).toBe(1);

    const rows = await db.select().from(lichSuThayDoiHoaDon);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(id1)?.daDoc).toBe(true);
    expect(byId.get(id2)?.daDoc).toBe(false);
  });

  it("id thuộc tenant KHÁC trong ids[] → KHÔNG đổi (0 hàng), không rò tồn tại chéo tenant", async () => {
    const idB = await seedInvoiceChange(db, tenantB, invB, { giaTriMoi: 6 });

    const n = await withTenant(db, tenantA, (tx) => markInvoiceChangesRead(tx, tenantA, [idB]));
    expect(n).toBe(0);

    const rows = await db.select().from(lichSuThayDoiHoaDon).where(eq(lichSuThayDoiHoaDon.id, idB));
    expect(rows[0]?.daDoc).toBe(false); // của B vẫn nguyên
  });

  it("đánh dấu lại dòng ĐÃ đọc → idempotent, không lỗi, đếm 0 hàng đổi (đã true → true không tính)", async () => {
    const id1 = await seedInvoiceChange(db, tenantA, invA, { giaTriMoi: 6, daDoc: true });
    const n = await withTenant(db, tenantA, (tx) => markInvoiceChangesRead(tx, tenantA, [id1]));
    expect(n).toBe(0);
  });
});

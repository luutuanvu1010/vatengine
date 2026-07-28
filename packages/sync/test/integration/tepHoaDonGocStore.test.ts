// U37a lát 3 — kho hồ sơ gốc: các hàm chạm DB, chạy trên PGlite với migration thật.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, tenants, tepHoaDonGoc, withTenant } from "@vat/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import {
  KHOA_TAI_NGUYEN_CHUNG,
  daCoHoSoGoc,
  ghiNhanKhongCoHoSoGoc,
  khoaHoSoGoc,
  luuTepHoaDonGoc,
} from "../../src/tepHoaDonGocStore";

const MIGRATIONS = fileURLToPath(new URL("../../../db/migrations", import.meta.url));
type Db = ReturnType<typeof drizzle>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function seed(db: Db): Promise<{ tenantId: string; hoaDonId: string }> {
  const t = await db.insert(tenants).values({ ten: "Cty A", mst: "0100000001" }).returning();
  const tenantId = t[0]?.id as string;
  const h = await db
    .insert(hoaDon)
    .values({
      tenantId,
      nbmst: "0100000001",
      khmshdon: "1",
      khhdon: "C26TQO",
      shdon: "13580",
      tdlap: new Date("2026-07-15T00:00:00Z"),
      chieu: "purchase",
      nguon: "normal",
      rawJson: {},
    })
    .returning();
  return { tenantId, hoaDonId: h[0]?.id as string };
}

describe("khoaHoSoGoc — quy ước đặt khóa R2", () => {
  it("khóa gắn tenant_id, phân biệt xml/html, và KHÔNG lẫn giữa hai hóa đơn", () => {
    const a = khoaHoSoGoc("t1", "hd1");
    const b = khoaHoSoGoc("t1", "hd2");

    expect(a.xml).toBe("hoadon-goc/t1/hd1.xml");
    expect(a.html).toBe("hoadon-goc/t1/hd1.html");
    expect(a.xml).not.toBe(b.xml);
  });

  it("tài nguyên tĩnh nằm NGOÀI thư mục tenant — dùng chung MỘT bộ cho cả kho", () => {
    // Nếu lỡ đặt trong thư mục tenant thì mất luôn ý nghĩa khử trùng lặp.
    for (const khoa of Object.values(KHOA_TAI_NGUYEN_CHUNG)) {
      expect(khoa.startsWith("hoadon-goc/_chung/")).toBe(true);
    }
  });
});

describe("kho hồ sơ gốc (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("chưa có gì → daCoHoSoGoc = false", async () => {
    const { tenantId, hoaDonId } = await seed(db);
    const co = await withTenant(db, tenantId, (tx) => daCoHoSoGoc(tx, tenantId, hoaDonId));
    expect(co).toBe(false);
  });

  it("lưu xong → daCoHoSoGoc = true, hàng mang đúng khóa + kích thước + trạng thái", async () => {
    const { tenantId, hoaDonId } = await seed(db);
    await withTenant(db, tenantId, (tx) =>
      luuTepHoaDonGoc(tx, tenantId, hoaDonId, { soByteXml: 10338, soByteHtml: 32186 }),
    );

    const co = await withTenant(db, tenantId, (tx) => daCoHoSoGoc(tx, tenantId, hoaDonId));
    expect(co).toBe(true);

    const rows = await db.select().from(tepHoaDonGoc);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trangThai).toBe("da_tai");
    expect(rows[0]?.khoaXml).toBe(`hoadon-goc/${tenantId}/${hoaDonId}.xml`);
    expect(rows[0]?.kichThuocHtml).toBe(32186);
    expect(rows[0]?.taiLuc).toBeInstanceOf(Date);
  });

  it("lưu LẠI cùng hóa đơn → idempotent: vẫn MỘT hàng (queue redelivery không nhân đôi)", async () => {
    const { tenantId, hoaDonId } = await seed(db);
    await withTenant(db, tenantId, (tx) =>
      luuTepHoaDonGoc(tx, tenantId, hoaDonId, { soByteXml: 1, soByteHtml: 2 }),
    );
    await withTenant(db, tenantId, (tx) =>
      luuTepHoaDonGoc(tx, tenantId, hoaDonId, { soByteXml: 10, soByteHtml: 20 }),
    );

    const rows = await db.select().from(tepHoaDonGoc);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kichThuocXml).toBe(10);
  });

  it("ghi nhận KHÔNG có hồ sơ gốc → daCoHoSoGoc = true (lần sau KHÔNG hỏi GDT nữa)", async () => {
    const { tenantId, hoaDonId } = await seed(db);
    await withTenant(db, tenantId, (tx) =>
      ghiNhanKhongCoHoSoGoc(tx, tenantId, hoaDonId, "NO_SOURCE_DOCUMENT"),
    );

    // Đây là điểm mấu chốt: nếu daCo trả false cho ca này, mỗi lần chạy lại sẽ gọi GDT
    // cho ĐÚNG những hóa đơn vĩnh viễn không có bản gốc — dồn máy chủ thuế vô ích.
    const co = await withTenant(db, tenantId, (tx) => daCoHoSoGoc(tx, tenantId, hoaDonId));
    expect(co).toBe(true);

    const rows = await db.select().from(tepHoaDonGoc);
    expect(rows[0]?.trangThai).toBe("khong_co_ho_so_goc");
    expect(rows[0]?.maLoi).toBe("NO_SOURCE_DOCUMENT");
    expect(rows[0]?.khoaXml).toBeNull();
  });

  it("cách ly tenant: tenant B không thấy hàng của tenant A", async () => {
    const a = await seed(db);
    await withTenant(db, a.tenantId, (tx) =>
      luuTepHoaDonGoc(tx, a.tenantId, a.hoaDonId, { soByteXml: 1, soByteHtml: 2 }),
    );
    const tb = await db.insert(tenants).values({ ten: "Cty B", mst: "0100000002" }).returning();
    const tenantB = tb[0]?.id as string;

    const co = await withTenant(db, tenantB, (tx) => daCoHoSoGoc(tx, tenantB, a.hoaDonId));
    expect(co).toBe(false);
  });
});

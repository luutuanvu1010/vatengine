// U37a lát 2 — bảng `tep_hoa_don_goc`: sổ theo dõi hồ sơ gốc từng hóa đơn đã tải về
// từ GDT và lưu ở R2. Nhóm integration (PGlite): áp migration thật lên Postgres WASM
// sạch rồi kiểm HÀNH VI, không chỉ khai báo (xem .claude/rules/testing.md).
//
// Bốn lớp bảo vệ được kiểm ở đây, mỗi lớp từng có tiền lệ hỏng thật trong dự án:
//   (1) UNIQUE (tenant_id, hoa_don_id) — nền của upsert idempotent; tải lại không nhân đôi.
//   (2) FK GHÉP same-tenant — FK chỉ trên `hoa_don_id` KHÔNG chặn được hàng trỏ sang hóa
//       đơn của tenant khác (đúng lỗ hổng `dong_hang_hoa` phải tự kiểm bằng code ở
//       packages/sync/src/detailLines.ts:76-82). Bảng này dùng FK ghép để DB tự chặn.
//   (3) RLS cho CẢ role non-owner (ENABLE) LẪN role sở hữu bảng (FORCE) — thiếu FORCE là
//       owner nhìn xuyên tenant (.claude/rules/multi-tenant.md).
//   (4) GRANT trong CHÍNH migration — dự án đã dính bẫy này HAI lần (0008, 0017) và cả hai
//       lần chỉ lộ ra ở production. Test dựng role tên đúng như production ('vat_app') và
//       KHÔNG cấp thêm gì sau migrate, đúng khuôn grantVatApp.test.ts.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { hoaDon, tenants, tepHoaDonGoc } from "../../src/schema";
import * as schema from "../../src/schema";
import { withTenant } from "../../src/tenantContext";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning();
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về hàng");
  return row.id;
}

async function makeInvoice(db: Db, tenantId: string, shdon: string): Promise<string> {
  const rows = await db
    .insert(hoaDon)
    .values({
      tenantId,
      nbmst: "0100000001",
      khmshdon: "1",
      khhdon: "C26TQO",
      shdon,
      tdlap: new Date("2026-07-15T00:00:00Z"),
      chieu: "purchase",
      nguon: "normal",
      rawJson: {},
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("insert hoa_don không trả về hàng");
  return row.id;
}

/** Một bản ghi "đã tải xong" tối thiểu hợp lệ. */
function tep(tenantId: string, hoaDonId: string, over: Record<string, unknown> = {}) {
  return {
    tenantId,
    hoaDonId,
    khoaXml: `hoadon-goc/${tenantId}/${hoaDonId}.xml`,
    khoaHtml: `hoadon-goc/${tenantId}/${hoaDonId}.html`,
    kichThuocXml: 10338,
    kichThuocHtml: 32186,
    trangThai: "da_tai",
    taiLuc: new Date("2026-07-28T12:00:00Z"),
    ...over,
  };
}

describe("tep_hoa_don_goc — ràng buộc (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("(1) chèn được bản ghi hợp lệ và đọc lại đúng khóa R2 + kích thước", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const hd = await makeInvoice(db, t, "13580");

    await db.insert(tepHoaDonGoc).values(tep(t, hd));

    const rows = await db.select().from(tepHoaDonGoc);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trangThai).toBe("da_tai");
    expect(rows[0]?.khoaXml).toBe(`hoadon-goc/${t}/${hd}.xml`);
    expect(rows[0]?.kichThuocHtml).toBe(32186);
  });

  it("(2) UNIQUE (tenant_id, hoa_don_id): tải lại cùng hóa đơn → chèn lần hai lỗi", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const hd = await makeInvoice(db, t, "13580");

    await db.insert(tepHoaDonGoc).values(tep(t, hd));
    await expect(db.insert(tepHoaDonGoc).values(tep(t, hd))).rejects.toThrow();
  });

  it("(2b) UNIQUE đó cho phép UPSERT idempotent — chạy lại job không nhân đôi, chỉ cập nhật", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const hd = await makeInvoice(db, t, "13580");

    await db.insert(tepHoaDonGoc).values(tep(t, hd, { trangThai: "loi", maLoi: "HTTP_ERROR" }));
    await db
      .insert(tepHoaDonGoc)
      .values(tep(t, hd))
      .onConflictDoUpdate({
        target: [tepHoaDonGoc.tenantId, tepHoaDonGoc.hoaDonId],
        set: { trangThai: "da_tai", maLoi: null },
      });

    const rows = await db.select().from(tepHoaDonGoc);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trangThai).toBe("da_tai");
    expect(rows[0]?.maLoi).toBeNull();
  });

  it("(3) FK GHÉP same-tenant: trỏ tới hóa đơn của tenant KHÁC → DB từ chối", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    const hdCuaB = await makeInvoice(db, b, "13580");

    // Nếu FK chỉ đặt trên `hoa_don_id`, hàng này sẽ chèn ĐƯỢC — rò dữ liệu chéo tenant.
    await expect(db.insert(tepHoaDonGoc).values(tep(a, hdCuaB))).rejects.toThrow();
  });

  it("(4) ghi nhận được ca GDT KHÔNG có hồ sơ gốc: không khóa R2, có mã lỗi", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const hd = await makeInvoice(db, t, "1078648");

    await db.insert(tepHoaDonGoc).values(
      tep(t, hd, {
        khoaXml: null,
        khoaHtml: null,
        kichThuocXml: null,
        kichThuocHtml: null,
        trangThai: "khong_co_ho_so_goc",
        maLoi: "NO_SOURCE_DOCUMENT",
        taiLuc: null,
      }),
    );

    const rows = await db.select().from(tepHoaDonGoc);
    expect(rows[0]?.trangThai).toBe("khong_co_ho_so_goc");
    expect(rows[0]?.khoaXml).toBeNull();
  });

  it("(5) xóa hóa đơn → bản ghi tệp gốc bị xóa theo (cascade), không để hàng mồ côi", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const hd = await makeInvoice(db, t, "13580");
    await db.insert(tepHoaDonGoc).values(tep(t, hd));

    await db.execute(sql`delete from hoa_don where id = ${hd}`);

    const rows = await db.select().from(tepHoaDonGoc);
    expect(rows).toHaveLength(0);
  });
});

describe("tep_hoa_don_goc — cách ly tenant (RLS)", () => {
  async function assertIsolatedUnderRole(db: Db, a: string, b: string, nhan: string) {
    await withTenant(db, a, async (tx) => {
      const rows = await tx.select().from(tepHoaDonGoc);
      expect({ nhan, so: rows.length }).toEqual({ nhan, so: 1 });
      expect(rows[0]?.tenantId).toBe(a);
    });
    await withTenant(db, b, async (tx) => {
      const rows = await tx.select().from(tepHoaDonGoc);
      expect({ nhan, so: rows.length }).toEqual({ nhan, so: 1 });
      expect(rows[0]?.tenantId).toBe(b);
    });
  }

  it("cách ly cho CẢ role non-owner (ENABLE) LẪN role sở hữu bảng (FORCE)", async () => {
    const db = await freshDb();
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    // Seed dưới role mặc định (PGlite = superuser → bỏ qua RLS kể cả FORCE).
    await db.insert(tepHoaDonGoc).values(tep(a, await makeInvoice(db, a, "111")));
    await db.insert(tepHoaDonGoc).values(tep(b, await makeInvoice(db, b, "222")));

    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`create role owner_role nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user, owner_role`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user, owner_role`,
    );

    await db.execute(sql`set role app_user`);
    await assertIsolatedUnderRole(db, a, b, "app_user(non-owner)");
    await db.execute(sql`reset role`);

    // Thiếu FORCE ⇒ chủ sở hữu bảng bỏ qua policy và thấy CẢ hai tenant → test này ĐỎ.
    await db.execute(sql`alter table tep_hoa_don_goc owner to owner_role`);
    await db.execute(sql`set role owner_role`);
    await assertIsolatedUnderRole(db, a, b, "owner_role(owner+FORCE)");
    await db.execute(sql`reset role`);
  });
});

describe("tep_hoa_don_goc — GRANT nằm trong CHÍNH migration", () => {
  // Đúng khuôn grantVatApp.test.ts: role phải tồn tại TRƯỚC khi migrate chạy, vì nhánh
  // `IF EXISTS (SELECT FROM pg_roles …)` kiểm tại thời điểm migration thực thi. KHÔNG cấp
  // thêm gì sau migrate — qua được assertion là nhờ chính migration.
  async function dbCoRoleVatApp(): Promise<Db> {
    const db = drizzle(new PGlite(), { schema });
    await db.execute(sql`create role vat_app nosuperuser login`);
    await db.execute(sql`grant usage on schema public to vat_app`);
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db;
  }

  it("vat_app CÓ SELECT/INSERT/UPDATE — không cấp tay sau migrate", async () => {
    const db = await dbCoRoleVatApp();
    for (const quyen of ["SELECT", "INSERT", "UPDATE"]) {
      const r = await db.execute(
        sql`SELECT has_table_privilege('vat_app', 'tep_hoa_don_goc', ${quyen}) AS co`,
      );
      expect({ quyen, co: r.rows[0]?.co }).toEqual({ quyen, co: true });
    }
  });

  it("vat_app KHÔNG có DELETE — least-privilege, nghiệp vụ không xóa hàng nào ở bảng này", async () => {
    const db = await dbCoRoleVatApp();
    const r = await db.execute(
      sql`SELECT has_table_privilege('vat_app', 'tep_hoa_don_goc', 'DELETE') AS co`,
    );
    expect(r.rows[0]?.co).toBe(false);
  });

  it("môi trường KHÔNG có role 'vat_app' → migrate KHÔNG throw (chỉ RAISE WARNING)", async () => {
    const db = drizzle(new PGlite(), { schema });
    await expect(migrate(db, { migrationsFolder: MIGRATIONS })).resolves.not.toThrow();
  });
});

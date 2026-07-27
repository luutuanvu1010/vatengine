// U35 (A3/A4/A8) — bảng `lich_su_thay_doi_hoa_don` + `bo_dem_phien_ban` + trigger
// `hoa_don_ghi_lich_su_thay_doi`: áp migration lên Postgres THẬT (PGlite) rồi kiểm
// hành vi thật (không chỉ khai báo) — cùng mẫu `constraints.test.ts`/
// `auditAppendOnly.test.ts`. Offline hoàn toàn (testing.md).
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import {
  boDemPhienBan,
  hoaDon,
  lanDongBo,
  lichSuThayDoiHoaDon,
  taiKhoanThue,
  tenants,
} from "../../src/schema";
import * as schema from "../../src/schema";
import { withTenant } from "../../src/tenantContext";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));
type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning();
  const row = rows[0];
  if (!row) throw new Error("thiếu tenant");
  return row.id;
}

function invoice(tenantId: string, over: Record<string, unknown> = {}) {
  return {
    tenantId,
    nbmst: "0100000001",
    khmshdon: "1",
    khhdon: "C24TAA",
    shdon: "123",
    tdlap: new Date("2026-01-15T00:00:00Z"),
    chieu: "purchase",
    nguon: "normal",
    rawJson: {},
    ttxly: 8,
    tthai: 1,
    ...over,
  };
}

async function seedInvoice(db: Db, tenantId: string, over: Record<string, unknown> = {}) {
  const rows = await db.insert(hoaDon).values(invoice(tenantId, over)).returning();
  const row = rows[0];
  if (!row) throw new Error("thiếu hóa đơn");
  return row.id;
}

/** Seed một tài khoản thuế hợp lệ — `lan_dong_bo.taikhoan_id` là FK NOT NULL thật, không
 * thể dùng UUID ngẫu nhiên không tồn tại. */
async function seedTaiKhoan(db: Db, tenantId: string, username = "0100000001"): Promise<string> {
  const rows = await db.insert(taiKhoanThue).values({ tenantId, username }).returning();
  const row = rows[0];
  if (!row) throw new Error("thiếu tài khoản thuế");
  return row.id;
}

describe("U35 — migration tạo đủ bảng/cột", () => {
  it("có bảng lich_su_thay_doi_hoa_don, bo_dem_phien_ban, cột lan_dong_bo.so_phien_ban", async () => {
    const db = await freshDb();
    const tables = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = (tables.rows as Array<{ table_name: string }>).map((r) => r.table_name);
    expect(names).toContain("lich_su_thay_doi_hoa_don");
    expect(names).toContain("bo_dem_phien_ban");
    const cols = await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'lan_dong_bo'`,
    );
    expect((cols.rows as Array<{ column_name: string }>).map((r) => r.column_name)).toContain(
      "so_phien_ban",
    );
    // Idempotent: áp lại migration đã áp không lỗi.
    await expect(migrate(db, { migrationsFolder: MIGRATIONS })).resolves.not.toThrow();
  });
});

describe("U35 — trigger hoa_don_ghi_lich_su_thay_doi (integration, PGlite)", () => {
  let db: Db;
  let tenantId: string;
  let hoaDonId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    hoaDonId = await seedInvoice(db, tenantId);
    taikhoanId = await seedTaiKhoan(db, tenantId);
  });

  it("ttxly đổi → INSERT một dòng lịch sử đúng giá trị cũ/mới", async () => {
    await withTenant(db, tenantId, async (tx) => {
      await tx.update(hoaDon).set({ ttxly: 6 }).where(sql`${hoaDon.id} = ${hoaDonId}`);
    });
    const rows = await db.select().from(lichSuThayDoiHoaDon);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      hoaDonId,
      truong: "ttxly",
      giaTriCu: 8,
      giaTriMoi: 6,
      lanDongBoId: null,
      daDoc: false,
    });
  });

  it("tthai đổi → INSERT một dòng lịch sử truong='tthai'", async () => {
    await withTenant(db, tenantId, async (tx) => {
      await tx.update(hoaDon).set({ tthai: 5 }).where(sql`${hoaDon.id} = ${hoaDonId}`);
    });
    const rows = await db.select().from(lichSuThayDoiHoaDon);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ truong: "tthai", giaTriCu: 1, giaTriMoi: 5 });
  });

  it("ttxly VÀ tthai cùng đổi trong một UPDATE → 2 dòng lịch sử", async () => {
    await withTenant(db, tenantId, async (tx) => {
      await tx.update(hoaDon).set({ ttxly: 6, tthai: 5 }).where(sql`${hoaDon.id} = ${hoaDonId}`);
    });
    const rows = await db.select().from(lichSuThayDoiHoaDon);
    expect(rows.map((r) => r.truong).sort()).toEqual(["tthai", "ttxly"]);
  });

  it("KHÔNG đổi ttxly/tthai (chỉ đổi rawJson) → KHÔNG sinh lịch sử", async () => {
    await withTenant(db, tenantId, async (tx) => {
      await tx
        .update(hoaDon)
        .set({ rawJson: { note: "cùng trạng thái" } })
        .where(sql`${hoaDon.id} = ${hoaDonId}`);
    });
    expect(await db.select().from(lichSuThayDoiHoaDon)).toHaveLength(0);
  });

  it("INSERT hóa đơn MỚI → KHÔNG kích hoạt trigger (AFTER UPDATE, không phải INSERT)", async () => {
    await seedInvoice(db, tenantId, { shdon: "999", ttxly: 8, tthai: 1 });
    expect(await db.select().from(lichSuThayDoiHoaDon)).toHaveLength(0);
  });

  it("biến phiên app.lan_dong_bo_id CHƯA đặt → KHÔNG ném lỗi, lịch sử ghi lan_dong_bo_id=NULL", async () => {
    // withTenant KHÔNG truyền lanDongBoId (3 tham số) — biến phiên không được set_config.
    await expect(
      withTenant(db, tenantId, async (tx) => {
        await tx.update(hoaDon).set({ ttxly: 6 }).where(sql`${hoaDon.id} = ${hoaDonId}`);
      }),
    ).resolves.not.toThrow();
    const rows = await db.select().from(lichSuThayDoiHoaDon);
    expect(rows[0]?.lanDongBoId).toBeNull();
  });

  it("biến phiên app.lan_dong_bo_id ĐÃ đặt (withTenant mở rộng) → lịch sử gắn đúng phiên", async () => {
    const lan = await db
      .insert(lanDongBo)
      .values({
        tenantId,
        taikhoanId,
        chieu: "purchase",
        tuNgay: new Date("2026-01-01"),
        denNgay: new Date("2026-01-31"),
        trangThai: "running",
      })
      .returning({ id: lanDongBo.id });
    const lanDongBoId = lan[0]?.id;
    if (!lanDongBoId) throw new Error("thiếu lan_dong_bo id");

    await withTenant(
      db,
      tenantId,
      async (tx) => {
        await tx.update(hoaDon).set({ ttxly: 6 }).where(sql`${hoaDon.id} = ${hoaDonId}`);
      },
      lanDongBoId,
    );
    const rows = await db.select().from(lichSuThayDoiHoaDon);
    expect(rows[0]?.lanDongBoId).toBe(lanDongBoId);
  });

  it("redelivery/biên hiếm (B→A→B cùng lan_dong_bo_id, review C3) → KHÔNG ném lỗi, dòng trùng khóa bị bỏ qua (ON CONFLICT DO NOTHING)", async () => {
    const lanDongBoId = crypto.randomUUID();
    await db.insert(lanDongBo).values({
      id: lanDongBoId,
      tenantId,
      taikhoanId,
      chieu: "purchase",
      tuNgay: new Date("2026-01-01"),
      denNgay: new Date("2026-01-31"),
      trangThai: "running",
    });
    await withTenant(
      db,
      tenantId,
      async (tx) => {
        await tx.update(hoaDon).set({ ttxly: 6 }).where(sql`${hoaDon.id} = ${hoaDonId}`); // 8→6
        await tx.update(hoaDon).set({ ttxly: 8 }).where(sql`${hoaDon.id} = ${hoaDonId}`); // 6→8
        // Bật lại về 6: TRÙNG khóa (hoaDonId, 'ttxly', moi=6, lanDongBoId) với dòng đầu —
        // ON CONFLICT DO NOTHING phải nuốt êm, KHÔNG ném lỗi/rollback cả transaction.
        await tx.update(hoaDon).set({ ttxly: 6 }).where(sql`${hoaDon.id} = ${hoaDonId}`); // 8→6 (trùng)
      },
      lanDongBoId,
    );
    const rows = await db.select().from(lichSuThayDoiHoaDon);
    // Chỉ 2 dòng (8→6, 6→8) — lần bật lại 6 thứ hai bị ON CONFLICT DO NOTHING bỏ qua.
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.lanDongBoId === lanDongBoId)).toBe(true);
  });

  it("redelivery CÙNG lô (giống hệt truong/gia_tri_moi/lan_dong_bo_id) qua HAI transaction riêng → không nhân đôi", async () => {
    const lanDongBoId = crypto.randomUUID();
    await db.insert(lanDongBo).values({
      id: lanDongBoId,
      tenantId,
      taikhoanId,
      chieu: "purchase",
      tuNgay: new Date("2026-01-01"),
      denNgay: new Date("2026-01-31"),
      trangThai: "running",
    });
    const applyOnce = () =>
      withTenant(
        db,
        tenantId,
        async (tx) => {
          await tx.update(hoaDon).set({ ttxly: 6 }).where(sql`${hoaDon.id} = ${hoaDonId}`);
        },
        lanDongBoId,
      );
    await applyOnce();
    // Đưa hóa đơn về lại 8 "thủ công" (mô phỏng ai đó sửa ngoài luồng) rồi redeliver ĐÚNG
    // update cũ (8→6) một lần nữa CÙNG lanDongBoId — khóa tự nhiên (hoaDonId, ttxly, moi=6,
    // lanDongBoId) đã tồn tại từ lần đầu ⇒ ON CONFLICT DO NOTHING, không nhân đôi.
    await db.update(hoaDon).set({ ttxly: 8 }).where(sql`${hoaDon.id} = ${hoaDonId}`);
    await applyOnce();
    const rows = await db
      .select()
      .from(lichSuThayDoiHoaDon)
      .where(sql`${lichSuThayDoiHoaDon.giaTriMoi} = 6`);
    expect(rows).toHaveLength(1);
  });
});

describe("U35 — ràng buộc bảng lich_su_thay_doi_hoa_don (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("UNIQUE (hoa_don_id, truong, gia_tri_moi, lan_dong_bo_id) thực thi qua INSERT tay (không ON CONFLICT)", async () => {
    const tenantId = await makeTenant(db, "Cty A", "0100000001");
    const hoaDonId = await seedInvoice(db, tenantId);
    // lan_dong_bo_id PHẢI khác NULL: Postgres coi mỗi NULL là một giá trị RIÊNG trong
    // ràng buộc UNIQUE (không tự trùng nhau) — chỉ khớp khóa tự nhiên khi có phiên đồng
    // bộ thật gắn kèm (đúng kịch bản redelivery mà ràng buộc này nhắm tới).
    const taikhoanId = await seedTaiKhoan(db, tenantId);
    const lan = await db
      .insert(lanDongBo)
      .values({
        tenantId,
        taikhoanId,
        chieu: "purchase",
        tuNgay: new Date("2026-01-01"),
        denNgay: new Date("2026-01-31"),
        trangThai: "running",
      })
      .returning({ id: lanDongBo.id });
    const lanDongBoId = lan[0]?.id;
    if (!lanDongBoId) throw new Error("thiếu lan_dong_bo id");

    await db.insert(lichSuThayDoiHoaDon).values({
      tenantId,
      hoaDonId,
      truong: "ttxly",
      giaTriCu: 8,
      giaTriMoi: 6,
      lanDongBoId,
    });
    await expect(
      db.insert(lichSuThayDoiHoaDon).values({
        tenantId,
        hoaDonId,
        truong: "ttxly",
        giaTriCu: 99, // gia_tri_cu KHÔNG nằm trong khóa — vẫn trùng
        giaTriMoi: 6,
        lanDongBoId,
      }),
    ).rejects.toThrow();
  });

  it("composite FK same-tenant: hoa_don_id thuộc tenant KHÁC → lỗi (không cho trỏ chéo tenant)", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    const hoaDonB = await seedInvoice(db, b);
    await expect(
      db.insert(lichSuThayDoiHoaDon).values({
        tenantId: a, // tenant A nhưng hoa_don_id thuộc B
        hoaDonId: hoaDonB,
        truong: "ttxly",
        giaTriMoi: 6,
      }),
    ).rejects.toThrow();
  });

  it("composite FK same-tenant: hoa_don_id + tenant_id khớp cùng một tenant → chèn được", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const hoaDonA = await seedInvoice(db, a);
    await expect(
      db.insert(lichSuThayDoiHoaDon).values({
        tenantId: a,
        hoaDonId: hoaDonA,
        truong: "ttxly",
        giaTriMoi: 6,
      }),
    ).resolves.not.toThrow();
  });

  async function assertIsolatedUnderRole(
    db: Db,
    a: string,
    b: string,
    // PHẢI dùng `tx` (không phải `db` ngoài) — `db.select()` bên trong callback
    // `withTenant` chạy TRÊN CÙNG kết nối PGlite trong khi transaction còn mở ⇒ treo
    // (tự phát hiện qua timeout khi viết test này). Cùng lỗi KHÔNG xảy ra với Hyperdrive
    // pool thật, nhưng dùng `tx` vẫn là cách viết đúng/an toàn.
    tableSelect: (
      tx: Parameters<Parameters<typeof withTenant>[2]>[0],
    ) => Promise<Array<{ tenantId: string }>>,
    roleLabel: string,
  ) {
    await withTenant(db, a, async (tx) => {
      const rows = await tableSelect(tx);
      expect(rows.length, `${roleLabel}: tenant A chỉ thấy hàng của A`).toBe(1);
      expect(rows[0]?.tenantId).toBe(a);
    });
    await withTenant(db, b, async (tx) => {
      const rows = await tableSelect(tx);
      expect(
        rows.map((r) => r.tenantId),
        `${roleLabel}: tenant B chỉ thấy hàng của B`,
      ).toEqual([b]);
    });
  }

  it("RLS cách ly tenant cho lich_su_thay_doi_hoa_don — CẢ role non-owner (ENABLE) LẪN owner (FORCE)", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    const hoaDonA = await seedInvoice(db, a);
    const hoaDonB = await seedInvoice(db, b);
    await db.insert(lichSuThayDoiHoaDon).values([
      { tenantId: a, hoaDonId: hoaDonA, truong: "ttxly", giaTriMoi: 6 },
      { tenantId: b, hoaDonId: hoaDonB, truong: "ttxly", giaTriMoi: 6 },
    ]);

    await db.execute(sql`create role lstd_app nosuperuser`);
    await db.execute(sql`create role lstd_owner nosuperuser`);
    await db.execute(sql`grant usage on schema public to lstd_app, lstd_owner`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to lstd_app, lstd_owner`,
    );

    const sel = (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) =>
      tx.select().from(lichSuThayDoiHoaDon);
    await db.execute(sql`set role lstd_app`);
    await assertIsolatedUnderRole(db, a, b, sel, "lstd_app(non-owner)");
    await db.execute(sql`reset role`);

    await db.execute(sql`alter table lich_su_thay_doi_hoa_don owner to lstd_owner`);
    await db.execute(sql`set role lstd_owner`);
    await assertIsolatedUnderRole(db, a, b, sel, "lstd_owner(owner+FORCE)");
    await db.execute(sql`reset role`);
  });
});

describe("U35 — bo_dem_phien_ban: RLS + cấp số nguyên tử (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  async function capSoPhienBan(tenantId: string): Promise<number> {
    return withTenant(db, tenantId, async (tx) => {
      const rows = await tx
        .insert(boDemPhienBan)
        .values({ tenantId, giaTri: 1 })
        .onConflictDoUpdate({
          target: boDemPhienBan.tenantId,
          set: { giaTri: sql`${boDemPhienBan.giaTri} + 1` },
        })
        .returning({ giaTri: boDemPhienBan.giaTri });
      const row = rows[0];
      if (!row) throw new Error("thiếu giá trị đếm");
      return row.giaTri;
    });
  }

  it("cấp số 1, 2, 3… tăng dần cho CÙNG tenant (không dùng MAX()+1)", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    expect(await capSoPhienBan(t)).toBe(1);
    expect(await capSoPhienBan(t)).toBe(2);
    expect(await capSoPhienBan(t)).toBe(3);
  });

  it("hai tenant khác nhau đếm ĐỘC LẬP", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    expect(await capSoPhienBan(a)).toBe(1);
    expect(await capSoPhienBan(b)).toBe(1);
    expect(await capSoPhienBan(a)).toBe(2);
  });

  it("cấp số ĐỒNG THỜI (Promise.all) không trùng số — nguyên tử", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const results = await Promise.all(Array.from({ length: 10 }, () => capSoPhienBan(t)));
    expect(new Set(results).size).toBe(10); // 10 số khác nhau, không trùng
    expect([...results].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("RLS cách ly tenant cho bo_dem_phien_ban — CẢ non-owner LẪN owner (FORCE)", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    await db.insert(boDemPhienBan).values([
      { tenantId: a, giaTri: 5 },
      { tenantId: b, giaTri: 9 },
    ]);
    await db.execute(sql`create role bdpb_app nosuperuser`);
    await db.execute(sql`grant usage on schema public to bdpb_app`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to bdpb_app`,
    );
    await db.execute(sql`set role bdpb_app`);
    await withTenant(db, a, async (tx) => {
      const rows = await tx.select().from(boDemPhienBan);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.giaTri).toBe(5);
    });
    await db.execute(sql`reset role`);
  });
});

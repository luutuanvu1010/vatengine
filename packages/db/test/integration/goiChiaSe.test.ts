// U37b Gói 2 — bảng `goi_chia_se`: sổ theo dõi các gói hóa đơn đã phát hành qua link
// CÔNG KHAI. Nhóm integration (PGlite): áp migration thật rồi kiểm HÀNH VI.
//
// Bảng này nhạy cảm hơn `tep_hoa_don_goc`: nó trỏ tới file nằm NGOÀI hàng rào RLS/JWT.
// Ai có khóa là tải được, nên `khoa_r2` phải DUY NHẤT TOÀN CỤC — trùng khóa giữa hai
// tenant nghĩa là khách của tenant này mở ra hóa đơn của tenant kia.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { goiChiaSe, tenants } from "../../src/schema";
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
  if (!row) throw new Error("insert tenant không trả về hàng");
  return row.id;
}

/** Một gói "đã phát hành" tối thiểu hợp lệ. */
function goi(tenantId: string, over: Record<string, unknown> = {}) {
  // U37c: `token` suy TỪ `khoaR2` bằng đúng phép biến đổi migration 0021 dùng để backfill.
  // Nhờ vậy ca nào ghi đè `khoaR2` là tự có token riêng — không phải nhớ sửa hai chỗ, và
  // không có cảnh hai hàng khác khóa mà trùng token làm test đỏ vì lý do chẳng liên quan.
  const khoaR2 =
    (over.khoaR2 as string | undefined) ?? "goi-hoa-don/2026-07/abcdefghijklmnopqrstuvwxyz234567";
  return {
    tenantId,
    khoaR2,
    token: (khoaR2.split("/").pop() as string).replace(/\.zip$/, ""),
    nmmst: "0312000001",
    tuNgay: "2026-07-01",
    denNgay: "2026-07-31",
    soHoaDon: 12,
    kichThuoc: 512_000,
    trangThai: "san_sang",
    hetHanLuc: new Date("2026-08-28T00:00:00Z"),
    ...over,
  };
}

describe("goi_chia_se — ràng buộc (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("chèn được gói hợp lệ và đọc lại đủ trường", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    await db.insert(goiChiaSe).values(goi(t));

    const rows = await db.select().from(goiChiaSe);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trangThai).toBe("san_sang");
    expect(rows[0]?.nmmst).toBe("0312000001");
    expect(rows[0]?.soHoaDon).toBe(12);
    expect(rows[0]?.hetHanLuc).toBeInstanceOf(Date);
  });

  // Đây là ràng buộc AN TOÀN, không phải chuyện gọn gàng: khóa là thứ DUY NHẤT bảo vệ
  // file công khai. Hai gói trùng khóa ⇒ một khóa mở ra hai gói, và người nhận link của
  // tenant này có thể chạm dữ liệu của tenant kia.
  it("khoa_r2 DUY NHẤT TOÀN CỤC — kể cả giữa hai tenant khác nhau", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");

    await db.insert(goiChiaSe).values(goi(a));
    await expect(db.insert(goiChiaSe).values(goi(b))).rejects.toThrow();
  });

  // U37c — `token` là ĐỊNH DANH CÔNG KHAI (`/tai/<token>`). Trùng token nghĩa là một liên
  // kết mở ra gói của tenant KHÁC. Ràng buộc AN TOÀN, không phải chuyện gọn gàng — nên phải
  // duy nhất TOÀN CỤC, y như `khoa_r2`, chứ không phải duy nhất trong phạm vi tenant.
  it("token DUY NHẤT TOÀN CỤC — hai tenant không thể trùng định danh công khai", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");

    await db.insert(goiChiaSe).values(goi(a));
    // Khóa lưu trữ KHÁC nhau (loại trừ việc đỏ vì `khoa_r2`), chỉ token trùng.
    await expect(
      db
        .insert(goiChiaSe)
        .values(
          goi(b, {
            khoaR2: "goi-hoa-don/2026-07/khac-hoan-toan.zip",
            token: "abcdefghijklmnopqrstuvwxyz234567",
          }),
        ),
    ).rejects.toThrow();
  });

  it("ghi được ca THU HỒI và ca LỖI (không cần quyền DELETE)", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    await db.insert(goiChiaSe).values(goi(t));

    await db.execute(sql`update goi_chia_se set trang_thai = 'da_thu_hoi'`);
    let rows = await db.select().from(goiChiaSe);
    expect(rows[0]?.trangThai).toBe("da_thu_hoi");

    await db.insert(goiChiaSe).values(
      goi(t, {
        khoaR2: "goi-hoa-don/2026-07/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
        trangThai: "loi",
        maLoi: "KHONG_CO_HOA_DON_NAO",
        soHoaDon: 0,
        kichThuoc: null,
      }),
    );
    rows = await db.select().from(goiChiaSe);
    expect(rows.some((r) => r.trangThai === "loi" && r.maLoi === "KHONG_CO_HOA_DON_NAO")).toBe(
      true,
    );
  });

  it("xóa tenant → gói của tenant đó biến mất theo (không để hàng mồ côi trỏ vào R2)", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    await db.insert(goiChiaSe).values(goi(t));

    await db.execute(sql`delete from tenants where id = ${t}`);
    expect(await db.select().from(goiChiaSe)).toHaveLength(0);
  });
});

describe("goi_chia_se — cách ly tenant (RLS)", () => {
  async function assertIsolatedUnderRole(db: Db, a: string, b: string, nhan: string) {
    for (const [t, ten] of [
      [a, "A"],
      [b, "B"],
    ] as const) {
      await withTenant(db, t, async (tx) => {
        const rows = await tx.select().from(goiChiaSe);
        expect({ nhan, ten, so: rows.length }).toEqual({ nhan, ten, so: 1 });
        expect(rows[0]?.tenantId).toBe(t);
      });
    }
  }

  it("cách ly cho CẢ role non-owner (ENABLE) LẪN role sở hữu bảng (FORCE)", async () => {
    const db = await freshDb();
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    await db.insert(goiChiaSe).values(goi(a, { khoaR2: "goi-hoa-don/2026-07/aaaa" }));
    await db.insert(goiChiaSe).values(goi(b, { khoaR2: "goi-hoa-don/2026-07/bbbb" }));

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
    await db.execute(sql`alter table goi_chia_se owner to owner_role`);
    await db.execute(sql`set role owner_role`);
    await assertIsolatedUnderRole(db, a, b, "owner_role(owner+FORCE)");
    await db.execute(sql`reset role`);
  });
});

describe("goi_chia_se — GRANT nằm trong CHÍNH migration", () => {
  // Role phải tồn tại TRƯỚC khi migrate chạy: nhánh `IF EXISTS (SELECT FROM pg_roles …)`
  // kiểm tại thời điểm migration thực thi, không phải lúc test assert.
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
        sql`SELECT has_table_privilege('vat_app', 'goi_chia_se', ${quyen}) AS co`,
      );
      expect({ quyen, co: r.rows[0]?.co }).toEqual({ quyen, co: true });
    }
  });

  // Thu hồi = đổi trang_thai + xóa object R2, KHÔNG xóa hàng. Giữ được vết ai đã phát
  // hành link nào — thứ audit cần khi có sự cố lộ dữ liệu.
  it("vat_app KHÔNG có DELETE — thu hồi là đổi trạng thái, không xóa vết", async () => {
    const db = await dbCoRoleVatApp();
    const r = await db.execute(
      sql`SELECT has_table_privilege('vat_app', 'goi_chia_se', 'DELETE') AS co`,
    );
    expect(r.rows[0]?.co).toBe(false);
  });

  it("môi trường KHÔNG có role 'vat_app' → migrate KHÔNG throw (chỉ RAISE WARNING)", async () => {
    const db = drizzle(new PGlite(), { schema });
    await expect(migrate(db, { migrationsFolder: MIGRATIONS })).resolves.not.toThrow();
  });
});

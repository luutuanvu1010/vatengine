// U4 — Test ràng buộc + RLS (nhóm integration, PGlite): áp migration đã sinh lên
// một Postgres WASM sạch rồi kiểm hành vi THẬT (không chỉ khai báo). Offline hoàn
// toàn — không Docker/mạng (xem .claude/rules/testing.md).
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { dongHangHoa, hoaDon, taiKhoanThue, tenants } from "../../src/schema";
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

/** Một hóa đơn tối thiểu hợp lệ cho một tenant (5 trường khóa tự nhiên cố định). */
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
    ...over,
  };
}

describe("U4 ràng buộc DB (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("(7) khóa tự nhiên UNIQUE được thực thi: chèn trùng (cùng tenant) → lỗi", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    await db.insert(hoaDon).values(invoice(t));
    await expect(db.insert(hoaDon).values(invoice(t))).rejects.toThrow();
  });

  it("(8) tenant_id là một phần của khóa: cùng 5 trường khác tenant → cả hai chèn được", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    await db.insert(hoaDon).values(invoice(a));
    await expect(db.insert(hoaDon).values(invoice(b))).resolves.not.toThrow();
    const all = await db.select().from(hoaDon);
    expect(all.length).toBe(2);
  });

  it("(9) tenant_id NOT NULL được thực thi: chèn thiếu tenant_id → lỗi", async () => {
    // Dùng SQL thô để bỏ qua kiểm kiểu TS (cột tenant_id là notNull ⇒ không thể
    // truyền null qua Drizzle typed API). id có default, created_at có default.
    await expect(
      db.execute(
        sql`insert into hoa_don (nbmst, khmshdon, khhdon, shdon, tdlap, chieu, nguon, raw_json)
            values ('0100000001','1','C24TAA','123', now(), 'purchase','normal', '{}'::jsonb)`,
      ),
    ).rejects.toThrow();
  });

  it("(10) FK dong_hang_hoa.hoadon_id được thực thi + xóa hóa đơn cascade dòng hàng", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    // FK: trỏ hóa đơn không tồn tại → lỗi
    await expect(
      db.insert(dongHangHoa).values({
        hoaDonId: crypto.randomUUID(),
        tenantId: t,
        ten: "Hàng X",
        rawJson: {},
      }),
    ).rejects.toThrow();

    // Cascade: xóa hóa đơn → dòng hàng của nó biến mất
    const inv = await db.insert(hoaDon).values(invoice(t)).returning();
    const hoaDonId = inv[0]?.id;
    if (!hoaDonId) throw new Error("thiếu hoaDonId");
    await db.insert(dongHangHoa).values({ hoaDonId, tenantId: t, ten: "Hàng X", rawJson: {} });
    expect((await db.select().from(dongHangHoa)).length).toBe(1);
    await db.delete(hoaDon).where(sql`${hoaDon.id} = ${hoaDonId}`);
    expect((await db.select().from(dongHangHoa)).length).toBe(0);
  });

  it("(11) raw_json round-trip JSONB (đọc lại đúng object lồng nhau, không phải chuỗi)", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    const nested = { a: 1, b: { c: [1, 2, 3], d: "x" }, e: null };
    const inserted = await db
      .insert(hoaDon)
      .values(invoice(t, { rawJson: nested }))
      .returning();
    const id = inserted[0]?.id;
    const rows = await db.select().from(hoaDon).where(sql`${hoaDon.id} = ${id}`);
    expect(rows[0]?.rawJson).toEqual(nested);
  });

  it("(12) áp migration lên DB sạch tạo đủ bảng; áp lần hai không lỗi", async () => {
    const res = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = (res.rows as Array<{ table_name: string }>).map((r) => r.table_name);
    for (const t of [
      "tenants",
      "tai_khoan_thue",
      "hoa_don",
      "dong_hang_hoa",
      "lan_dong_bo",
      "nguoi_dung",
      "audit_log",
    ]) {
      expect(names, `migration phải tạo bảng ${t}`).toContain(t);
    }
    // Idempotent ở mức schema: áp lại migration đã áp → không lỗi (journal drizzle).
    await expect(migrate(db, { migrationsFolder: MIGRATIONS })).resolves.not.toThrow();
  });

  // Kiểm cách ly RLS cho MỘT role không-superuser đã đặt ngữ cảnh tenant qua withTenant.
  async function assertIsolatedUnderRole(a: string, b: string, roleLabel: string) {
    await withTenant(db, a, async (tx) => {
      const rows = await tx.select().from(hoaDon);
      expect(rows.length, `${roleLabel}: tenant A chỉ thấy HĐ của A`).toBe(1);
      expect(rows[0]?.tenantId).toBe(a);
    });
    await withTenant(db, b, async (tx) => {
      const rows = await tx.select().from(hoaDon);
      expect(
        rows.map((r) => r.tenantId),
        `${roleLabel}: tenant B chỉ thấy HĐ của B`,
      ).toEqual([b]);
    });
    // Không có ngữ cảnh tenant (app.tenant_id chưa đặt) → RLS chặn hết (fail-closed).
    expect((await db.select().from(hoaDon)).length, `${roleLabel}: không tenant → 0 hàng`).toBe(0);
  }

  it("(13) RLS cách ly tenant cho CẢ role non-owner (ENABLE) LẪN role sở hữu bảng (FORCE)", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    // Seed dưới role mặc định (PGlite = superuser postgres → bỏ qua RLS kể cả FORCE).
    await db.insert(hoaDon).values(invoice(a));
    await db.insert(hoaDon).values(invoice(b));

    // Hai role KHÔNG-superuser: app_user (không sở hữu bảng) và owner_role (SẼ sở hữu
    // hoa_don). Với ENABLE, chỉ non-owner bị chi phối; FORCE mới bắt CẢ owner tuân theo.
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`create role owner_role nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user, owner_role`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user, owner_role`,
    );

    // (a) Role KHÔNG-owner → RLS có hiệu lực nhờ ENABLE (mô hình production: Worker
    // kết nối bằng role app không sở hữu bảng).
    await db.execute(sql`set role app_user`);
    await assertIsolatedUnderRole(a, b, "app_user(non-owner)");
    await db.execute(sql`reset role`);

    // (b) Role SỞ HỮU bảng hoa_don → nếu THIẾU FORCE, owner sẽ bỏ qua RLS và thấy CẢ
    // hai tenant (test này sẽ ĐỎ). Có FORCE ⇒ owner vẫn bị policy chi phối. Đây là lá
    // chắn khi production lỡ dùng đúng role owner để kết nối (mặc định Neon/Supabase).
    await db.execute(sql`alter table hoa_don owner to owner_role`);
    await db.execute(sql`set role owner_role`);
    await assertIsolatedUnderRole(a, b, "owner_role(owner+FORCE)");
    await db.execute(sql`reset role`);
  });

  it("(U8-14) auth_lookup_user() tra cứu login XUYÊN tenant dưới role app (non-superuser) dù RLS chặn SELECT thường", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    // Seed người dùng dưới role mặc định (PGlite superuser → bỏ qua RLS khi seed).
    await db.execute(
      sql`insert into nguoi_dung (tenant_id, email, password_hash, vai_tro)
          values (${a}, 'ke.toan@a.vn', 'hash-A', 'ke_toan'),
                 (${b}, 'admin@b.vn',  'hash-B', 'quan_tri')`,
    );

    // Role app production: non-superuser, KHÔNG sở hữu bảng, KHÔNG có BYPASSRLS.
    await db.execute(sql`create role app_user2 nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user2`);
    await db.execute(sql`grant select on all tables in schema public to app_user2`);
    await db.execute(sql`grant execute on function auth_lookup_user(text) to app_user2`);

    await db.execute(sql`set role app_user2`);
    // (a) SELECT thường trên nguoi_dung KHÔNG có tenant ctx → RLS chặn hết (0 hàng).
    const direct = await db.execute(sql`select id from nguoi_dung where email = 'admin@b.vn'`);
    expect(direct.rows.length, "SELECT thường bị RLS chặn khi chưa set tenant").toBe(0);

    // (b) Hàm SECURITY DEFINER (owner BYPASSRLS) VẪN tìm được người dùng — đây là lối
    // tra cứu login hợp lệ TRƯỚC khi biết tenant. Trả đúng tenant_id + vai_tro + hash.
    const viaFn = await db.execute(
      sql`select id, tenant_id, vai_tro, password_hash from auth_lookup_user('admin@b.vn')`,
    );
    expect(viaFn.rows.length, "auth_lookup_user tìm được người dùng xuyên tenant").toBe(1);
    const row = viaFn.rows[0] as {
      tenant_id: string;
      vai_tro: string;
      password_hash: string;
    };
    expect(row.tenant_id).toBe(b);
    expect(row.vai_tro).toBe("quan_tri");
    expect(row.password_hash).toBe("hash-B");

    // (c) Email không tồn tại → rỗng (login sẽ 401).
    const none = await db.execute(sql`select id from auth_lookup_user('khong-ton-tai@x.vn')`);
    expect(none.rows.length).toBe(0);
    await db.execute(sql`reset role`);

    // (d) LEAST-PRIVILEGE: role KHÔNG được cấp EXECUTE tường minh (mô phỏng role báo
    // cáo/BI thêm sau) → KHÔNG gọi được hàm (chặn regression nếu ai đó cấp lại TO PUBLIC).
    await db.execute(sql`create role reporter nosuperuser`);
    await db.execute(sql`grant usage on schema public to reporter`);
    await db.execute(sql`set role reporter`);
    // Ném (permission denied) — tương phản với app_user2 (được cấp) gọi THÀNH CÔNG ở
    // trên chính là bằng chứng "grant tường minh mới mở đường". PGlite bọc lỗi PG trong
    // "Failed query: …" nên chỉ khẳng định có ném, không so khớp thông điệp gốc.
    await expect(db.execute(sql`select id from auth_lookup_user('admin@b.vn')`)).rejects.toThrow();
    await db.execute(sql`reset role`);
  });
});

describe("U23-D (D1) — ràng buộc UNIQUE mst + (tenant_id, username)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("UNIQUE(mst): 2 tenant cùng MST gốc → lỗi", async () => {
    await makeTenant(db, "Cty A", "0100000001");
    await expect(makeTenant(db, "Cty A trùng MST", "0100000001")).rejects.toThrow();
  });

  it("MST khác nhau → cả hai tenant tạo được", async () => {
    await makeTenant(db, "Cty A", "0100000001");
    await expect(makeTenant(db, "Cty B", "0100000002")).resolves.toBeTruthy();
  });

  it("UNIQUE(tenant_id, username): trùng username trong CÙNG tenant → lỗi", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    await db.insert(taiKhoanThue).values({ tenantId: t, username: "0100000001" });
    await expect(
      db.insert(taiKhoanThue).values({ tenantId: t, username: "0100000001" }),
    ).rejects.toThrow();
  });

  it("cùng username KHÁC tenant → cả hai tạo được (username không unique toàn cục)", async () => {
    const a = await makeTenant(db, "Cty A", "0100000001");
    const b = await makeTenant(db, "Cty B", "0100000002");
    await db.insert(taiKhoanThue).values({ tenantId: a, username: "0100000001" });
    await expect(
      db.insert(taiKhoanThue).values({ tenantId: b, username: "0100000001" }),
    ).resolves.not.toThrow();
  });

  it("cùng tenant, username khác nhau → cả hai tạo được (chừa nền tài khoản con)", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001");
    await db.insert(taiKhoanThue).values({ tenantId: t, username: "0100000001" });
    await expect(
      db.insert(taiKhoanThue).values({ tenantId: t, username: "0100000001-001" }),
    ).resolves.not.toThrow();
  });
});

// U17a — Bảng gói dịch vụ TOÀN CỤC (không tenant_id). Đây là bảng ĐẦU TIÊN của dự án
// không có trục tenant, nên phải kiểm hành vi RLS/quyền THẬT chứ không tin khai báo:
// drizzle KHÔNG phát ENABLE RLS cho bảng không khai báo policy (bằng chứng 0000 chỉ bật
// cho 7 bảng có tenantIsolationPolicy), và bảng mới KHÔNG thừa hưởng GRANT cũ
// (app-role.sql:28 là GRANT ON ALL TABLES chạy một lần; ALTER DEFAULT PRIVILEGES = 0).
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/schema";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

describe("U17a — goi_dich_vu (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("seed 'free' tồn tại với hạn mức 01 MST và không cho tài khoản con", async () => {
    const res = (await db.execute(
      sql`select ma, ten, so_mst_toi_da, cho_tai_khoan_con from goi_dich_vu where ma = 'free'`,
    )) as { rows: Array<Record<string, unknown>> };
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      ma: "free",
      so_mst_toi_da: 1,
      cho_tai_khoan_con: false,
    });
    // Nhãn tiếng Việt phải có — FE hiển thị nhãn này thay cột thô (QĐ-7).
    expect(String(res.rows[0]?.ten ?? "")).not.toBe("");
  });

  it("seed 'free' có đủ 3 ngưỡng rate-limit hạng A (QĐ-5)", async () => {
    const res = (await db.execute(
      sql`select gh_invoices_moi_phut, gh_exports_moi_phut, gh_reconcile_moi_phut
          from goi_dich_vu where ma = 'free'`,
    )) as { rows: Array<Record<string, unknown>> };
    expect(res.rows[0]).toMatchObject({
      gh_invoices_moi_phut: 120,
      gh_exports_moi_phut: 20,
      gh_reconcile_moi_phut: 20,
    });
  });

  it("RLS đã BẬT và FORCE (không để bảng toàn cục thành ngoại lệ đầu tiên)", async () => {
    const res = (await db.execute(
      sql`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'goi_dich_vu'`,
    )) as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> };
    expect(res.rows[0]?.relrowsecurity).toBe(true);
    expect(res.rows[0]?.relforcerowsecurity).toBe(true);
  });

  it("role app KHÔNG-superuser: ĐỌC được (bắt lỗi quên GRANT — nếu quên, lỗi chỉ lộ sau deploy)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(sql`set role app_user`);
    const res = (await db.execute(sql`select ma from goi_dich_vu where ma = 'free'`)) as {
      rows: Array<{ ma: string }>;
    };
    expect(res.rows[0]?.ma).toBe("free");
    await db.execute(sql`reset role`);
  });

  it("KHÔNG có policy ghi nào trên goi_dich_vu (gác đúng tầng RLS, không phải tầng GRANT)", async () => {
    const res = (await db.execute(
      sql`select cmd from pg_policies where tablename = 'goi_dich_vu'`,
    )) as { rows: Array<{ cmd: string }> };
    expect(res.rows.map((r) => r.cmd)).toEqual(["SELECT"]);
  });

  it("role app KHÔNG-superuser CÓ đủ quyền GRANT ghi: RLS vẫn chặn (đường ghi thật là U18)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    // Cấp ĐỦ quyền ghi (giống production, xem app-role.sql:28) để chắc chắn lỗi phía dưới
    // đến từ tầng RLS, không phải bị chặn sớm hơn ở tầng GRANT.
    await db.execute(sql`grant select, insert, update, delete on goi_dich_vu to app_user`);
    await db.execute(sql`set role app_user`);

    // INSERT: RLS chặn bằng NÉM LỖI (đo được — không suy đoán).
    await expect(
      db.execute(sql`insert into goi_dich_vu (ma, ten, so_mst_toi_da) values ('hack', 'x', 999)`),
    ).rejects.toThrow();

    // UPDATE dưới RLS: ĐO ĐƯỢC là KHÔNG ném lỗi — chỉ ảnh hưởng 0 hàng (không có policy
    // nào cho app_user nhìn thấy hàng để sửa). Không được viết rejects.toThrow() ở đây.
    await expect(
      db.execute(sql`update goi_dich_vu set so_mst_toi_da = 999 where ma = 'free'`),
    ).resolves.not.toThrow();

    await db.execute(sql`reset role`);

    // Xác nhận dữ liệu THẬT SỰ không đổi (UPDATE "chạy" nhưng vô hại).
    const after = (await db.execute(
      sql`select so_mst_toi_da from goi_dich_vu where ma = 'free'`,
    )) as { rows: Array<{ so_mst_toi_da: number }> };
    expect(after.rows[0]?.so_mst_toi_da).toBe(1);
  });
});

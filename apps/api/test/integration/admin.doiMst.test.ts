// Sửa MST trong Cổng Admin (spec 2026-07-23) — tầng DB.
//
// Chặn theo `lan_dong_bo` (đã từng đồng bộ), KHÔNG chạm `hoa_don` — ranh giới pháp lý cứng
// cấm đường quản trị tới bảng hoá đơn (chốt 2026-07-15). Role riêng `doi_mst_api`, hàm
// KHÔNG mang tiền tố `admin_` (không đảo danh sách admin_* mà 0011 khoá bằng test bất biến).
import { auditLogAdmin, lanDongBo, nguoiDung, taiKhoanThue, tenants } from "@vat/db";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  adminTokenFor,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedSuperAdmin,
  tokenFor,
} from "../helpers";

/** Tạo một tài khoản thuế cho tenant, trả id — `lan_dong_bo` cần nó (FK not-null). */
async function themTaiKhoanThue(
  db: Db,
  tenantId: string,
  username = "0100000001",
): Promise<string> {
  const [k] = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username, loai: "chinh" })
    .returning({ id: taiKhoanThue.id });
  return k?.id as string;
}

/** Ghi một lượt đồng bộ — dấu hiệu "tenant đã có dữ liệu thật" mà hàm dùng để chặn. */
async function themLanDongBo(db: Db, tenantId: string, taikhoanId: string): Promise<void> {
  await db.insert(lanDongBo).values({
    tenantId,
    taikhoanId,
    chieu: "purchase",
    tuNgay: new Date("2026-01-01"),
    denNgay: new Date("2026-01-31"),
  });
}

describe("hàm DB doi_mst_tenant", () => {
  let db: Db;
  let tenantId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty Thử", "0100000001");
    await db.insert(nguoiDung).values({ tenantId, email: "a@b.vn", vaiTro: "quan_tri" });
  });

  const doi = (mstMoi: string, id = tenantId) =>
    db.execute(
      sql`select id, mst_cu, mst_moi, so_tk_thue_da_xoa from doi_mst_tenant(${id}::uuid, ${mstMoi})`,
    ) as Promise<{
      rows: Array<{ id: string; mst_cu: string; mst_moi: string; so_tk_thue_da_xoa: number }>;
    }>;

  it("đổi MST thành công khi chưa đồng bộ, 0 kết nối", async () => {
    const r = await doi("0100000002");
    expect(r.rows[0]).toMatchObject({
      mst_cu: "0100000001",
      mst_moi: "0100000002",
      so_tk_thue_da_xoa: 0,
    });
    const t = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0];
    expect(t?.mst).toBe("0100000002");
  });

  it("🔴 có kết nối thuế (chưa đồng bộ) → đổi + XOÁ tài khoản thuế", async () => {
    await themTaiKhoanThue(db, tenantId);
    const r = await doi("0100000002");
    expect(r.rows[0]?.so_tk_thue_da_xoa).toBe(1);
    const con = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.tenantId, tenantId));
    expect(con).toHaveLength(0);
  });

  it("🔴 ĐÃ TỪNG ĐỒNG BỘ → ném da_co_du_lieu, KHÔNG đổi gì", async () => {
    const kId = await themTaiKhoanThue(db, tenantId);
    await themLanDongBo(db, tenantId, kId);
    // RAISE EXCEPTION của Postgres bị drizzle bọc — thông điệp gốc nằm ở `.cause.message`,
    // KHÔNG phải `.message` (giống `.cause.code` cho lỗi UNIQUE). Route đọc cùng chỗ này.
    await expect(doi("0100000002")).rejects.toMatchObject({
      cause: { message: expect.stringContaining("da_co_du_lieu") },
    });
    const t = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0];
    expect(t?.mst).toBe("0100000001"); // nguyên vẹn
    const con = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.tenantId, tenantId));
    expect(con).toHaveLength(1); // kết nối cũng không bị xoá
  });

  it("🔴 đổi sang MST đã có tenant khác → 23505, KHÔNG xoá kết nối", async () => {
    await makeTenant(db, "Cty B", "0100000099");
    await themTaiKhoanThue(db, tenantId);
    await expect(doi("0100000099")).rejects.toMatchObject({ cause: { code: "23505" } });
    // Giao dịch rollback ⇒ kết nối còn nguyên.
    const con = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.tenantId, tenantId));
    expect(con).toHaveLength(1);
  });

  it("đổi sang chính MST cũ → không xoá kết nối, so_tk_thue_da_xoa = 0", async () => {
    await themTaiKhoanThue(db, tenantId);
    const r = await doi("0100000001");
    expect(r.rows[0]?.so_tk_thue_da_xoa).toBe(0);
    const con = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.tenantId, tenantId));
    expect(con).toHaveLength(1); // không ngắt kết nối oan
  });

  it("tenant không tồn tại → ném khong_thay", async () => {
    await expect(doi("0100000002", crypto.randomUUID())).rejects.toMatchObject({
      cause: { message: expect.stringContaining("khong_thay") },
    });
  });

  it("🔴 hàm thuộc doi_mst_api, PUBLIC không gọi được", async () => {
    const r = (await db.execute(sql`
      select r.rolname, has_function_privilege('public', p.oid, 'EXECUTE') pub
      from pg_proc p join pg_roles r on r.oid = p.proowner where p.proname = 'doi_mst_tenant'`)) as {
      rows: Array<{ rolname: string; pub: boolean }>;
    };
    expect(r.rows[0]?.rolname).toBe("doi_mst_api");
    expect(r.rows[0]?.pub).toBe(false);
  });

  it("🔴 doi_mst_api KHÔNG có bất kỳ quyền nào trên bảng hoa_don (ranh giới pháp lý)", async () => {
    const r = (await db.execute(sql`
      select count(*)::int n from information_schema.role_table_grants
      where grantee = 'doi_mst_api' and table_name = 'hoa_don'`)) as { rows: Array<{ n: number }> };
    expect(r.rows[0]?.n).toBe(0);
  });
});

describe("POST /admin/tenants/:id/doi-mst", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let tenantId: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    const adminId = await seedSuperAdmin(db, "chu@vatengine.vn", "mat-khau-chu");
    token = await adminTokenFor(adminId);
    tenantId = await makeTenant(db, "Cty Thử", "0100000001");
    await db.insert(nguoiDung).values({ tenantId, email: "a@b.vn", vaiTro: "quan_tri" });
  });

  const doi = (mst: unknown, id = tenantId, hdr = bearer(token)) =>
    app.request(
      `/admin/tenants/${id}/doi-mst`,
      {
        method: "POST",
        headers: { ...hdr, "content-type": "application/json" },
        body: JSON.stringify({ mst }),
      },
      makeEnv(),
    );

  it("đổi thành công → 200 + cũ/mới + số tk xoá", async () => {
    const res = await doi("0100000002");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      mst_cu: "0100000001",
      mst_moi: "0100000002",
      so_tk_thue_da_xoa: 0,
    });
  });

  // 12 số = số định danh cá nhân (hộ kinh doanh/cá nhân, TT 86/2024/TT-BTC) — phải nhận.
  it("MST 12 số → 200", async () => {
    const res = await doi("001199012345");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mst_moi: "001199012345" });
  });

  it("🔴 token KHÁCH bị từ chối (route sau requireSuperAdmin)", async () => {
    const kh = bearer(await tokenFor(tenantId, { role: "quan_tri" }));
    const res = await doi("0100000002", tenantId, kh);
    expect(res.status).toBe(401);
  });

  it("🔴 đã đồng bộ → 409 da_co_du_lieu", async () => {
    const [k] = await db
      .insert(taiKhoanThue)
      .values({ tenantId, username: "0100000001", loai: "chinh" })
      .returning({ id: taiKhoanThue.id });
    await db.insert(lanDongBo).values({
      tenantId,
      taikhoanId: k?.id as string,
      chieu: "purchase",
      tuNgay: new Date("2026-01-01"),
      denNgay: new Date("2026-01-31"),
    });
    const res = await doi("0100000002");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "da_co_du_lieu" });
  });

  it("trùng MST tenant khác → 409 mst_da_ton_tai", async () => {
    await makeTenant(db, "Cty B", "0100000099");
    const res = await doi("0100000099");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "mst_da_ton_tai" });
  });

  it("đổi sang MST đơn vị phụ thuộc dạng 10 số-3 số → thành công, lưu 13 số liền", async () => {
    const res = await doi("0100000002-001");
    expect(res.status).toBe(200);
    const t = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0];
    expect(t?.mst).toBe("0100000002001");
  });

  it.each(["123", "abcdefghij", "01000000011", "", "0100000002-01", "0100000002-"])(
    "MST sai dạng %s → 400 mst_khong_hop_le",
    async (mst) => {
      const res = await doi(mst);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "mst_khong_hop_le" });
    },
  );

  it("tenant không tồn tại → 404", async () => {
    const res = await doi("0100000002", crypto.randomUUID());
    expect(res.status).toBe(404);
  });

  it("ghi audit doi_mst_tenant cũ→mới", async () => {
    await doi("0100000002");
    const rows = await db.select().from(auditLogAdmin);
    const a = rows.find((x) => x.hanhDong === "doi_mst_tenant");
    expect(a).toBeDefined();
    const s = JSON.stringify(a?.chiTiet);
    expect(s).toContain("0100000001");
    expect(s).toContain("0100000002");
  });
});

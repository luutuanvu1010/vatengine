// U17b (Task 5, §3.2) — POST /dang-ky: cổng đăng ký công khai CÓ KIỂM SOÁT. Khách tự đăng
// ký → tenant `cho_duyet` (chưa đăng nhập được cho tới khi Admin duyệt, U18). Integration
// Hono + PGlite, offline (testing.md).
import { auditLog, nguoiDung, tenants } from "@vat/db";
import { count, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { hashPassword } from "../../src/password";
import {
  type Db,
  freshDb,
  injectDb,
  makeEnv,
  makeSignupLimiterFactory,
  makeTenant,
} from "../helpers";

function body(over: Record<string, unknown> = {}) {
  return {
    email: "chu.dn@congty.vn",
    tenDoanhNghiep: "Công ty TNHH ABC",
    mst: "0100000099",
    dongYDieuKhoan: true,
    ...over,
  };
}

function dangKy(app: ReturnType<typeof createApp>, b: unknown) {
  return app.request(
    "/dang-ky",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) },
    makeEnv(),
  );
}

describe("POST /dang-ky (U17b Task 5, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
  });

  it("hợp lệ → 201 { ok, trangThai } + tenant cho_duyet/free + user quan_tri password NULL + audit dang_ky", async () => {
    const res = await dangKy(app, body());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, trangThai: "cho_duyet" });

    const t = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    expect(t).toHaveLength(1);
    expect(t[0]?.trangThai).toBe("cho_duyet");
    expect(t[0]?.goiDichVu).toBe("free");
    const tenantId = t[0]?.id as string;

    const u = await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, tenantId));
    expect(u).toHaveLength(1);
    expect(u[0]?.vaiTro).toBe("quan_tri");
    expect(u[0]?.passwordHash).toBeNull();
    expect(u[0]?.email).toBe("chu.dn@congty.vn");

    const a = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
    expect(a.some((x) => x.hanhDong === "dang_ky")).toBe(true);
  });

  it("thiếu dongYDieuKhoan → 400 chua_dong_y_dieu_khoan, KHÔNG tạo hàng nào", async () => {
    const [t0] = await db.select({ n: count() }).from(tenants);
    const [u0] = await db.select({ n: count() }).from(nguoiDung);

    const { dongYDieuKhoan: _drop, ...b } = body();
    const res = await dangKy(app, b);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "chua_dong_y_dieu_khoan" });

    const [t1] = await db.select({ n: count() }).from(tenants);
    const [u1] = await db.select({ n: count() }).from(nguoiDung);
    expect(t1?.n).toBe(t0?.n);
    expect(u1?.n).toBe(u0?.n);
  });

  it("dongYDieuKhoan = false → 400 chua_dong_y_dieu_khoan, KHÔNG tạo hàng nào", async () => {
    const res = await dangKy(app, body({ dongYDieuKhoan: false }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "chua_dong_y_dieu_khoan" });
    expect((await db.select().from(tenants)).length).toBe(0);
    expect((await db.select().from(nguoiDung)).length).toBe(0);
  });

  it("email rác → 400 email_khong_hop_le (KHÔNG lộ ly_do nội bộ)", async () => {
    const res = await dangKy(app, body({ email: "khong-hop-le" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "email_khong_hop_le" });
  });

  for (const mst of ["010000009", "01000000999", "010000009A"]) {
    it(`MST sai dạng (${mst}) → 400 mst_khong_hop_le`, async () => {
      const res = await dangKy(app, body({ mst, email: `khac-${mst}@abc.vn` }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "mst_khong_hop_le" });
    });
  }

  it("MST 13 số hợp lệ → 201 (không chỉ 10 số)", async () => {
    const res = await dangKy(app, body({ mst: "0100000099123", email: "khac13@abc.vn" }));
    expect(res.status).toBe(201);
  });

  it("MST trùng → 409 da_ton_tai", async () => {
    await makeTenant(db, "Cty cũ", "0100000099");
    const res = await dangKy(app, body());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "da_ton_tai" });
  });

  it("email trùng → 409 da_ton_tai, KHÔNG tạo tenant mồ côi (rollback trọn transaction)", async () => {
    const t = await makeTenant(db, "Cty cũ", "0100000001");
    await db.insert(nguoiDung).values({
      tenantId: t,
      email: "chu.dn@congty.vn",
      vaiTro: "quan_tri",
    });

    const res = await dangKy(app, body());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "da_ton_tai" });

    // MST của body() ("0100000099") KHÔNG trùng — nếu tenant vẫn được tạo trước khi user
    // insert thất bại thì đây sẽ là một tenant "mồ côi" (không có người dùng nào đăng nhập
    // được). Phải rỗng ⇒ chứng minh cả hai insert nằm trong CÙNG một transaction.
    const orphan = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    expect(orphan).toHaveLength(0);
  });

  it("vượt ngưỡng IP → 429 qua_nhieu_yeu_cau + Retry-After", async () => {
    const limitedApp = createApp(
      injectDb(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        makeSignupLimiterFactory({ maxMoiCuaSo: 2, cuaSoMs: 3_600_000 }),
      ),
    );
    await dangKy(limitedApp, body({ mst: "0100000001", email: "a1@abc.vn" }));
    await dangKy(limitedApp, body({ mst: "0100000002", email: "a2@abc.vn" }));
    const res = await dangKy(limitedApp, body({ mst: "0100000003", email: "a3@abc.vn" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "qua_nhieu_yeu_cau" });
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("cách ly: đăng ký không đọc/ghi chạm dữ liệu tenant khác đang có", async () => {
    const other = await makeTenant(db, "Cty khác", "0100000001");
    await db.insert(nguoiDung).values({
      tenantId: other,
      email: "khac@existing.vn",
      vaiTro: "quan_tri",
    });
    await db.insert(auditLog).values({ tenantId: other, hanhDong: "seed_khac", chiTiet: {} });

    const res = await dangKy(app, body());
    expect(res.status).toBe(201);

    const otherUsers = await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, other));
    expect(otherUsers).toHaveLength(1);
    const otherAudit = await db.select().from(auditLog).where(eq(auditLog.tenantId, other));
    expect(otherAudit).toHaveLength(1);
    expect(otherAudit[0]?.hanhDong).toBe("seed_khac");
  });

  it("tenant vừa đăng ký KHÔNG đăng nhập được dù CÓ mật khẩu (nối Task 4 — cổng trạng thái)", async () => {
    const res = await dangKy(app, body());
    expect(res.status).toBe(201);
    const t = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    const tenantId = t[0]?.id as string;

    // Đặt mật khẩu tay để chứng minh cổng trạng thái chặn vì trang_thai='cho_duyet',
    // KHÔNG PHẢI vì password_hash NULL.
    await db
      .update(nguoiDung)
      .set({ passwordHash: await hashPassword("mat-khau-bat-ky") })
      .where(eq(nguoiDung.tenantId, tenantId));

    const loginRes = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "chu.dn@congty.vn", password: "mat-khau-bat-ky" }),
      },
      makeEnv(),
    );
    expect(loginRes.status).toBe(401);
  });

  // QĐ-1 — điểm chốt hướng đi của cả route: INSERT tenant qua withTenant(UUID tự sinh) có
  // THẬT SỰ lọt qua RLS dưới role production (non-superuser, không sở hữu bảng, không
  // BYPASSRLS) hay không. Test khác trong file này chạy dưới role mặc định của PGlite
  // (postgres, SUPERUSER) nên tự động bypass RLS — không chứng minh được gì về QĐ-1. Test
  // này set ROLE thật trên cùng kết nối trước khi gọi route, mô phỏng đúng cấu hình
  // production (packages/db/provisioning/app-role.sql) để không tin theo tài liệu suông
  // (CLAUDE.md — nguyên tắc bằng chứng).
  it("QĐ-1: INSERT tenant qua withTenant lọt RLS dưới role production non-superuser", async () => {
    await db.execute(
      sql`create role vat_app_probe login nosuperuser nobypassrls nocreatedb nocreaterole`,
    );
    await db.execute(sql`grant usage on schema public to vat_app_probe`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to vat_app_probe`,
    );
    await db.execute(sql`grant usage, select on all sequences in schema public to vat_app_probe`);
    await db.execute(sql`set role vat_app_probe`);

    let res: Response;
    try {
      res = await dangKy(app, body({ mst: "0100000077", email: "probe@abc.vn" }));
    } finally {
      await db.execute(sql`reset role`);
    }

    expect(res.status).toBe(201);
    const t = await db.select().from(tenants).where(eq(tenants.mst, "0100000077"));
    expect(t).toHaveLength(1);
    expect(t[0]?.trangThai).toBe("cho_duyet");
  });
});

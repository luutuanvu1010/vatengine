// U18 (QĐ-2) — Vòng đời mật khẩu TẠM, đi trọn đường thật:
//   super-admin Duyệt → khách nhận 6 số → đăng nhập → BUỘC đổi → mật khẩu tạm chết.
//
// Đây là phần đóng lại lỗ hổng mà chính U18 mở ra. Mật khẩu 6 chữ số chỉ an toàn nhờ ba
// ràng buộc (hết hạn 72h / buộc đổi / rate-limit login); các test dưới đây kiểm hai cái
// đầu — cái thứ ba là LOGIN_LIMITER đã có từ H-A.5b, không dựng lại.
import { auditLog, nguoiDung } from "@vat/db";
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
  stubTurnstile,
  tokenFor,
  voiCaptcha,
} from "../helpers";

const EMAIL_KHACH = "chu.cty@congty.vn";

describe("Vòng đời mật khẩu tạm", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantId: string;
  let userId: string;
  let tokenAdmin: string;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantId = await makeTenant(db, "Cty Chờ Duyệt", "0100000001");
    await db.execute(sql`update tenants set trang_thai = 'cho_duyet' where id = ${tenantId}::uuid`);
    const [u] = await db
      .insert(nguoiDung)
      .values({ tenantId, email: EMAIL_KHACH, vaiTro: "quan_tri" })
      .returning({ id: nguoiDung.id });
    userId = u?.id as string;
    const adminId = await seedSuperAdmin(db, "chu@vatengine.vn", "mat-khau-chu");
    tokenAdmin = await adminTokenFor(adminId);
  });

  async function duyet(): Promise<string> {
    const res = await app.request(
      `/admin/tenants/${tenantId}/duyet`,
      { method: "POST", headers: bearer(tokenAdmin) },
      makeEnv(),
    );
    return ((await res.json()) as { mat_khau_tam: string }).mat_khau_tam;
  }

  const login = (password: string) =>
    app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voiCaptcha({ email: EMAIL_KHACH, password })),
      },
      makeEnv(),
    );

  const doiMatKhau = (token: string, body: unknown) =>
    app.request(
      "/auth/doi-mat-khau",
      {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      makeEnv(),
    );

  it("đăng nhập bằng mật khẩu tạm → 200 kèm cờ phai_doi_mat_khau", async () => {
    const mk = await duyet();
    const res = await login(mk);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, phai_doi_mat_khau: true });
  });

  it("người dùng bình thường (không mật khẩu tạm) giữ NGUYÊN hợp đồng {ok:true} như trước U18", async () => {
    // Không hồi quy U8/U17b: cờ chỉ xuất hiện khi thực sự phải đổi, nên không đơn vị đang
    // chạy nào phải sửa theo.
    const tenantB = await makeTenant(db, "Cty B", "0100000002");
    const { hashPassword } = await import("../../src/password");
    await db.insert(nguoiDung).values({
      tenantId: tenantB,
      email: "binh.thuong@b.vn",
      passwordHash: await hashPassword("mat-khau-cua-toi"),
      vaiTro: "ke_toan",
    });
    const res = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          voiCaptcha({ email: "binh.thuong@b.vn", password: "mat-khau-cua-toi" }),
        ),
      },
      makeEnv(),
    );
    expect(await res.json()).toEqual({ ok: true });
  });

  it("🔴 mật khẩu tạm QUÁ HẠN 72h → 401 dù gõ ĐÚNG", async () => {
    const mk = await duyet();
    expect((await login(mk)).status).toBe(200); // còn hạn thì vào được

    // Đẩy hạn về quá khứ — mô phỏng khách để quên mã 4 ngày.
    await db
      .update(nguoiDung)
      .set({ matKhauTamHetHan: new Date(Date.now() - 1000) })
      .where(eq(nguoiDung.id, userId));

    const res = await login(mk);
    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("quá hạn ghi audit login_fail_mat_khau_tam_het_han (phân biệt được với sai mật khẩu)", async () => {
    const mk = await duyet();
    await db
      .update(nguoiDung)
      .set({ matKhauTamHetHan: new Date(Date.now() - 1000) })
      .where(eq(nguoiDung.id, userId));
    await login(mk);

    const rows = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
    expect(JSON.stringify(rows)).toMatch(/login_fail_mat_khau_tam_het_han/);
  });

  it("🔴 đổi mật khẩu → mật khẩu tạm CHẾT, mật khẩu mới dùng được, cờ tắt", async () => {
    const mk = await duyet();
    const token = await tokenFor(tenantId, { role: "quan_tri", sub: userId });

    const res = await doiMatKhau(token, {
      mat_khau_hien_tai: mk,
      mat_khau_moi: "mat-khau-that-cua-toi",
    });
    expect(res.status).toBe(200);

    expect((await login(mk)).status).toBe(401);
    const moi = await login("mat-khau-that-cua-toi");
    expect(moi.status).toBe(200);
    // Cờ đã tắt ⇒ phản hồi trở lại hợp đồng gọn.
    expect(await moi.json()).toEqual({ ok: true });

    const [u] = await db.select().from(nguoiDung).where(eq(nguoiDung.id, userId));
    expect(u?.phaiDoiMatKhau).toBe(false);
    expect(u?.matKhauTamHetHan).toBeNull();
  });

  it("🔴 đổi mật khẩu ĐÒI mật khẩu hiện tại — phiên bị chiếm không đủ để chiếm tài khoản", async () => {
    await duyet();
    const token = await tokenFor(tenantId, { role: "quan_tri", sub: userId });
    const res = await doiMatKhau(token, {
      mat_khau_hien_tai: "doan-bua",
      mat_khau_moi: "mat-khau-cua-ke-tan-cong",
    });
    expect(res.status).toBe(401);

    const [u] = await db.select().from(nguoiDung).where(eq(nguoiDung.id, userId));
    expect(u?.phaiDoiMatKhau).toBe(true); // không có gì thay đổi
  });

  it("mật khẩu mới trùng mật khẩu hiện tại → 400 (không cho biến bước buộc-đổi thành hình thức)", async () => {
    const mk = await duyet();
    const token = await tokenFor(tenantId, { role: "quan_tri", sub: userId });
    const res = await doiMatKhau(token, { mat_khau_hien_tai: mk, mat_khau_moi: mk });
    expect(res.status).toBe(400);
  });

  it("mật khẩu mới quá ngắn → 400", async () => {
    const mk = await duyet();
    const token = await tokenFor(tenantId, { role: "quan_tri", sub: userId });
    const res = await doiMatKhau(token, { mat_khau_hien_tai: mk, mat_khau_moi: "ngan" });
    expect(res.status).toBe(400);
  });

  it("🔴 mật khẩu tạm quá hạn KHÔNG dùng được làm chìa để đặt mật khẩu vĩnh viễn", async () => {
    // Nếu bỏ cổng này, ai còn giữ mã cũ vẫn "hợp thức hoá" được nó thành mật khẩu thật —
    // cửa sổ 72h thành vô nghĩa.
    const mk = await duyet();
    const token = await tokenFor(tenantId, { role: "quan_tri", sub: userId });
    await db
      .update(nguoiDung)
      .set({ matKhauTamHetHan: new Date(Date.now() - 1000) })
      .where(eq(nguoiDung.id, userId));

    const res = await doiMatKhau(token, {
      mat_khau_hien_tai: mk,
      mat_khau_moi: "mat-khau-that-cua-toi",
    });
    expect(res.status).toBe(401);
  });

  it("không có token → 401", async () => {
    const res = await app.request(
      "/auth/doi-mat-khau",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mat_khau_hien_tai: "a", mat_khau_moi: "bbbbbbbb" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("🔴 token của tenant KHÁC không đổi được mật khẩu người này", async () => {
    await duyet();
    const tenantB = await makeTenant(db, "Cty B", "0100000002");
    // Token hợp lệ của B nhưng `sub` trỏ vào người dùng của A. RLS trong withTenant(B)
    // làm hàng đó vô hình ⇒ không tìm thấy ⇒ 401.
    const tokenB = await tokenFor(tenantB, { role: "quan_tri", sub: userId });
    const res = await doiMatKhau(tokenB, {
      mat_khau_hien_tai: "bat-ky",
      mat_khau_moi: "mat-khau-moi-dai",
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /admin/audit", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tokenAdmin: string;
  let tenantId: string;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    await db.execute(sql`update tenants set trang_thai = 'cho_duyet' where id = ${tenantId}::uuid`);
    const adminId = await seedSuperAdmin(db, "chu@vatengine.vn", "mat-khau-chu");
    tokenAdmin = await adminTokenFor(adminId);
  });

  it("trả nhật ký quản trị sau khi có thao tác + total", async () => {
    await app.request(
      `/admin/tenants/${tenantId}/tu-choi`,
      { method: "POST", headers: bearer(tokenAdmin) },
      makeEnv(),
    );
    const res = await app.request("/admin/audit", { headers: bearer(tokenAdmin) }, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ hanh_dong: string }>; total: number };
    expect(body.total).toBeGreaterThan(0);
    expect(body.items.some((x) => x.hanh_dong === "tu_choi_tenant")).toBe(true);
  });

  it("🔴 token khách KHÔNG đọc được nhật ký quản trị", async () => {
    const tokenKhach = await tokenFor(tenantId, { role: "quan_tri" });
    const res = await app.request("/admin/audit", { headers: bearer(tokenKhach) }, makeEnv());
    expect(res.status).toBe(401);
  });
});

// U18 §5 — Quản trị vòng đời tenant + cổng requireSuperAdmin.
//
// File chị em: admin.cachLy.test.ts giữ BẤT BIẾN CÁCH LY (điều kiện xong bắt buộc). Ở đây
// là hành vi nghiệp vụ + ranh giới quyền.
import { auditLogAdmin, nguoiDung } from "@vat/db";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  TEST_SECRET,
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

const EMAIL_ADMIN = "chu@vatengine.vn";
const MK_ADMIN = "mat-khau-chu-du-an";

describe("🔴 requireSuperAdmin — cổng vào miền quản trị", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    await seedSuperAdmin(db, EMAIL_ADMIN, MK_ADMIN);
  });

  const goi = (headers: Record<string, string> = {}) =>
    app.request("/admin/tenants", { headers }, makeEnv());

  it("thiếu token → 401", async () => {
    expect((await goi()).status).toBe(401);
  });

  it("🔴 token KHÁCH (kể cả vai quan_tri) bị TỪ CHỐI ở miền admin", async () => {
    // Đây là bất biến gốc: quyền cao nhất trong một tenant vẫn KHÔNG phải quyền quản trị
    // hệ thống. Hai thứ đó không nằm trên cùng một thang.
    const tokenKhach = await tokenFor(tenantA, { role: "quan_tri" });
    expect((await goi(bearer(tokenKhach))).status).toBe(401);
  });

  it("token admin ký bằng secret KHÁCH → 401", async () => {
    const boGia = await adminTokenFor(crypto.randomUUID(), TEST_SECRET);
    expect((await goi(bearer(boGia))).status).toBe(401);
  });

  it("token admin hợp lệ → 200", async () => {
    const token = await adminTokenFor(crypto.randomUUID());
    expect((await goi(bearer(token))).status).toBe(200);
  });

  it("token dị dạng / rỗng → 401, không rò lý do", async () => {
    for (const t of ["", "khong-phai-jwt", "a.b.c"]) {
      const res = await goi(bearer(t));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("🔴 cấu hình secret trùng → 503 trên route đã gác (không chỉ ở /login)", async () => {
    const env = makeEnv();
    env.ADMIN_JWT_SECRET = TEST_SECRET;
    const token = await adminTokenFor(crypto.randomUUID());
    const res = await app.request("/admin/tenants", { headers: bearer(token) }, env);
    expect(res.status).toBe(503);
  });
});

describe("Quản trị tenant — vòng đời + metadata", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let adminId: string;
  let token: string;
  let tenantChoDuyet: string;
  let tenantActive: string;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
    app = createApp(injectDb(db));
    adminId = await seedSuperAdmin(db, EMAIL_ADMIN, MK_ADMIN);
    token = await adminTokenFor(adminId);

    tenantChoDuyet = await makeTenant(db, "Cty Chờ Duyệt", "0100000001");
    await db.execute(
      sql`update tenants set trang_thai = 'cho_duyet' where id = ${tenantChoDuyet}::uuid`,
    );
    await db.insert(nguoiDung).values({
      tenantId: tenantChoDuyet,
      email: "chu.cty@congty.vn",
      vaiTro: "quan_tri",
    });
    tenantActive = await makeTenant(db, "Cty Đang Chạy", "0100000002");
  });

  const goi = (path: string, init: RequestInit = {}) =>
    app.request(
      path,
      {
        ...init,
        headers: { ...bearer(token), "Content-Type": "application/json", ...(init.headers ?? {}) },
      },
      makeEnv(),
    );

  it("GET /admin/tenants thấy NHIỀU tenant (xuyên tenant thật sự) + total", async () => {
    const res = await goi("/admin/tenants");
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("GET /admin/tenants?trang_thai= lọc đúng; ?q= tìm theo MST", async () => {
    const loc = (await (await goi("/admin/tenants?trang_thai=cho_duyet")).json()) as {
      items: Array<{ mst: string }>;
    };
    expect(loc.items).toHaveLength(1);
    expect(loc.items[0]?.mst).toBe("0100000001");

    const tim = (await (await goi("/admin/tenants?q=0100000002")).json()) as {
      items: Array<{ mst: string }>;
    };
    expect(tim.items).toHaveLength(1);
    expect(tim.items[0]?.mst).toBe("0100000002");
  });

  it("🔴 Duyệt: cho_duyet → active, trả mật khẩu tạm MỘT LẦN, khách đăng nhập được", async () => {
    const res = await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      trang_thai: string;
      mat_khau_tam: string;
      email: string;
    };
    expect(body.trang_thai).toBe("active");
    expect(body.mat_khau_tam).toMatch(/^\d{6}$/);
    expect(body.email).toBe("chu.cty@congty.vn");

    // Đây là toàn bộ lý do U18 tồn tại: trước bước này, tenant tự đăng ký KHÔNG đăng nhập
    // được và không ai duyệt được. Sau bước này thì được.
    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          voiCaptcha({ email: "chu.cty@congty.vn", password: body.mat_khau_tam }),
        ),
      },
      makeEnv(),
    );
    expect(login.status).toBe(200);
  });

  it("🔴 mật khẩu tạm KHÔNG đọc lại được và KHÔNG nằm trong audit", async () => {
    const body = (await (
      await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" })
    ).json()) as { mat_khau_tam: string };

    // Không có đường đọc lại: DB chỉ giữ bản băm.
    const chiTiet = await (await goi(`/admin/tenants/${tenantChoDuyet}`)).text();
    expect(chiTiet).not.toContain(body.mat_khau_tam);

    // Và audit ghi RẰNG đã cấp, không ghi cấp cái gì. So trên chuỗi thật, không trên tên khoá.
    const rows = await db.select().from(auditLogAdmin);
    expect(JSON.stringify(rows)).not.toContain(body.mat_khau_tam);
    expect(rows.some((a) => a.hanhDong === "cap_mat_khau_tam")).toBe(true);
  });

  it("Duyệt đặt cờ phai_doi_mat_khau + hạn 72h", async () => {
    await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    const [u] = await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, tenantChoDuyet));
    expect(u?.phaiDoiMatKhau).toBe(true);
    const gio = ((u?.matKhauTamHetHan as Date).getTime() - Date.now()) / 3600_000;
    expect(gio).toBeGreaterThan(71);
    expect(gio).toBeLessThanOrEqual(72);
  });

  it("Khóa → khách KHÔNG đăng nhập được nữa; Mở khóa → được lại", async () => {
    const { mat_khau_tam } = (await (
      await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" })
    ).json()) as { mat_khau_tam: string };

    const login = () =>
      app.request(
        "/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(voiCaptcha({ email: "chu.cty@congty.vn", password: mat_khau_tam })),
        },
        makeEnv(),
      );

    expect((await goi(`/admin/tenants/${tenantChoDuyet}/khoa`, { method: "POST" })).status).toBe(
      200,
    );
    expect((await login()).status).toBe(401);

    expect((await goi(`/admin/tenants/${tenantChoDuyet}/mo-khoa`, { method: "POST" })).status).toBe(
      200,
    );
    expect((await login()).status).toBe(200);
  });

  it("Từ chối: cho_duyet → tu_choi, và tu_choi là trạng thái CUỐI", async () => {
    expect((await goi(`/admin/tenants/${tenantChoDuyet}/tu-choi`, { method: "POST" })).status).toBe(
      200,
    );
    // Không hành động nào đưa tenant đã bị chối từ đi tiếp — kể cả duyệt lại.
    for (const hd of ["duyet", "khoa", "mo-khoa", "tu-choi"]) {
      const res = await goi(`/admin/tenants/${tenantChoDuyet}/${hd}`, { method: "POST" });
      expect({ hd, status: res.status }).toEqual({ hd, status: 409 });
    }
  });

  it("🔴 chuyển trạng thái SAI → 409 và DB KHÔNG đổi", async () => {
    // tenantActive đang 'active' — 'duyet' chỉ hợp lệ từ 'cho_duyet'.
    const res = await goi(`/admin/tenants/${tenantActive}/duyet`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ tu_mong_doi: "cho_duyet" });

    const r = await db.execute(
      sql`select trang_thai from tenants where id = ${tenantActive}::uuid`,
    );
    expect(r.rows[0]?.trang_thai).toBe("active");
  });

  it("thao tác LẶP (bấm Duyệt hai lần) → lần hai 409, không cấp mật khẩu tạm mới", async () => {
    const lan1 = (await (
      await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" })
    ).json()) as { mat_khau_tam: string };
    const lan2 = await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });

    expect(lan2.status).toBe(409);
    // Quan trọng: nếu lần hai vẫn cấp mật khẩu mới, mật khẩu lần một mà admin đã đọc cho
    // khách qua điện thoại sẽ chết im lặng.
    expect(await lan2.text()).not.toContain(lan1.mat_khau_tam);
  });

  it("tenant không tồn tại → 404 (phân biệt với 409 sai trạng thái)", async () => {
    const res = await goi(`/admin/tenants/${crypto.randomUUID()}/duyet`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("id không phải UUID → 400", async () => {
    expect((await goi("/admin/tenants/khong-phai-uuid")).status).toBe(400);
  });

  it("🔴 PATCH sửa được ten/goi_dich_vu nhưng TỪ CHỐI mst", async () => {
    const ok = await goi(`/admin/tenants/${tenantActive}`, {
      method: "PATCH",
      body: JSON.stringify({ ten: "Tên Đã Sửa" }),
    });
    expect(ok.status).toBe(200);

    // MST là khoá tự nhiên (U23-D: 1 MST ↔ 1 tenant) — đổi được nó là đổi danh tính pháp
    // lý của một doanh nghiệp. `.strict()` phải chặn thẳng bằng 400, không im lặng bỏ qua.
    const chan = await goi(`/admin/tenants/${tenantActive}`, {
      method: "PATCH",
      body: JSON.stringify({ mst: "9999999999" }),
    });
    expect(chan.status).toBe(400);

    const r = await db.execute(sql`select ten, mst from tenants where id = ${tenantActive}::uuid`);
    expect(r.rows[0]).toMatchObject({ ten: "Tên Đã Sửa", mst: "0100000002" });
  });

  it("PATCH ghi audit CŨ → MỚI, không chỉ tên trường", async () => {
    await goi(`/admin/tenants/${tenantActive}`, {
      method: "PATCH",
      body: JSON.stringify({ ten: "Tên Đã Sửa" }),
    });
    const rows = await db.select().from(auditLogAdmin);
    const a = rows.find((x) => x.hanhDong === "sua_metadata_tenant");
    const s = JSON.stringify(a?.chiTiet);
    expect(s).toContain("Cty Đang Chạy"); // giá trị CŨ
    expect(s).toContain("Tên Đã Sửa"); // giá trị MỚI
  });

  it("reset-mat-khau cấp mật khẩu MỚI và vô hiệu cái cũ", async () => {
    const cu = (await (
      await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" })
    ).json()) as { mat_khau_tam: string };
    const moi = (await (
      await goi(`/admin/tenants/${tenantChoDuyet}/reset-mat-khau`, { method: "POST" })
    ).json()) as { mat_khau_tam: string };

    expect(moi.mat_khau_tam).not.toBe(cu.mat_khau_tam);

    const login = (mk: string) =>
      app.request(
        "/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(voiCaptcha({ email: "chu.cty@congty.vn", password: mk })),
        },
        makeEnv(),
      );
    expect((await login(cu.mat_khau_tam)).status).toBe(401);
    expect((await login(moi.mat_khau_tam)).status).toBe(200);
  });

  it("mọi thao tác ghi audit đúng người thực hiện", async () => {
    await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    const rows = await db.select().from(auditLogAdmin);
    expect(rows.length).toBeGreaterThan(0);
    for (const a of rows) expect(a.nguoiThucHien).toBe(adminId);
  });

  it("🔴 GET chi tiết trả metadata nhưng KHÔNG có hóa đơn, KHÔNG có token thuế thô", async () => {
    const res = await goi(`/admin/tenants/${tenantChoDuyet}`);
    const s = await res.text();
    expect(res.status).toBe(200);
    expect(s).toContain("chu.cty@congty.vn");
    expect(s).not.toContain("password_hash");
    expect(s).not.toContain("token_hien_tai");
  });
});

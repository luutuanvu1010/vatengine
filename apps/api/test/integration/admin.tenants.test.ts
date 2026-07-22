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
  makeEmailSpy,
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
  // Lát cắt 3 — mọi test trong khối này đều đọc được thư đã gửi. Duyệt giờ KHÔNG trả mật
  // khẩu nữa, nên đường duy nhất tới một tài khoản đăng nhập được là đi qua lá thư — đúng
  // như khách thật. Test bám vào đường thật thay vì một cửa sau chỉ test mới có.
  let thu: ReturnType<typeof makeEmailSpy>;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
    thu = makeEmailSpy();
    app = createApp({ ...injectDb(db), getEmailTransport: thu.factory });
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

  /** Rút token đặt mật khẩu ra khỏi lá thư — đúng việc khách làm khi bấm link trong thư. */
  function tokenTrongThu(i = 0): string {
    const text = thu.daGui[i]?.text ?? "";
    const m = /dat-mat-khau\?token=([^\s"<]+)/.exec(text);
    if (!m?.[1]) throw new Error(`không thấy liên kết đặt mật khẩu trong thư ${i}: ${text}`);
    return decodeURIComponent(m[1]);
  }

  /** Đi trọn đường của khách: bấm link trong thư rồi đặt mật khẩu. */
  const datMatKhau = (tokenTho: string, matKhau: string) =>
    app.request(
      "/dat-mat-khau",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenTho, mat_khau: matKhau }),
      },
      makeEnv(),
    );

  const dangNhap = (matKhau: string) =>
    app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voiCaptcha({ email: "chu.cty@congty.vn", password: matKhau })),
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

  it("🔴 Duyệt: cho_duyet → active, GỬI THƯ, và khách đặt mật khẩu rồi đăng nhập được", async () => {
    const res = await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      trang_thai: "active",
      email: "chu.cty@congty.vn",
      da_gui_thu: true,
    });

    // Đúng một lá thư, tới đúng địa chỉ, mang liên kết `/dat-mat-khau`.
    expect(thu.daGui).toHaveLength(1);
    expect(thu.daGui[0]?.den).toBe("chu.cty@congty.vn");

    // Đây là toàn bộ lý do Lát cắt 3 tồn tại: khách tự đi hết đường, không ai đọc mật khẩu
    // cho ai qua điện thoại.
    expect((await datMatKhau(tokenTrongThu(), "mat-khau-cua-khach")).status).toBe(200);
    expect((await dangNhap("mat-khau-cua-khach")).status).toBe(200);
  });

  it("🔴 QĐ-14 — phản hồi duyệt KHÔNG mang mật khẩu nào", async () => {
    const s = await (
      await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" })
    ).text();
    expect(s).not.toContain("mat_khau_tam");
    // Bất biến cốt lõi: không còn chuỗi 6 chữ số nào để chủ dự án nhìn thấy.
    expect(s).not.toMatch(/\b\d{6}\b/);
  });

  it("🔴 audit ghi ĐÃ GỬI, không ghi token và không ghi email (QĐ-17)", async () => {
    await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    const rows = await db.select().from(auditLogAdmin);
    const hang = rows.find((a) => a.hanhDong === "gui_link_dat_mat_khau");
    expect(hang).toBeDefined();
    const chiTiet = JSON.stringify(hang?.chiTiet);
    expect(chiTiet).not.toContain("chu.cty@congty.vn");
    expect(chiTiet).not.toContain(tokenTrongThu());
    expect(chiTiet).toContain("da_gui_thu");
  });

  it("🔴 gửi thư HỎNG → vẫn duyệt, nhưng phản hồi NÓI RA da_gui_thu=false", async () => {
    // Nuốt lỗi này nghĩa là khách ngồi chờ một lá thư không bao giờ tới, và chủ dự án
    // tưởng mình đã xong việc. Không ai phát hiện được cho tới khi khách gọi điện.
    const hong = makeEmailSpy({ daGui: false, lyDo: "tai_khoan_bi_khoa" });
    const app2 = createApp({ ...injectDb(db), getEmailTransport: hong.factory });
    const res = await app2.request(
      `/admin/tenants/${tenantChoDuyet}/duyet`,
      { method: "POST", headers: bearer(token) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, trang_thai: "active", da_gui_thu: false });
  });

  it("Duyệt KHÔNG đặt cờ mật khẩu tạm — đường đó đã gỡ hẳn (QĐ-14)", async () => {
    await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    const [u] = await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, tenantChoDuyet));
    expect(u?.phaiDoiMatKhau).toBe(false);
    expect(u?.matKhauTamHetHan).toBeNull();
    // Và chưa có mật khẩu nào cho tới khi CHÍNH KHÁCH đặt.
    expect(u?.passwordHash).toBeNull();
  });

  it("Khóa → khách KHÔNG đăng nhập được nữa; Mở khóa → được lại", async () => {
    await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    await datMatKhau(tokenTrongThu(), "mat-khau-cua-khach");

    expect((await goi(`/admin/tenants/${tenantChoDuyet}/khoa`, { method: "POST" })).status).toBe(
      200,
    );
    expect((await dangNhap("mat-khau-cua-khach")).status).toBe(401);

    expect((await goi(`/admin/tenants/${tenantChoDuyet}/mo-khoa`, { method: "POST" })).status).toBe(
      200,
    );
    expect((await dangNhap("mat-khau-cua-khach")).status).toBe(200);
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

  it("thao tác LẶP (bấm Duyệt hai lần) → lần hai 409, KHÔNG gửi thư thứ hai", async () => {
    await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    const lan2 = await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });

    expect(lan2.status).toBe(409);
    // Quan trọng: nếu lần hai vẫn tạo token mới, liên kết trong lá thư khách ĐANG cầm sẽ
    // chết im lặng — họ bấm vào và thấy "đã dùng rồi" cho một thư chưa ai động tới.
    expect(thu.daGui).toHaveLength(1);
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

  it("🔴 gui-link-dat-mat-khau gửi thư MỚI và GIẾT liên kết cũ", async () => {
    await goi(`/admin/tenants/${tenantChoDuyet}/duyet`, { method: "POST" });
    const res = await goi(`/admin/tenants/${tenantChoDuyet}/gui-link-dat-mat-khau`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      email: "chu.cty@congty.vn",
      da_gui_thu: true,
    });

    expect(thu.daGui).toHaveLength(2);
    const cu = tokenTrongThu(0);
    const moi = tokenTrongThu(1);
    expect(moi).not.toBe(cu);

    // Bấm "Gửi lại" mà liên kết cũ vẫn sống là hai chìa cùng mở một cửa, và người bấm
    // tưởng mình vừa thu hồi chìa cũ.
    expect(await (await datMatKhau(cu, "mat-khau-bang-link-cu")).json()).toEqual({
      error: "da_dung",
    });
    expect((await datMatKhau(moi, "mat-khau-bang-link-moi")).status).toBe(200);
    expect((await dangNhap("mat-khau-bang-link-moi")).status).toBe(200);
  });

  it("gui-link-dat-mat-khau cho tenant không tồn tại → 404", async () => {
    const res = await goi(`/admin/tenants/${crypto.randomUUID()}/gui-link-dat-mat-khau`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("🔴 route reset-mat-khau cũ KHÔNG còn tồn tại", async () => {
    // Tên cũ nói dối sau QĐ-14 — nó không reset mật khẩu nào cả. Để lại một cái tên nói
    // dối trong hợp đồng API là để lại một cái bẫy cho người đọc sau.
    const res = await goi(`/admin/tenants/${tenantChoDuyet}/reset-mat-khau`, { method: "POST" });
    expect(res.status).toBe(404);
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

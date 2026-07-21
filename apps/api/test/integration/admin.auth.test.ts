// U18 — POST /admin/auth/login. Đường vào DUY NHẤT của miền super-admin.
//
// Yêu cầu chống dò tài khoản ở đây NGANG với /auth/login của khách (H-A.5a): mọi lý do
// thất bại phải cho ra CÙNG một phản hồi, vì danh sách email quản trị viên của một SaaS là
// thông tin đáng giá với kẻ tấn công.
import { auditLogAdmin } from "@vat/db";
import { sql } from "drizzle-orm";
import { verify } from "hono/jwt";
import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN_AUD, ADMIN_SESSION_COOKIE } from "../../src/admin/adminAuth";
import { createApp } from "../../src/app";
import {
  type Db,
  TEST_ADMIN_SECRET,
  TEST_SECRET,
  freshDb,
  injectDb,
  makeEnv,
  seedSuperAdmin,
  tokenFor,
} from "../helpers";

const EMAIL = "chu@vatengine.vn";
const MAT_KHAU = "mat-khau-chu-du-an";

describe("POST /admin/auth/login", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    await seedSuperAdmin(db, EMAIL, MAT_KHAU);
  });

  function login(email: string, password: string, env = makeEnv()) {
    return app.request(
      "/admin/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      env,
    );
  }

  async function auditAdmin() {
    return db.select().from(auditLogAdmin);
  }

  it("đúng email + mật khẩu → 200 + cookie phiên admin HttpOnly", async () => {
    const res = await login(EMAIL, MAT_KHAU);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const raw = res.headers.get("Set-Cookie") ?? "";
    expect(raw).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(raw).toContain("HttpOnly");
    // Tên cookie PHẢI khác cookie khách — hai phiên sống song song không đè nhau.
    expect(raw).not.toContain("vat_session=");
  });

  it("token phát ra mang aud='admin', KHÔNG mang tenant_id, TTL 2h", async () => {
    const res = await login(EMAIL, MAT_KHAU);
    const raw = res.headers.get("Set-Cookie") ?? "";
    const token = /vat_admin_session=([^;]+)/.exec(raw)?.[1] as string;
    expect(token).toBeTruthy();

    // Verify bằng CHÍNH secret admin: vừa đọc được payload, vừa chứng minh token thực sự
    // được ký bằng khoá của miền admin chứ không phải khoá khách.
    const payload = await verify(token, TEST_ADMIN_SECRET, "HS256");
    expect(payload.aud).toBe(ADMIN_AUD);
    expect(payload.tenant_id).toBeUndefined();
    expect(payload.role).toBeUndefined();
    const song = (payload.exp as number) - Math.floor(Date.now() / 1000);
    expect(song).toBeGreaterThan(2 * 3600 - 60);
    expect(song).toBeLessThanOrEqual(2 * 3600);
  });

  it("email chuẩn hoá không phân biệt hoa/thường (hợp đồng 3 nơi — bài học U17b Task 6)", async () => {
    // Chỉ mục là `lower(email)`, hàm admin_lookup so `lower(email)`, tầng gọi hạ chữ
    // thường. Lệch một chỗ là chủ dự án tự khoá mình ra khỏi Cổng Admin bằng 401 vô cớ.
    const res = await login("  CHU@VatEngine.VN  ", MAT_KHAU);
    expect(res.status).toBe(200);
  });

  it("🔴 sai mật khẩu và email không tồn tại cho ra PHẢN HỒI GIỐNG HỆT NHAU", async () => {
    const saiMatKhau = await login(EMAIL, "mat-khau-sai");
    const khongTonTai = await login("khong-ai@vatengine.vn", MAT_KHAU);

    expect(saiMatKhau.status).toBe(401);
    expect(khongTonTai.status).toBe(401);
    expect(await saiMatKhau.json()).toEqual(await khongTonTai.json());
    expect(saiMatKhau.headers.get("Set-Cookie")).toBeNull();
    expect(khongTonTai.headers.get("Set-Cookie")).toBeNull();
  });

  it("super-admin bị khoá → 401 dù mật khẩu đúng", async () => {
    await db.execute(sql`DELETE FROM quan_tri_he_thong`);
    await seedSuperAdmin(db, EMAIL, MAT_KHAU, "khoa");
    const res = await login(EMAIL, MAT_KHAU);
    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("đăng nhập thành công ghi audit admin_login + cập nhật dang_nhap_cuoi", async () => {
    await login(EMAIL, MAT_KHAU);

    const rows = await auditAdmin();
    const ok = rows.find((a) => a.hanhDong === "admin_login");
    expect(ok).toBeDefined();
    // `nguoi_thuc_hien` là id super-admin — audit phải trả lời được "AI đã làm".
    expect(ok?.nguoiThucHien).toMatch(/^[0-9a-f-]{36}$/i);

    const r = await db.execute(sql`SELECT dang_nhap_cuoi FROM quan_tri_he_thong`);
    expect(r.rows[0]?.dang_nhap_cuoi).not.toBeNull();
  });

  it("đăng nhập thất bại ghi audit admin_login_fail", async () => {
    await login(EMAIL, "mat-khau-sai");
    const rows = await auditAdmin();
    expect(rows.some((a) => a.hanhDong === "admin_login_fail")).toBe(true);
  });

  it("🔴 audit KHÔNG chứa mật khẩu thô dù ở bất kỳ nhánh nào", async () => {
    await login(EMAIL, MAT_KHAU);
    await login(EMAIL, "mat-khau-sai");
    const rows = await auditAdmin();
    expect(rows.length).toBeGreaterThan(0);
    // So trên chuỗi THẬT của mật khẩu, không chỉ trên tên khoá: một bug kiểu
    // `chi_tiet: { thong_tin: body }` sẽ lọt nếu chỉ kiểm "có khoá 'password' không".
    const toanBo = JSON.stringify(rows);
    expect(toanBo).not.toContain(MAT_KHAU);
    expect(toanBo).not.toContain("mat-khau-sai");
  });

  it("body dị dạng → 400, không ghi audit đăng nhập nào", async () => {
    const res = await app.request(
      "/admin/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: 123 }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    expect(await auditAdmin()).toHaveLength(0);
  });
});

describe("🔴 Cổng cấu hình fail-closed (R3) — /admin/* từ chối phục vụ khi secret sai", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    await seedSuperAdmin(db, EMAIL, MAT_KHAU);
  });

  function login(env: ReturnType<typeof makeEnv>) {
    return app.request(
      "/admin/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: MAT_KHAU }),
      },
      env,
    );
  }

  it("thiếu ADMIN_JWT_SECRET → 503, KHÔNG phát token", async () => {
    const env = makeEnv();
    env.ADMIN_JWT_SECRET = undefined;
    const res = await login(env);
    expect(res.status).toBe(503);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("ADMIN_JWT_SECRET TRÙNG JWT_SECRET → 503, KHÔNG phát token", async () => {
    // Cấu hình sai dễ xảy ra nhất (copy-paste lúc `wrangler secret put`). Nếu để lọt, hai
    // miền token gộp làm một. Thà Cổng Admin không chạy còn hơn chạy mà không có ranh giới.
    const env = makeEnv();
    env.ADMIN_JWT_SECRET = TEST_SECRET;
    const res = await login(env);
    expect(res.status).toBe(503);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("hai secret khác nhau → phục vụ bình thường (chứng minh 503 ở trên đến từ ĐÚNG nguyên nhân)", async () => {
    const env = makeEnv();
    env.ADMIN_JWT_SECRET = TEST_ADMIN_SECRET;
    expect((await login(env)).status).toBe(200);
  });
});

describe("GET /admin/auth/me — dò phiên cho Cổng Admin", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    await seedSuperAdmin(db, EMAIL, MAT_KHAU);
  });

  it("có cookie phiên hợp lệ → 200 kèm id admin", async () => {
    const login = await app.request(
      "/admin/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: MAT_KHAU }),
      },
      makeEnv(),
    );
    const cookie = (login.headers.get("Set-Cookie") ?? "").split(";")[0] as string;

    const res = await app.request("/admin/auth/me", { headers: { Cookie: cookie } }, makeEnv());
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
  });

  it("không có phiên → 401 (đây chính là tín hiệu 'chưa đăng nhập' của SPA)", async () => {
    const res = await app.request("/admin/auth/me", {}, makeEnv());
    expect(res.status).toBe(401);
  });

  it("🔴 cookie phiên KHÁCH không dùng được — trả 401 như không có gì", async () => {
    const tokenKhach = await tokenFor("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    const res = await app.request(
      "/admin/auth/me",
      { headers: { Cookie: `vat_session=${tokenKhach}` } },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /admin/auth/logout", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    await seedSuperAdmin(db, EMAIL, MAT_KHAU);
  });

  async function dangNhapLayCookie(): Promise<string> {
    const res = await app.request(
      "/admin/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: MAT_KHAU }),
      },
      makeEnv(),
    );
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0] as string;
  }

  it("🔴 xoá cookie phiên THẬT — sau đăng xuất, cookie cũ không dùng được nữa", async () => {
    const cookie = await dangNhapLayCookie();
    expect(
      (await app.request("/admin/auth/me", { headers: { Cookie: cookie } }, makeEnv())).status,
    ).toBe(200);

    const out = await app.request("/admin/auth/logout", { method: "POST" }, makeEnv());
    expect(out.status).toBe(200);
    // Server phải phát Set-Cookie xoá — chỉ server mới làm được với cookie HttpOnly.
    const xoa = out.headers.get("Set-Cookie") ?? "";
    expect(xoa).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(xoa).toMatch(/Max-Age=0|Expires=/i);
  });

  it("gọi khi CHƯA đăng nhập vẫn 200 (idempotent — không để ai kẹt với cookie hỏng)", async () => {
    const res = await app.request("/admin/auth/logout", { method: "POST" }, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

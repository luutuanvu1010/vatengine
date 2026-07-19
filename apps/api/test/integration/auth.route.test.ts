// U8 integration (PGlite) — POST /auth/login đi qua ĐƯỜNG THẬT: createApp + route +
// auth_lookup_user (SECURITY DEFINER) + verify PBKDF2 + signToken. Token nhận được gọi
// được /invoices. Offline, không mạng.
import { verify } from "hono/jwt";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SESSION_COOKIE } from "../../src/session";
import {
  type Db,
  TEST_SECRET,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedInvoice,
  seedUser,
} from "../helpers";

/** Trích token phiên từ Set-Cookie (test đóng vai trình duyệt) — C2. */
function sessionFrom(res: Response): string | undefined {
  return res.headers.get("Set-Cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`))?.[1];
}

describe("POST /auth/login (integration, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    await seedUser(db, tenantA, "ke.toan@a.vn", "mat-khau-dung", "ke_toan");
    await seedInvoice(db, tenantA, { shdon: "1" });
  });

  async function login(email: string, password: string) {
    return app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      makeEnv(),
    );
  }

  it("đúng email+mật khẩu → 200 + token (trong cookie phiên) mang tenant_id + role đúng", async () => {
    const res = await login("ke.toan@a.vn", "mat-khau-dung");
    expect(res.status).toBe(200);
    // ADR-0003 Amendment #1 (C2): token KHÔNG còn trong body — nó nằm trong cookie
    // HttpOnly. Test đóng vai trình duyệt: đọc Set-Cookie thay vì đọc JSON.
    const token = sessionFrom(res);
    expect(token).toBeTruthy();
    const payload = await verify(token as string, TEST_SECRET, "HS256");
    expect(payload.tenant_id).toBe(tenantA);
    expect(payload.role).toBe("ke_toan");
    expect(payload.exp).toBeGreaterThan(0);
  });

  it("token từ login dùng gọi /invoices → 200, chỉ dữ liệu tenant của mình", async () => {
    const token = sessionFrom(await login("ke.toan@a.vn", "mat-khau-dung")) as string;
    const inv = await app.request("/invoices", { headers: bearer(token) }, makeEnv());
    expect(inv.status).toBe(200);
    const body = (await inv.json()) as { total: number };
    expect(body.total).toBe(1);
  });

  it("mật khẩu SAI → 401 gọn", async () => {
    const res = await login("ke.toan@a.vn", "mat-khau-sai");
    expect(res.status).toBe(401);
  });

  it("email KHÔNG tồn tại → 401 (không rò email sai vs mật khẩu sai)", async () => {
    const res = await login("khong-ton-tai@x.vn", "gi-cung-duoc");
    expect(res.status).toBe(401);
  });

  it("thiếu field → 400", async () => {
    const res = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ke.toan@a.vn" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("body không phải JSON → 400", async () => {
    const res = await app.request(
      "/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

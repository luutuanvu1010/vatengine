// ADR-0003 Amendment #1 (C1–C6) — phiên đăng nhập bằng cookie HttpOnly thay vì JWT
// in-memory. Mục tiêu: reload trang KHÔNG mất phiên, mà JS vẫn KHÔNG chạm được token
// (chống XSS-exfil — nguyên tắc gốc của quyết định #3, giữ nguyên không nới lỏng).
// Offline (PGlite), không mạng.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SESSION_COOKIE } from "../../src/session";
import {
  type Db,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedInvoice,
  seedUser,
  tokenFor,
} from "../helpers";

/** Trích giá trị cookie phiên từ header Set-Cookie (test đóng vai trình duyệt). */
function sessionFrom(res: Response): string | undefined {
  const raw = res.headers.get("Set-Cookie");
  if (!raw) return undefined;
  return raw.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`))?.[1];
}

function cookie(value: string): { Cookie: string } {
  return { Cookie: `${SESSION_COOKIE}=${value}` };
}

describe("Phiên bằng cookie HttpOnly (ADR-0003 Amendment #1)", () => {
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

  /** Đăng nhập qua URL https (production-like) để quan sát cờ Secure. */
  async function login(origin = "https://vatengine.tourdao.vn") {
    return app.request(
      `${origin}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ke.toan@a.vn", password: "mat-khau-dung" }),
      },
      makeEnv(),
    );
  }

  // --- C1: thuộc tính cookie -------------------------------------------------------
  it("C1 — đăng nhập đúng → Set-Cookie có HttpOnly, Secure, SameSite=Strict, Max-Age=28800", async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const raw = res.headers.get("Set-Cookie") ?? "";
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("Secure");
    expect(raw).toContain("SameSite=Strict");
    // 28800s = 8h, khớp ĐÚNG exp của JWT (auth.ts TOKEN_TTL_SEC) — không nới cửa sổ rủi ro.
    expect(raw).toContain("Max-Age=28800");
  });

  it("C5 — cookie mang Path=/ (KHÔNG /auth): trình duyệt thấy /api/auth/*, front-door bóc /api", async () => {
    const raw = (await login()).headers.get("Set-Cookie") ?? "";
    expect(raw).toContain("Path=/");
    expect(raw).not.toContain("Path=/auth");
  });

  it("C1b — dev http://localhost KHÔNG gắn Secure (nếu gắn, cookie bị bỏ trên dev)", async () => {
    const raw = (await login("http://localhost:5173")).headers.get("Set-Cookie") ?? "";
    expect(raw).toContain("HttpOnly");
    expect(raw).not.toContain("Secure");
  });

  // --- C2: token KHÔNG rò ra body ---------------------------------------------------
  it("C2 — body phản hồi login KHÔNG chứa token (nếu chứa, JS lại cầm token ⇒ mất sạch lợi ích)", async () => {
    const res = await login();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.token).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("eyJ"); // không có JWT dưới bất kỳ khóa nào
  });

  // --- C3: cookie xác thực được; Bearer vẫn còn ------------------------------------
  it("C3 — chỉ với cookie (KHÔNG Authorization) gọi /invoices → 200, đúng dữ liệu tenant", async () => {
    const sess = sessionFrom(await login());
    expect(sess).toBeTruthy();
    const res = await app.request("/invoices", { headers: cookie(sess as string) }, makeEnv());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { total: number }).total).toBe(1);
  });

  it("C3b — Bearer vẫn hoạt động (không phá client không-trình-duyệt & test cũ)", async () => {
    const res = await app.request(
      "/invoices",
      { headers: bearer(await tokenFor(tenantA)) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });

  it("C3c — cookie rác → 401 (không nhận bừa)", async () => {
    const res = await app.request("/invoices", { headers: cookie("khong-phai-jwt") }, makeEnv());
    expect(res.status).toBe(401);
  });

  // --- C4: logout thật sự -----------------------------------------------------------
  it("C4 — POST /auth/logout → Set-Cookie Max-Age=0 (xoá cookie ở trình duyệt)", async () => {
    const sess = sessionFrom(await login());
    const res = await app.request(
      "https://vatengine.tourdao.vn/auth/logout",
      { method: "POST", headers: cookie(sess as string) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const raw = res.headers.get("Set-Cookie") ?? "";
    expect(raw).toContain(`${SESSION_COOKIE}=`);
    expect(raw).toContain("Max-Age=0");
  });

  // --- C6: CSRF ----------------------------------------------------------------------
  it("C6 — POST kèm Origin NGOẠI LAI → 403 (cookie tự gửi kèm ⇒ phải chặn CSRF)", async () => {
    const sess = sessionFrom(await login());
    const res = await app.request(
      "https://vatengine.tourdao.vn/me",
      {
        method: "PATCH",
        headers: {
          ...cookie(sess as string),
          "Content-Type": "application/json",
          Origin: "https://ke-tan-cong.example",
        },
        body: JSON.stringify({ ten: "bị đổi bởi CSRF" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });

  // Khẳng định theo MÃ LỖI chứ không theo status: PATCH /me còn cổng RBAC (chỉ quan_tri)
  // cũng trả 403, nên `status !== 403` không phân biệt được "CSRF cho qua" với "RBAC chặn".
  // Chỉ `error !== "forbidden_origin"` mới chứng minh đúng điều cần kiểm.
  it("C6b — POST kèm Origin CÙNG origin → KHÔNG bị lớp CSRF chặn", async () => {
    const sess = sessionFrom(await login());
    const res = await app.request(
      "https://vatengine.tourdao.vn/me",
      {
        method: "PATCH",
        headers: {
          ...cookie(sess as string),
          "Content-Type": "application/json",
          Origin: "https://vatengine.tourdao.vn",
        },
        body: JSON.stringify({ ten: "Cty A đổi tên" }),
      },
      makeEnv(),
    );
    const body = (await res.json()) as { error?: string };
    expect(body.error).not.toBe("forbidden_origin");
  });

  it("C6c — GET kèm Origin ngoại lai KHÔNG bị chặn (chỉ method đổi trạng thái mới kiểm)", async () => {
    const sess = sessionFrom(await login());
    const res = await app.request(
      "/invoices",
      { headers: { ...cookie(sess as string), Origin: "https://ke-tan-cong.example" } },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

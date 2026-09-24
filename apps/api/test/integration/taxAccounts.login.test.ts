// apps/api/test/integration/taxAccounts.login.test.ts
import { auditLog, readToken, taiKhoanThue } from "@vat/db";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  TEST_KEK,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  makeTransport,
  seedTaxAccount,
  tokenFor,
} from "../helpers";

// JWT tổng hợp có exp (giây epoch) để authenticate() trả token hợp lệ.
function fakeJwt(expSec: number): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64({ exp: expSec })}.sig`;
}
const okTransport = (token: string) =>
  makeTransport({
    fetch: async () =>
      new Response(JSON.stringify({ token }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
const loginReq = (id: string, token: string) => ({
  method: "POST",
  headers: { ...bearer(token), "content-type": "application/json" },
  body: JSON.stringify({ password: "mk", ckey: "K1", cvalue: "abcd" }),
});

describe("POST /tax-accounts/:id/login (PGlite)", () => {
  let db: Db;
  let tenantA: string;
  let accId: string;
  const expSec = 1_900_000_000;
  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    accId = await seedTaxAccount(db, tenantA, { uyQuyenLuc: new Date() }); // đã ủy quyền
  });

  it("đăng nhập → 200, LƯU token SEALED (không phải token thô), readToken giải mã đúng", async () => {
    const gdtToken = fakeJwt(expSec);
    const app = createApp(injectDb(db, undefined, okTransport(gdtToken)));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(200);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    if (!acc) throw new Error("tài khoản không tồn tại sau login");
    expect(acc.tokenHienTai?.startsWith("v1$")).toBe(true); // sealed, KHÔNG phải gdtToken thô
    expect(acc.tokenHienTai).not.toBe(gdtToken);
    const dec = await readToken(db as never, tenantA, accId, TEST_KEK);
    expect(dec?.token).toBe(gdtToken);
    expect(dec?.tokenHetHan?.getTime()).toBe(expSec * 1000);
  });

  it("chưa ủy quyền → 409, KHÔNG lưu token", async () => {
    const accNoAuth = await seedTaxAccount(db, tenantA, { username: "0100000002" }); // uy_quyen_luc null
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(
      `/tax-accounts/${accNoAuth}/login`,
      loginReq(accNoAuth, jwt),
      makeEnv(),
    );
    expect(res.status).toBe(409);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accNoAuth));
    if (!acc) throw new Error("tài khoản không tồn tại sau login");
    expect(acc.tokenHienTai).toBeNull();
  });

  // Sự cố 2026-09-24: route này từng trả 401 khi GDT từ chối. apps/web coi MỌI 401 là
  // "phiên ứng dụng hết hạn" (apiClient → onUnauthorized → về màn đăng nhập) — đúng cho
  // middleware phiên, nhưng ở đây phiên ứng dụng vẫn hợp lệ, chỉ GDT từ chối. Hệ quả:
  // gõ sai captcha là bị đẩy ra khỏi VATEngine. 401 nay DÀNH RIÊNG cho phiên ứng dụng;
  // GDT từ chối → 422 `gdt_tu_choi` (cùng lệ với 409 `token_het_han` ở /sync).
  it("GDT từ chối (200 không token) → 422 gdt_tu_choi (KHÔNG 401), KHÔNG lưu token, có audit", async () => {
    const badTransport = makeTransport({
      fetch: async () =>
        new Response(JSON.stringify({ message: "Sai captcha" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const app = createApp(injectDb(db, undefined, badTransport));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "gdt_tu_choi" });
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    if (!acc) throw new Error("tài khoản không tồn tại sau login");
    expect(acc.tokenHienTai).toBeNull();
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.doiTuong, accId), eq(auditLog.hanhDong, "dang_nhap_thue_that_bai")));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("GDT trả 401 (sai captcha thật — kiểm chứng 2026-09-24) → cũng 422 gdt_tu_choi", async () => {
    const badTransport = makeTransport({
      fetch: async () =>
        new Response(JSON.stringify({ message: "Mã captcha không đúng." }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    });
    const app = createApp(injectDb(db, undefined, badTransport));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "gdt_tu_choi" });
  });

  // U43: WAF GDT chặn (403 + chữ ký) ≠ sai captcha. Trả mã riêng để web nói đúng và người
  // dùng KHÔNG thử đi thử lại (mỗi lượt lại đập vào WAF). Audit ghi lý do ngắn `waf_blocked`.
  it("WAF chặn (403 + chữ ký) → 503 gdt_chan, KHÔNG lưu token, audit reason waf_blocked", async () => {
    const wafTransport = makeTransport({
      fetch: async () =>
        new Response(
          JSON.stringify({
            status: 403,
            message: "Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn.",
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    });
    const app = createApp(injectDb(db, undefined, wafTransport));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "gdt_chan" });
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    expect(acc?.tokenHienTai).toBeNull();
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.doiTuong, accId), eq(auditLog.hanhDong, "dang_nhap_thue_that_bai")));
    expect(rows.length).toBe(1);
    expect((rows[0]?.chiTiet as { reason?: string }).reason).toBe("waf_blocked");
  });

  it("403 KHÔNG chữ ký WAF → vẫn 422 gdt_tu_choi (không hồi quy)", async () => {
    const badTransport = makeTransport({
      fetch: async () =>
        new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    });
    const app = createApp(injectDb(db, undefined, badTransport));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(422);
  });

  it("token GDT không phải JWT có exp → 502 token_shape_unexpected, KHÔNG lưu token, có audit thất bại", async () => {
    const app = createApp(injectDb(db, undefined, okTransport("not-a-jwt")));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "token_shape_unexpected" });
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    if (!acc) throw new Error("tài khoản không tồn tại sau login");
    expect(acc.tokenHienTai).toBeNull();
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.doiTuong, accId), eq(auditLog.hanhDong, "dang_nhap_thue_that_bai")));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("vai ke_toan → 403", async () => {
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(403);
  });

  it("tài khoản tenant khác → 404 (cách ly)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000009");
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantB, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(404);
  });
});

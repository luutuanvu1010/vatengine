// U17b (§3.3) — Cổng trạng thái tenant ở đường đăng nhập.
// Tenant chưa duyệt / bị khoá / bị từ chối KHÔNG được đăng nhập, và phải nhận ĐÚNG mã lỗi
// giống hệt sai mật khẩu — nếu khác, kẻ tấn công phân biệt được "tenant này có thật, đang
// chờ duyệt" với "không tồn tại", tức rò thông tin.
import { auditLog, tenants } from "@vat/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SESSION_COOKIE } from "../../src/session";
import { type Db, freshDb, injectDb, makeEnv, makeTenant, seedUser } from "../helpers";

const EMAIL = "ke.toan@a.vn";
const MAT_KHAU_DUNG = "mat-khau-dung";
const MAT_KHAU_SAI = "mat-khau-sai";

describe("POST /auth/login — cổng trạng thái tenant (U17b)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    await seedUser(db, tenantA, EMAIL, MAT_KHAU_DUNG, "ke_toan");
  });

  async function setTrangThai(trangThai: string) {
    await db.update(tenants).set({ trangThai }).where(eq(tenants.id, tenantA));
  }

  function login(email: string, password: string) {
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

  async function audits() {
    return db.select().from(auditLog).where(eq(auditLog.tenantId, tenantA));
  }

  for (const trangThai of ["cho_duyet", "khoa", "tu_choi"]) {
    it(`tenant '${trangThai}' + mật khẩu ĐÚNG → 401 giống hệt sai mật khẩu, KHÔNG cookie phiên`, async () => {
      await setTrangThai(trangThai);
      const res = await login(EMAIL, MAT_KHAU_DUNG);
      const wrongPw = await login(EMAIL, MAT_KHAU_SAI);

      expect(res.status).toBe(401);
      expect(res.status).toBe(wrongPw.status);
      // Thân lỗi phải BYTE-IDENTICAL với sai mật khẩu — không được lộ thêm chi tiết nào.
      expect(await res.json()).toEqual(await wrongPw.json());
      expect(res.headers.get(SESSION_COOKIE)).toBeNull();
      expect(res.headers.get("Set-Cookie")).toBeNull();
    });
  }

  it("tenant 'active' + mật khẩu đúng → 200 { ok: true } + CÓ cookie phiên (không hồi quy U8/U29)", async () => {
    const res = await login(EMAIL, MAT_KHAU_DUNG);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const raw = res.headers.get("Set-Cookie") ?? "";
    expect(raw).toContain(`${SESSION_COOKIE}=`);
  });

  it("'cho_duyet' → ghi audit login_fail_chua_duyet, KHÔNG ghi dang_nhap_saas thành công", async () => {
    await setTrangThai("cho_duyet");
    const res = await login(EMAIL, MAT_KHAU_DUNG);
    expect(res.status).toBe(401);

    const rows = await audits();
    const login_audit = rows.find((a) => a.hanhDong === "dang_nhap_saas");
    expect(login_audit).toBeDefined();
    expect(JSON.stringify(login_audit?.chiTiet)).toMatch(/login_fail_chua_duyet/);

    // Không có bản ghi thành công nào (ket_qua=thanh_cong) cho tenant chưa duyệt.
    expect(rows.some((a) => JSON.stringify(a.chiTiet).includes("thanh_cong"))).toBe(false);
  });
});

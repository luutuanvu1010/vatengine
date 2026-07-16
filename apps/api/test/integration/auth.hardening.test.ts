// H-A.5a — gia cố /auth/login: (1) CHỐNG DÒ TÀI KHOẢN qua timing: verify PBKDF2 chạy
// KỂ CẢ khi email không tồn tại (hash giả) ⇒ công việc/độ trễ đồng nhất, không rò email
// nào có thật; (2) AUDIT login SaaS (security.md/NĐ13) cho sự kiện quy được về tenant
// (thành công + sai-mật-khẩu-user-thật). Email không tồn tại → không có tenant → không
// ghi (lockout/WAF lo phần dò email — H-A.5b). PGlite offline.
import { auditLog } from "@vat/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bọc verifyPassword để ĐẾM số lần derive (chứng minh timing đồng nhất). Vẫn chạy thật.
vi.mock("../../src/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

import { createApp } from "../../src/app";
import { verifyPassword } from "../../src/password";
import type { AnyDb } from "../../src/types";
import {
  type Db,
  freshDb,
  injectDb,
  makeEnv,
  makeLoginLimiterFactory,
  makeTenant,
  seedUser,
} from "../helpers";

const verifySpy = vi.mocked(verifyPassword);

describe("POST /auth/login — gia cố (H-A.5a)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let userId: string;

  beforeEach(async () => {
    verifySpy.mockClear();
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    userId = await seedUser(db, tenantA, "ke.toan@a.vn", "mat-khau-dung", "ke_toan");
  });

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

  async function audits(tenantId: string) {
    return db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
  }

  describe("chống dò tài khoản (timing)", () => {
    it("email KHÔNG tồn tại VẪN chạy một verify PBKDF2 (không rẽ nhánh nhanh)", async () => {
      const res = await login("khong-ton-tai@x.vn", "gi-cung-duoc");
      expect(res.status).toBe(401);
      expect(verifySpy).toHaveBeenCalledTimes(1); // verify-giả chạy ⇒ timing như email thật
    });

    it("email thật + mật khẩu sai cũng chạy đúng một verify (công việc đồng nhất)", async () => {
      const res = await login("ke.toan@a.vn", "mat-khau-sai");
      expect(res.status).toBe(401);
      expect(verifySpy).toHaveBeenCalledTimes(1);
    });

    // Vá Medium (security-review): ghi audit là round-trip DB — nếu chạy TRÊN đường găng
    // thì độ trễ phản hồi lộ email tồn tại. Prod (có executionCtx) đẩy audit+close sang
    // waitUntil ⇒ CẢ HAI nhánh lên lịch đúng 1 task nền rồi trả về ngay ⇒ timing đồng nhất.
    it("prod (executionCtx): audit đẩy sang waitUntil — email thật vs không tồn tại lên lịch NHƯ NHAU", async () => {
      function loginCtx(email: string, password: string) {
        const scheduled: Promise<unknown>[] = [];
        const ctx = {
          waitUntil: (p: Promise<unknown>) => scheduled.push(p),
          passThroughOnException: () => {},
        };
        const res = app.request(
          "/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          },
          makeEnv(),
          ctx as unknown as ExecutionContext,
        );
        return { res, scheduled };
      }

      // Email thật + sai mật khẩu: audit "that_bai" đẩy nền (KHÔNG chặn phản hồi).
      const real = loginCtx("ke.toan@a.vn", "mat-khau-sai");
      expect((await real.res).status).toBe(401);
      expect(real.scheduled).toHaveLength(1);
      await Promise.all(real.scheduled); // audit vẫn được ghi (không mất) sau khi trả response
      expect((await audits(tenantA)).some((a) => a.hanhDong === "dang_nhap_saas")).toBe(true);

      // Email không tồn tại: cũng đúng 1 task nền (chỉ close) ⇒ đường găng đồng nhất.
      const fake = loginCtx("khong-ton-tai@x.vn", "gi-cung-duoc");
      expect((await fake.res).status).toBe(401);
      expect(fake.scheduled).toHaveLength(1);
      await Promise.all(fake.scheduled);
    });
  });

  describe("audit login SaaS", () => {
    it("đăng nhập THÀNH CÔNG → ghi audit dang_nhap_saas (thành công) gắn tenant", async () => {
      const res = await login("ke.toan@a.vn", "mat-khau-dung");
      expect(res.status).toBe(200);
      const rows = await audits(tenantA);
      const login_audit = rows.find((a) => a.hanhDong === "dang_nhap_saas");
      expect(login_audit).toBeDefined();
      expect(login_audit?.doiTuong).toBe(userId);
      expect(JSON.stringify(login_audit?.chiTiet)).toMatch(/thanh_cong/);
    });

    it("mật khẩu SAI (user thật) → ghi audit thất bại gắn tenant", async () => {
      await login("ke.toan@a.vn", "mat-khau-sai");
      const rows = await audits(tenantA);
      const login_audit = rows.find((a) => a.hanhDong === "dang_nhap_saas");
      expect(login_audit).toBeDefined();
      expect(JSON.stringify(login_audit?.chiTiet)).toMatch(/that_bai/);
    });

    it("email KHÔNG tồn tại → KHÔNG ghi audit (không có tenant để quy)", async () => {
      await login("khong-ton-tai@x.vn", "gi-cung-duoc");
      const rows = await audits(tenantA);
      expect(rows.filter((a) => a.hanhDong === "dang_nhap_saas")).toHaveLength(0);
    });
  });

  describe("dọn dẹp khi lỗi", () => {
    it("lỗi DB giữa login → 500 (onError) + ĐÓNG kết nối (không rò kết nối)", async () => {
      const closeSpy = vi.fn(async () => {});
      const deps = {
        ...injectDb(db),
        getDb: async () => ({
          db: {
            execute: async () => {
              throw new Error("db down");
            },
          } as unknown as AnyDb,
          close: closeSpy,
        }),
      };
      const app2 = createApp(deps);
      const res = await app2.request(
        "/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "x@a.vn", password: "p" }),
        },
        makeEnv(),
      );
      expect(res.status).toBe(500); // app.onError → {error:'internal'}, không lộ chi tiết
      expect(await res.json()).toEqual({ error: "internal" });
      expect(closeSpy).toHaveBeenCalledTimes(1); // catch đóng kết nối đúng một lần
    });
  });

  describe("khóa per-account (lockout — H-A.5b)", () => {
    // App với limiter ngưỡng THẤP (khóa sau 3 lần) để test nhanh; state riêng mỗi app.
    function appWithLimiter(maxFailures = 3) {
      const factory = makeLoginLimiterFactory({ maxFailures, windowMs: 60_000, lockoutMs: 60_000 });
      return createApp({ ...injectDb(db), getLoginLimiter: factory });
    }
    function loginOn(a: ReturnType<typeof createApp>, email: string, password: string) {
      return a.request(
        "/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
        makeEnv(),
      );
    }

    it("N lần sai (user thật) → lần kế bị KHÓA 429 + Retry-After", async () => {
      const a = appWithLimiter(3);
      for (let i = 0; i < 3; i++) {
        expect((await loginOn(a, "ke.toan@a.vn", "sai")).status).toBe(401);
      }
      const locked = await loginOn(a, "ke.toan@a.vn", "sai");
      expect(locked.status).toBe(429);
      expect(locked.headers.get("Retry-After")).toBeTruthy();
      expect(await locked.json()).toEqual({ error: "too_many_attempts" });
    });

    it("enumeration-neutral: email KHÔNG tồn tại cũng khóa sau N lần (429, không lộ tồn tại)", async () => {
      const a = appWithLimiter(3);
      for (let i = 0; i < 3; i++) await loginOn(a, "khong-ton-tai@x.vn", "sai");
      expect((await loginOn(a, "khong-ton-tai@x.vn", "sai")).status).toBe(429);
    });

    it("đăng nhập ĐÚNG reset đếm → không bị khóa oan", async () => {
      const a = appWithLimiter(3);
      await loginOn(a, "ke.toan@a.vn", "sai");
      await loginOn(a, "ke.toan@a.vn", "sai");
      expect((await loginOn(a, "ke.toan@a.vn", "mat-khau-dung")).status).toBe(200); // reset
      for (let i = 0; i < 3; i++) await loginOn(a, "ke.toan@a.vn", "sai");
      expect((await loginOn(a, "ke.toan@a.vn", "sai")).status).toBe(429); // mới khóa lại
    });

    it("khóa theo TỪNG email — email khác KHÔNG bị vạ lây", async () => {
      const a = appWithLimiter(3);
      for (let i = 0; i < 4; i++) await loginOn(a, "ke.toan@a.vn", "sai"); // khóa email này
      expect((await loginOn(a, "ke.toan@a.vn", "sai")).status).toBe(429);
      // email khác chưa chạm ngưỡng → vẫn xử lý bình thường (401), KHÔNG 429.
      expect((await loginOn(a, "khac@a.vn", "gi-do")).status).toBe(401);
    });
  });
});

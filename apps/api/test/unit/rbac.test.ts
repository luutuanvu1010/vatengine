// U8 unit — requireRole gác quyền theo vai. Đúng token sai vai → 403 (PHÂN BIỆT 401).
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireTenant } from "../../src/auth";
import { isRole, requireRole } from "../../src/rbac";
import type { AppEnv } from "../../src/types";
import { bearer, makeEnv, tokenFor } from "../helpers";

const TENANT = "11111111-1111-1111-1111-111111111111";

// App tí hon: requireTenant (đặt role) → requireRole(allowed) → handler.
function guarded(...allowed: Parameters<typeof requireRole>) {
  const app = new Hono<AppEnv>();
  app.use("*", requireTenant);
  app.use("*", requireRole(...allowed));
  app.get("/x", (c) => c.json({ role: c.get("role") }));
  return app;
}

describe("isRole", () => {
  it("nhận đúng 3 vai, từ chối vai lạ", () => {
    expect(isRole("ke_toan")).toBe(true);
    expect(isRole("ke_toan_truong")).toBe(true);
    expect(isRole("quan_tri")).toBe(true);
    expect(isRole("member")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("requireRole", () => {
  it("vai NẰM trong danh sách cho phép → qua", async () => {
    const app = guarded("ke_toan_truong", "quan_tri");
    const token = await tokenFor(TENANT, { role: "ke_toan_truong" });
    const res = await app.request("/x", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "ke_toan_truong" });
  });

  it("vai KHÔNG trong danh sách → 403 (không phải 401)", async () => {
    const app = guarded("ke_toan_truong", "quan_tri");
    const token = await tokenFor(TENANT, { role: "ke_toan" });
    const res = await app.request("/x", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(403);
  });

  it("thiếu token → 401 (requireTenant chặn trước requireRole)", async () => {
    const app = guarded("ke_toan");
    const res = await app.request("/x", {}, makeEnv());
    expect(res.status).toBe(401);
  });
});

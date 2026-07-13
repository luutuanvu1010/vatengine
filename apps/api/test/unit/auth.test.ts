// U6 unit — middleware xác thực JWT nội bộ (phương án A). Xác minh chữ ký + trích
// `tenant_id`. KHÔNG token thuế (security.md). Mọi ca hỏng → 401, không rò lý do chi tiết.
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireTenant } from "../../src/auth";
import type { AppEnv } from "../../src/types";
import { TEST_SECRET, bearer, makeEnv, tokenFor } from "../helpers";

const VALID_TENANT = "11111111-1111-1111-1111-111111111111";

// App tí hon: middleware + handler phơi tenantId đã trích, để kiểm middleware cô lập.
function probeApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requireTenant);
  app.get("/probe", (c) => c.json({ tenantId: c.get("tenantId") }));
  return app;
}

describe("requireTenant (auth JWT nội bộ)", () => {
  it("JWT hợp lệ + claim tenant_id → cho qua, set tenantId", async () => {
    const app = probeApp();
    const token = await tokenFor(VALID_TENANT);
    const res = await app.request("/probe", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenantId: VALID_TENANT });
  });

  it("thiếu Authorization header → 401", async () => {
    const res = await probeApp().request("/probe", {}, makeEnv());
    expect(res.status).toBe(401);
  });

  it("token sai chữ ký → 401", async () => {
    const res = await probeApp().request(
      "/probe",
      { headers: bearer("khong.phai.jwt") },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("token hết hạn → 401", async () => {
    const app = probeApp();
    const expired = await tokenFor(VALID_TENANT, { exp: 1000 }); // exp quá khứ
    const res = await app.request("/probe", { headers: bearer(expired) }, makeEnv());
    expect(res.status).toBe(401);
  });

  it("token KHÔNG có claim tenant_id → 401 (không đoán tenant)", async () => {
    const app = probeApp();
    const token = await tokenFor(undefined, { sub: "user-1" });
    const res = await app.request("/probe", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(401);
  });

  it("tenant_id không phải UUID → 401", async () => {
    const app = probeApp();
    const token = await tokenFor("not-a-uuid");
    const res = await app.request("/probe", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(401);
  });

  it("ký bằng khóa KHÁC secret của env → 401", async () => {
    const app = probeApp();
    const token = await tokenFor(VALID_TENANT);
    const res = await app.request(
      "/probe",
      { headers: bearer(token) },
      makeEnv({ JWT_SECRET: `${TEST_SECRET}-khac` }),
    );
    expect(res.status).toBe(401);
  });
});

// H-A.6 — app.onError: lỗi chưa bắt ở handler → 500 {error:'internal'}, KHÔNG lộ
// message/stack cho client; log server-side ĐÃ MASK (không lộ connection-string /
// JWT). 401/404 (không phải lỗi ném) KHÔNG bị biến thành 500. Offline (testing.md).
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { signToken } from "../../src/auth";
import type { AppDeps } from "../../src/types";
import { TEST_SECRET, makeEnv } from "../helpers";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

// Lỗi mang dữ liệu nhạy cảm để chứng minh KHÔNG rò ra client và log ĐƯỢC mask.
const SECRET_IN_ERR = "postgres://app:sup3rSecret@db.internal/vat eyJhbGci.eyJzdWIi.sig123";

function throwingDeps(): AppDeps {
  return {
    getDb: async () => {
      throw new Error(`boom kết nối: ${SECRET_IN_ERR}`);
    },
    getStorage: async () => {
      throw new Error("unused");
    },
    getTransport: () => {
      throw new Error("unused");
    },
  } as unknown as AppDeps;
}

afterEach(() => vi.restoreAllMocks());

describe("app.onError — không lộ chi tiết lỗi + mask log", () => {
  it("lỗi handler → 500 {error:'internal'}, KHÔNG lộ message/stack/secret", async () => {
    const app = createApp(throwingDeps());
    const token = await signToken({ tenantId: TENANT, role: "ke_toan", sub: USER }, TEST_SECRET);
    const res = await app.request(
      "/me",
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(),
    );
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "internal" });
    // Không rò message, stack, hay bí mật trong body.
    expect(text).not.toMatch(/boom|postgres|sup3rSecret|eyJ|at Object|\.ts:/i);
  });

  it("log server-side ĐƯỢC mask (không lộ mật khẩu connection-string / JWT)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp(throwingDeps());
    const token = await signToken({ tenantId: TENANT, role: "ke_toan", sub: USER }, TEST_SECRET);
    await app.request("/me", { headers: { Authorization: `Bearer ${token}` } }, makeEnv());
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.map((c) => JSON.stringify(c)).join(" ");
    expect(logged).not.toMatch(/sup3rSecret/); // mật khẩu connection-string bị che
    expect(logged).not.toMatch(/eyJhbGci\.eyJzdWIi\.sig123/); // JWT bị che
    expect(logged).toMatch(/\*\*\*/); // có dấu vết đã che
  });

  it("401 (thiếu token) KHÔNG bị onError biến thành 500", async () => {
    const app = createApp(throwingDeps());
    const res = await app.request("/me", {}, makeEnv());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("404 (route không tồn tại) KHÔNG bị onError biến thành 500", async () => {
    const app = createApp(throwingDeps());
    const res = await app.request("/khong-ton-tai", {}, makeEnv());
    expect(res.status).toBe(404);
  });

  it("HTTPException được ném → GIỮ NGUYÊN status/response (không nuốt thành 500)", async () => {
    const app = createApp(throwingDeps());
    // Route giả ném HTTPException — chứng minh onError tôn trọng status chủ động
    // (vd middleware xác thực bên thứ ba của Hono ném 401/403), không ép về 500.
    app.get("/teapot", () => {
      throw new HTTPException(418, { message: "teapot" });
    });
    const res = await app.request("/teapot", {}, makeEnv());
    expect(res.status).toBe(418);
  });
});

// H-A.6 — front-door worker phải đặt security header trên MỌI phản hồi (SPA asset
// lẫn proxy /api) và KHÔNG phá routing (strip /api, xuyên proxy). Test gọi trực tiếp
// worker.fetch với ASSETS/API giả — offline, không mạng (testing.md).
import { describe, expect, it } from "vitest";
import worker from "../worker";

type Env = Parameters<typeof worker.fetch>[1];

function mockEnv(apiFetch?: (r: Request) => Promise<Response>): Env {
  return {
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html><div id=root></div>", {
          headers: { "content-type": "text/html" },
        }),
    },
    API: {
      fetch:
        apiFetch ??
        (async () =>
          new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })),
    },
  } as Env;
}

// Header bắt buộc (tên → mẫu giá trị chấp nhận).
const REQUIRED: Array<[string, RegExp]> = [
  ["content-security-policy", /default-src 'self'/],
  ["x-frame-options", /^DENY$/],
  ["x-content-type-options", /^nosniff$/],
  ["referrer-policy", /\S/],
];

function expectSecurityHeaders(res: Response) {
  for (const [name, re] of REQUIRED) {
    expect(res.headers.get(name) ?? "", `thiếu/hỏng header ${name}`).toMatch(re);
  }
}

describe("front-door worker — security header", () => {
  it("đặt đủ security header trên phản hồi asset (SPA)", async () => {
    const res = await worker.fetch(new Request("https://vatengine.example/"), mockEnv());
    expectSecurityHeaders(res);
  });

  it("đặt đủ security header trên phản hồi proxy /api (vẫn xuyên qua)", async () => {
    const res = await worker.fetch(new Request("https://vatengine.example/api/health"), mockEnv());
    expectSecurityHeaders(res);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("CSP cho phép đúng nhu cầu SPA: img data: (captcha) + style unsafe-inline", async () => {
    const res = await worker.fetch(new Request("https://vatengine.example/"), mockEnv());
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/img-src[^;]*data:/);
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
    // Không nới lỏng script (không có inline script trong build — đã kiểm chứng).
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("KHÔNG phá routing: strip tiền tố /api trước khi chuyển tiếp", async () => {
    let seenPath = "";
    const env = mockEnv(async (r) => {
      seenPath = new URL(r.url).pathname;
      return new Response("{}");
    });
    await worker.fetch(new Request("https://vatengine.example/api/auth/login"), env);
    expect(seenPath).toBe("/auth/login");
  });
});

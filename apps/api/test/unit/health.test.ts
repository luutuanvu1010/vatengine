import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../../src/index";

describe("health-check", () => {
  it("trả về status ok", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("vat-api");
  });

  it("trả 404 cho route không tồn tại", async () => {
    const res = await app.request("/khong-ton-tai", {}, env);
    expect(res.status).toBe(404);
  });
});

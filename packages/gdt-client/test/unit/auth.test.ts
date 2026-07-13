import { describe, expect, it } from "vitest";
import { authenticate } from "../../src/auth";
import { GdtContractDriftError, GdtError } from "../../src/errors";
import type { GdtTransport } from "../../src/transport";

const CREDENTIALS = { username: "0123456789", password: "secret", ckey: "k1", cvalue: "ab12" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function sequenceTransport(steps: Array<() => Response>): {
  transport: GdtTransport;
  callCount: () => number;
} {
  let count = 0;
  const transport: GdtTransport = {
    name: "mock",
    async fetch() {
      const step = steps[Math.min(count, steps.length - 1)];
      count++;
      if (!step) throw new Error("sequenceTransport: chưa cấu hình step nào");
      return step();
    },
    async probe() {
      throw new Error("không dùng trong test này");
    },
  };
  return { transport, callCount: () => count };
}

describe("authenticate", () => {
  it("trả token khi GDT trả 200 + {token}", async () => {
    const { transport } = sequenceTransport([() => jsonResponse(200, { token: "jwt-abc" })]);

    const result = await authenticate(transport, CREDENTIALS);

    expect(result).toEqual({ token: "jwt-abc" });
  });

  it("200 không token (sai captcha/mật khẩu) → lỗi nghiệp vụ GdtError, không phải lệch hợp đồng", async () => {
    const { transport } = sequenceTransport([
      () => jsonResponse(200, { message: "Sai mã xác nhận" }),
    ]);

    await expect(authenticate(transport, CREDENTIALS)).rejects.toBeInstanceOf(GdtError);
    await expect(authenticate(transport, CREDENTIALS)).rejects.not.toBeInstanceOf(
      GdtContractDriftError,
    );
  });

  it("401 → GdtError('hết phiên'), không retry bằng credential cũ", async () => {
    const { transport, callCount } = sequenceTransport([() => jsonResponse(401, {})]);

    let error: unknown;
    try {
      await authenticate(transport, CREDENTIALS, { maxAttempts: 3, backoffMs: 5 });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(GdtError);
    expect((error as GdtError).code).toBe("SESSION_EXPIRED");
    expect(callCount()).toBe(1);
  });

  it("lỗi tạm 5xx → retry có backoff rồi thành công", async () => {
    const { transport, callCount } = sequenceTransport([
      () => jsonResponse(500, {}),
      () => jsonResponse(500, {}),
      () => jsonResponse(200, { token: "jwt-after-retry" }),
    ]);

    const result = await authenticate(transport, CREDENTIALS, { maxAttempts: 3, backoffMs: 5 });

    expect(result.token).toBe("jwt-after-retry");
    expect(callCount()).toBe(3);
  });

  it("200 không token, không có message nhưng có error_description → dùng error_description", async () => {
    const { transport } = sequenceTransport([
      () => jsonResponse(200, { error_description: "Tài khoản bị khoá" }),
    ]);

    await expect(authenticate(transport, CREDENTIALS)).rejects.toThrow("Tài khoản bị khoá");
  });

  it("phản hồi không phải JSON hợp lệ → GdtError", async () => {
    const { transport } = sequenceTransport([
      () => new Response("<html>not json</html>", { status: 200 }),
    ]);

    await expect(authenticate(transport, CREDENTIALS)).rejects.toThrow(GdtError);
  });

  it("không gọi fetch() toàn cục trực tiếp — chỉ qua GdtTransport", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("KHÔNG được gọi fetch() toàn cục trực tiếp");
    }) as unknown as typeof fetch;
    try {
      const { transport } = sequenceTransport([() => jsonResponse(200, { token: "jwt-ok" })]);
      const result = await authenticate(transport, CREDENTIALS);
      expect(result.token).toBe("jwt-ok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

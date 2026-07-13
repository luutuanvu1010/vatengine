import { describe, expect, it } from "vitest";
import { fetchWithRetry } from "../../src/http";
import type { GdtTransport } from "../../src/transport";

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockTransport(steps: Array<() => Response | Promise<Response>>): {
  transport: GdtTransport;
  callCount: () => number;
} {
  let count = 0;
  const transport: GdtTransport = {
    name: "mock",
    async fetch() {
      const step = steps[Math.min(count, steps.length - 1)];
      count++;
      if (!step) throw new Error("mockTransport: chưa cấu hình step nào");
      return step();
    },
    async probe() {
      throw new Error("không dùng trong test này");
    },
  };
  return { transport, callCount: () => count };
}

describe("fetchWithRetry", () => {
  it("trả response ngay khi thành công lần đầu", async () => {
    const { transport, callCount } = mockTransport([() => jsonResponse(200, { ok: true })]);

    const res = await fetchWithRetry(transport, "https://example.test/x");

    expect(res.status).toBe(200);
    expect(callCount()).toBe(1);
  });

  it("không retry khi 401 dù còn lượt thử", async () => {
    const { transport, callCount } = mockTransport([() => jsonResponse(401, { message: "sai" })]);

    const res = await fetchWithRetry(
      transport,
      "https://example.test/x",
      {},
      { maxAttempts: 3, backoffMs: 5 },
    );

    expect(res.status).toBe(401);
    expect(callCount()).toBe(1);
  });

  it("retry có backoff khi 5xx cho tới khi thành công", async () => {
    const { transport, callCount } = mockTransport([
      () => jsonResponse(500),
      () => jsonResponse(500),
      () => jsonResponse(200, { ok: true }),
    ]);

    const res = await fetchWithRetry(
      transport,
      "https://example.test/x",
      {},
      { maxAttempts: 3, backoffMs: 5 },
    );

    expect(res.status).toBe(200);
    expect(callCount()).toBe(3);
  });

  it("trả response 5xx cuối cùng sau khi hết lượt thử, không throw", async () => {
    const { transport, callCount } = mockTransport([() => jsonResponse(503)]);

    const res = await fetchWithRetry(
      transport,
      "https://example.test/x",
      {},
      { maxAttempts: 2, backoffMs: 5 },
    );

    expect(res.status).toBe(503);
    expect(callCount()).toBe(2);
  });

  it("timeout qua AbortController rồi throw sau khi hết lượt thử", async () => {
    const transport: GdtTransport = {
      name: "hang",
      fetch(_url, init) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
      async probe() {
        throw new Error("không dùng trong test này");
      },
    };

    await expect(
      fetchWithRetry(
        transport,
        "https://example.test/x",
        {},
        { maxAttempts: 2, timeoutMs: 10, backoffMs: 5 },
      ),
    ).rejects.toThrow();
  });
});

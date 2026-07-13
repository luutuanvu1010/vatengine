import { describe, expect, it } from "vitest";
import { getCaptcha } from "../../src/captcha";
import { GdtError } from "../../src/errors";
import type { GdtTransport } from "../../src/transport";

function transportReturning(status: number, body: unknown): GdtTransport {
  return {
    name: "mock",
    async fetch() {
      return new Response(JSON.stringify(body), { status });
    },
    async probe() {
      throw new Error("không dùng trong test này");
    },
  };
}

describe("getCaptcha", () => {
  it("trả {key, content} khi transport trả JSON hợp lệ", async () => {
    const transport = transportReturning(200, { key: "abc123", content: "<svg>...</svg>" });

    const result = await getCaptcha(transport);

    expect(result).toEqual({ key: "abc123", content: "<svg>...</svg>" });
  });

  it("không tự giải/bypass — trả nguyên content thô, không biến đổi", async () => {
    const rawContent = '<svg><path d="M0 0"/></svg>';
    const transport = transportReturning(200, { key: "xyz", content: rawContent });

    const result = await getCaptcha(transport);

    expect(result.content).toBe(rawContent);
  });

  it("ném GdtError khi máy chủ trả lỗi HTTP (không phải 2xx)", async () => {
    const transport = transportReturning(500, {});

    await expect(getCaptcha(transport, { maxAttempts: 1 })).rejects.toThrow(GdtError);
  });
});

// Canary lối vào GDT (U43): captcha thật + authenticate MST GIẢ + captcha SAI, KHÔNG retry.
// KIỂM CHỨNG 2026-09-24: GDT kiểm captcha TRƯỚC nên MST giả không đụng tài khoản nào;
// mong đợi 401 "Mã captcha không đúng." Mọi dạng khác 401 là tín hiệu WAF/đổi hợp đồng.
import { describe, expect, it } from "vitest";
import { CANARY_USERNAME, canaryAuthenticate } from "../../src/canary";
import type { GdtTransport } from "../../src/transport";

const CAPTCHA_OK = { key: "ck-123", content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" };
const THONG_DIEP_WAF = "Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn.";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Transport giả: bước 1 (captcha) và bước 2 (authenticate) trả theo kịch bản; đếm lượt gọi. */
function makeTransport(
  captcha: () => Response | Promise<Response>,
  auth: () => Response | Promise<Response>,
) {
  const calls: { url: string; body?: string }[] = [];
  const transport: GdtTransport = {
    name: "mock",
    async fetch(url, init) {
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      return url.endsWith("/api/captcha") ? captcha() : auth();
    },
    async probe() {
      throw new Error("không dùng trong test này");
    },
  };
  return { transport, calls };
}

describe("canaryAuthenticate", () => {
  it("401 'Mã captcha không đúng.' → OK, giữ httpStatus + message, đúng 2 request", async () => {
    const { transport, calls } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => json(401, { message: "Mã captcha không đúng." }),
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("OK");
    expect(r.httpStatus).toBe(401);
    expect(r.message).toBe("Mã captcha không đúng.");
    expect(calls).toHaveLength(2);
    // Gửi đúng MST giả + ckey thật vừa lấy; KHÔNG bao giờ gửi MST thật.
    expect(calls[1]?.body).toContain(`"username":"${CANARY_USERNAME}"`);
    expect(calls[1]?.body).toContain('"ckey":"ck-123"');
  });

  it("403 + chữ ký WAF → WAF_BLOCKED", async () => {
    const { transport } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => json(403, { status: 403, message: THONG_DIEP_WAF }),
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("WAF_BLOCKED");
    expect(r.httpStatus).toBe(403);
    expect(r.message).toBe(THONG_DIEP_WAF);
  });

  it("200 có token cho MST giả → DRIFT (không thể đúng)", async () => {
    const { transport } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => json(200, { token: "a.b.c" }),
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("DRIFT");
    expect(r.httpStatus).toBe(200);
  });

  it("403 KHÔNG chữ ký / 400 / 500 → DRIFT kèm httpStatus", async () => {
    for (const status of [403, 400, 500]) {
      const { transport } = makeTransport(
        () => json(200, CAPTCHA_OK),
        () => json(status, { message: "khác" }),
      );
      const r = await canaryAuthenticate(transport, { backoffMs: 1 });
      expect(r.verdict).toBe("DRIFT");
      expect(r.httpStatus).toBe(status);
    }
  });

  it("KHÔNG retry: 500 ở authenticate chỉ gọi đúng 1 lần (tổng 2 request)", async () => {
    const { transport, calls } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => json(500, {}),
    );
    await canaryAuthenticate(transport, { maxAttempts: 3, backoffMs: 1 });
    expect(calls).toHaveLength(2);
  });

  it("captcha đổi schema (thiếu key) → DRIFT", async () => {
    const { transport } = makeTransport(
      () => json(200, { content: "<svg/>" }),
      () => json(401, {}),
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("DRIFT");
  });

  it("captcha HTTP 500 → ERROR (không tới bước authenticate)", async () => {
    const { transport, calls } = makeTransport(
      () => json(500, {}),
      () => json(401, {}),
    );
    const r = await canaryAuthenticate(transport, { backoffMs: 1 });
    expect(r.verdict).toBe("ERROR");
    expect(calls).toHaveLength(1);
  });

  it("timeout ở authenticate → TIMEOUT", async () => {
    const { transport } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () =>
        new Promise<Response>((_resolve, reject) => {
          const e = new Error("aborted");
          e.name = "AbortError";
          setTimeout(() => reject(e), 5);
        }),
    );
    const r = await canaryAuthenticate(transport, { timeoutMs: 1 });
    expect(r.verdict).toBe("TIMEOUT");
  });

  it("lỗi mạng ở authenticate → ERROR, latencyMs là số", async () => {
    const { transport } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => {
        throw new Error("ECONNRESET");
      },
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("ERROR");
    expect(typeof r.latencyMs).toBe("number");
  });
});

// U28 — Test decorator kìm nhịp GdtTransport theo TỪNG request (nhóm unit, offline).
// Trả nợ permit-per-request cho pha 1: mọi fetch() ra GDT phải xin permit
// TenantLimiter thay vì 1 permit cho cả job (gốc rễ 429 hàng loạt 2026-07-18:
// 42 request / 1 permit — U28-plan §0). Tiêm hàm chờ → không ngủ thật; mock
// transport → không mạng thật (testing.md).
import { GdtError, fetchWithRetry } from "@vat/gdt-client";
import type { GdtTransport, ProbeResult } from "@vat/gdt-client";
import { describe, expect, it } from "vitest";
import { throttledTransport } from "../../src/throttledTransport";
import type { TenantLimiterClient } from "../../src/types";

type Acquire = { allowed: boolean; reason?: "rate_limited" | "breaker_open" };

/** Limiter giả chạy theo kịch bản; hết kịch bản thì lặp lại phần tử cuối. */
function fakeLimiter(script: Acquire[]): {
  limiter: TenantLimiterClient;
  calls: { tryAcquire: number; recordResult: boolean[] };
} {
  const calls = { tryAcquire: 0, recordResult: [] as boolean[] };
  return {
    calls,
    limiter: {
      async tryAcquire() {
        const r = script[Math.min(calls.tryAcquire, script.length - 1)] ?? { allowed: true };
        calls.tryAcquire += 1;
        return r;
      },
      async recordResult(ok) {
        calls.recordResult.push(ok);
      },
    },
  };
}

const PROBE: ProbeResult = { transport: "fake-inner", verdict: "OK", latencyMs: 1 };

function fakeInner(): {
  transport: GdtTransport;
  fetches: Array<{ url: string; init?: RequestInit }>;
  responses: Response[];
  probeCalls: { n: number };
} {
  const fetches: Array<{ url: string; init?: RequestInit }> = [];
  const responses: Response[] = [];
  const probeCalls = { n: 0 };
  return {
    fetches,
    responses,
    probeCalls,
    transport: {
      name: "fake-inner",
      async fetch(url, init) {
        fetches.push({ url, init });
        const res = new Response(`ok-${fetches.length}`);
        responses.push(res);
        return res;
      },
      async probe() {
        probeCalls.n += 1;
        return PROBE;
      },
    },
  };
}

/** Hàm chờ tiêm: ghi lại delay, resolve ngay (không ngủ thật). */
function recordingWait(): { wait: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    wait: async (ms) => {
      delays.push(ms);
    },
  };
}

describe("throttledTransport (U28 — permit-per-request pha 1)", () => {
  it("N lần fetch → ĐÚNG N lần tryAcquire (tiêu chí khoá của U28)", async () => {
    const inner = fakeInner();
    const { limiter, calls } = fakeLimiter([{ allowed: true }]);
    const { wait } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, { wait });

    const N = 5;
    for (let i = 0; i < N; i++) {
      await t.fetch(`https://hoadondientu.gdt.gov.vn/p${i}`);
    }

    expect(calls.tryAcquire).toBe(N);
    expect(inner.fetches).toHaveLength(N);
  });

  it("permit allowed → gọi transport gốc với đúng url/init, trả NGUYÊN Response", async () => {
    const inner = fakeInner();
    const { limiter } = fakeLimiter([{ allowed: true }]);
    const { wait, delays } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, { wait });

    const init: RequestInit = { method: "POST", headers: { "content-type": "application/json" } };
    const res = await t.fetch("https://hoadondientu.gdt.gov.vn/q", init);

    expect(res).toBe(inner.responses[0]); // nguyên Response — không đổi ngữ nghĩa
    expect(inner.fetches[0]).toEqual({ url: "https://hoadondientu.gdt.gov.vn/q", init });
    expect(delays).toHaveLength(0); // allowed ngay → không chờ
  });

  it("breaker_open → ném NGAY GdtError, KHÔNG gọi transport gốc, KHÔNG chờ", async () => {
    const inner = fakeInner();
    const { limiter, calls } = fakeLimiter([{ allowed: false, reason: "breaker_open" }]);
    const { wait, delays } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, { wait });

    await expect(t.fetch("https://hoadondientu.gdt.gov.vn/q")).rejects.toBeInstanceOf(GdtError);
    expect(inner.fetches).toHaveLength(0); // breaker mở = KHÔNG chạm GDT
    expect(delays).toHaveLength(0); // fail-fast — chờ trong request là treo vô ích
    expect(calls.tryAcquire).toBe(1);
  });

  it("rate_limited → CHỜ rồi thử lại, thành công lượt sau → vẫn trả Response", async () => {
    const inner = fakeInner();
    const { limiter, calls } = fakeLimiter([
      { allowed: false, reason: "rate_limited" },
      { allowed: true },
    ]);
    const { wait, delays } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, { wait, retryDelayMs: 500 });

    const res = await t.fetch("https://hoadondientu.gdt.gov.vn/q");

    expect(await res.text()).toBe("ok-1");
    expect(calls.tryAcquire).toBe(2);
    expect(delays).toEqual([500]); // giỏ token tự đầy — nhịp mong muốn
  });

  it("rate_limited kéo dài quá trần chờ → ném GdtError có kiểu, không treo, không gọi gốc", async () => {
    const inner = fakeInner();
    const { limiter, calls } = fakeLimiter([{ allowed: false, reason: "rate_limited" }]);
    const { wait, delays } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, {
      wait,
      retryDelayMs: 100,
      maxWaitMs: 300,
    });

    await expect(t.fetch("https://hoadondientu.gdt.gov.vn/q")).rejects.toBeInstanceOf(GdtError);
    // 3 lượt chờ (100×3 = 300ms chạm trần) rồi ném ở lượt xin thứ 4 — có trần, không vòng vô hạn.
    expect(delays).toEqual([100, 100, 100]);
    expect(calls.tryAcquire).toBe(4);
    expect(inner.fetches).toHaveLength(0);
  });

  it("lỗi ném ra rơi vào nhánh retry_backpressure ĐÃ CÓ (GdtError httpStatus=429, không phải session_expired)", async () => {
    // Hợp đồng với packages/sync (sync.ts classifyFailure): GdtError.httpStatus===429
    // → failureKind "rate_limited" → runJob trả retry_backpressure (reenqueue có delay,
    // KHÔNG tính max_retries). KHÔNG được mang code SESSION_EXPIRED (sẽ thành needs_reauth oan).
    const { limiter: breakerLimiter } = fakeLimiter([{ allowed: false, reason: "breaker_open" }]);
    const { limiter: exhaustedLimiter } = fakeLimiter([{ allowed: false, reason: "rate_limited" }]);
    const { wait } = recordingWait();

    for (const limiter of [breakerLimiter, exhaustedLimiter]) {
      const t = throttledTransport(fakeInner().transport, limiter, {
        wait,
        retryDelayMs: 100,
        maxWaitMs: 100,
      });
      const err = await t.fetch("https://hoadondientu.gdt.gov.vn/q").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GdtError);
      const gdtErr = err as GdtError;
      expect(gdtErr.httpStatus).toBe(429);
      expect(gdtErr.code).toBe("HTTP_ERROR");
    }
  });

  it("init.signal ĐÃ abort (timeout adapter nổ trong lúc chờ permit) → ném GdtError 429 NGAY, không gọi gốc, không chờ thêm", async () => {
    // fetchWithRetry (packages/gdt-client/src/http.ts) đặt AbortController timeout
    // (mặc định 10s) quanh MỖI transport.fetch. Nếu chờ permit vắt qua mốc đó mà vẫn
    // gọi GDT bằng signal đã abort → "The operation was aborted" → phân loại transient
    // → tính oan vào breaker (nợ backlog n=43). Decorator phải bail sớm bằng lỗi CÓ KIỂU
    // đi đường backpressure.
    const inner = fakeInner();
    const { limiter } = fakeLimiter([{ allowed: false, reason: "rate_limited" }]);
    const { wait, delays } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, { wait });

    const ctrl = new AbortController();
    ctrl.abort();
    const err = await t
      .fetch("https://hoadondientu.gdt.gov.vn/q", { signal: ctrl.signal })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GdtError);
    expect((err as GdtError).httpStatus).toBe(429);
    expect(inner.fetches).toHaveLength(0);
    expect(delays).toHaveLength(0);
  });

  it("trần chờ mặc định NHỎ HƠN timeout 10s của fetchWithRetry (không để signal abort giữa lúc chờ permit)", async () => {
    // Bằng chứng: DEFAULT_TIMEOUT_MS = 10_000 (packages/gdt-client/src/http.ts). Trần
    // chờ mặc định của decorator phải < 10s để nhánh "quá trần" ném lỗi có kiểu TRƯỚC
    // khi timer adapter abort — giữ phân loại rate_limited, không rơi vào AbortError.
    const inner = fakeInner();
    const { limiter } = fakeLimiter([{ allowed: false, reason: "rate_limited" }]);
    const { wait, delays } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, { wait });

    const err = await t.fetch("https://hoadondientu.gdt.gov.vn/q").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GdtError);
    const totalWaitMs = delays.reduce((a, b) => a + b, 0);
    expect(totalWaitMs).toBeLessThan(10_000);
    expect(inner.fetches).toHaveLength(0);
  });

  it("TỔ HỢP với fetchWithRetry thật (review chéo): permit cạn + timeout adapter → lỗi cuối là GdtError 429 (KHÔNG AbortError thô), KHÔNG request GDT thật nào", async () => {
    // Đi qua đúng đường production: fetchWithRetry (timeout AbortController / attempt,
    // retry-on-throw) bọc NGOÀI decorator. Kịch bản: giỏ token cạn kéo dài, timer
    // adapter bắn giữa lúc chờ permit. Kỳ vọng: decorator bail theo signal bằng lỗi
    // CÓ KIỂU → xuyên qua hết maxAttempts vẫn là GdtError 429 → classifyFailure
    // "rate_limited" → retry_backpressure (KHÔNG phải AbortError → "transient" →
    // tính oan vào breaker — chuỗi lỗi contract-guardian chỉ ra).
    const inner = fakeInner();
    const { limiter } = fakeLimiter([{ allowed: false, reason: "rate_limited" }]);
    // Chờ thật 10ms/lượt để timer 30ms của adapter kịp bắn giữa vòng chờ permit.
    const t = throttledTransport(inner.transport, limiter, {
      retryDelayMs: 10,
      maxWaitMs: 200,
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    });

    const err = await fetchWithRetry(
      t,
      "https://hoadondientu.gdt.gov.vn/q",
      {},
      { timeoutMs: 30, maxAttempts: 2, backoffMs: 1, sleepFn: async () => {} },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GdtError);
    expect((err as GdtError).httpStatus).toBe(429);
    expect(inner.fetches).toHaveLength(0); // không một request GDT thật nào lọt qua
  });

  it("TỔ HỢP với fetchWithRetry thật: breaker_open → adapter retry CÓ TRẦN maxAttempts (mỗi lượt ném ngay, không chờ), lỗi cuối vẫn GdtError 429, KHÔNG gọi GDT", async () => {
    // fetchWithRetry bắt MỌI exception và retry tới maxAttempts (http.ts:121-127) —
    // kể cả lỗi kìm nhịp chủ đích của decorator. Khẳng định khuếch đại này CÓ TRẦN:
    // đúng maxAttempts lượt tryAcquire (mỗi lượt breaker_open ném ngay, không chờ),
    // không request GDT thật, phân loại cuối vẫn rate_limited. Ghi nhận tường minh
    // theo review chéo (dod-auditor + contract-guardian) — xem U28-plan §7.
    const inner = fakeInner();
    const { limiter, calls } = fakeLimiter([{ allowed: false, reason: "breaker_open" }]);
    const { wait, delays } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, { wait });

    const err = await fetchWithRetry(
      t,
      "https://hoadondientu.gdt.gov.vn/q",
      {},
      { timeoutMs: 5_000, maxAttempts: 3, backoffMs: 1, sleepFn: async () => {} },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GdtError);
    expect((err as GdtError).httpStatus).toBe(429);
    expect(calls.tryAcquire).toBe(3); // trần = maxAttempts, không vòng vô hạn
    expect(delays).toHaveLength(0); // breaker mở: không lượt nào chờ trong decorator
    expect(inner.fetches).toHaveLength(0);
  });

  it("probe() và name ủy quyền nguyên trạng cho transport gốc (KHÔNG kìm — health check toàn hệ thống, không phải việc tenant)", async () => {
    const inner = fakeInner();
    const { limiter, calls } = fakeLimiter([{ allowed: false, reason: "breaker_open" }]);
    const { wait } = recordingWait();
    const t = throttledTransport(inner.transport, limiter, { wait });

    expect(t.name).toBe("fake-inner");
    expect(await t.probe()).toEqual(PROBE);
    expect(inner.probeCalls.n).toBe(1);
    expect(calls.tryAcquire).toBe(0); // probe không tiêu permit của tenant
  });
});

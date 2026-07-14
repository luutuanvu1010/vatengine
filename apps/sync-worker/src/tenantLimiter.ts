// Durable Object giữ token-bucket rate limit + circuit breaker cho MỘT tenant/MST
// (ADR-0001 §5). WIRING MỎNG: chỉ nạp/lưu trạng thái + ủy quyền cho logic THUẦN đã
// test kỹ ở rateLimiter.ts. Không test-cover (cần runtime DO thật; logic đã phủ ở
// unit rateLimiter.test.ts). Đơn luồng theo thiết kế DO → không cần khóa.
import {
  type RateLimiterConfig,
  type RateLimiterState,
  initialState,
  limiterEvent,
  recordResult,
  resolveLimiterConfig,
  tryAcquire,
} from "./rateLimiter";
import type { Env, TenantLimiterClient } from "./types";

const STATE_KEY = "state";

export class TenantLimiter {
  private readonly ctx: DurableObjectState;
  // U12: ngưỡng tiêm từ env (không hardcode) — tinh chỉnh theo môi trường.
  private readonly cfg: RateLimiterConfig;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.cfg = resolveLimiterConfig(env);
  }

  private async load(nowMs: number): Promise<RateLimiterState> {
    const stored = await this.ctx.storage.get<RateLimiterState>(STATE_KEY);
    return stored ?? initialState(this.cfg, nowMs);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const nowMs = Date.now();
    const state = await this.load(nowMs);

    if (url.pathname === "/acquire") {
      const r = tryAcquire(state, nowMs, this.cfg);
      await this.ctx.storage.put(STATE_KEY, r.state);
      // U12 — QUAN SÁT: log có cấu trúc khi chặn (Workers Logs/observability). Chỉ
      // metadata vận hành (id DO), KHÔNG token/secret (security.md).
      if (!r.allowed && r.reason) {
        console.warn(JSON.stringify(limiterEvent(r.reason, this.ctx.id.toString(), nowMs)));
      }
      return Response.json({ allowed: r.allowed, reason: r.reason });
    }
    if (url.pathname === "/result") {
      const ok = url.searchParams.get("ok") === "true";
      await this.ctx.storage.put(STATE_KEY, recordResult(state, ok, nowMs, this.cfg));
      return Response.json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }
}

/** Adapter DO stub → TenantLimiterClient (giao diện runJob tiêu thụ). Khóa theo
 * tenant/MST để mỗi tenant có giỏ token + breaker riêng ("không gọi dồn dập"). */
export function tenantLimiterClient(ns: DurableObjectNamespace, key: string): TenantLimiterClient {
  const stub = ns.get(ns.idFromName(key));
  return {
    async tryAcquire() {
      const res = await stub.fetch("https://limiter/acquire", { method: "POST" });
      return (await res.json()) as {
        allowed: boolean;
        reason?: "rate_limited" | "breaker_open";
      };
    },
    async recordResult(ok) {
      await stub.fetch(`https://limiter/result?ok=${ok}`, { method: "POST" });
    },
  };
}

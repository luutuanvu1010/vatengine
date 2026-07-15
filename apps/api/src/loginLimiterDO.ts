// H-A.5b — Durable Object khóa đăng nhập per-account. WIRING MỎNG: chỉ nạp/lưu state +
// ủy quyền cho logic THUẦN đã test kỹ ở loginLimiter.ts. Đơn luồng theo thiết kế DO →
// không cần khóa. KHÔNG test-cover (cần runtime DO thật; logic đã phủ ở loginLimiter.test).
import {
  type LoginLockConfig,
  type LoginLockState,
  checkLock,
  initialLockState,
  recordFailure,
  recordSuccess,
  resolveLoginLockConfig,
} from "./loginLimiter";
import type { Env, LoginLimiterClient } from "./types";

const STATE_KEY = "state";

export class LoginLimiter {
  private readonly ctx: DurableObjectState;
  private readonly cfg: LoginLockConfig;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.cfg = resolveLoginLockConfig(env);
  }

  private async load(): Promise<LoginLockState> {
    return (await this.ctx.storage.get<LoginLockState>(STATE_KEY)) ?? initialLockState();
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const nowMs = Date.now();
    const state = await this.load();

    if (url.pathname === "/check") {
      return Response.json(checkLock(state, nowMs, this.cfg));
    }
    if (url.pathname === "/failure") {
      const next = recordFailure(state, nowMs, this.cfg);
      await this.ctx.storage.put(STATE_KEY, next);
      const gate = checkLock(next, nowMs, this.cfg);
      // QUAN SÁT khi khóa mở: CHỈ metadata vận hành, KHÔNG email/PII (security.md).
      if (gate.locked) console.warn(JSON.stringify({ type: "login_lockout", at: nowMs }));
      return Response.json(gate);
    }
    if (url.pathname === "/success") {
      await this.ctx.storage.put(STATE_KEY, recordSuccess());
      return Response.json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }
}

/** Adapter DO stub → LoginLimiterClient. Khóa theo key (email chuẩn hóa) ⇒ mỗi tài khoản
 * một bộ đếm riêng. Nếu namespace thiếu (binding chưa bật) → fail-open (không khóa). */
export function loginLimiterClient(
  ns: DurableObjectNamespace | undefined,
  key: string,
): LoginLimiterClient {
  if (!ns) {
    console.warn(JSON.stringify({ type: "login_limiter_unavailable", at: Date.now() }));
    return {
      check: async () => ({ locked: false, retryAfterMs: 0 }),
      recordFailure: async () => {},
      recordSuccess: async () => {},
    };
  }
  const stub = ns.get(ns.idFromName(key));
  return {
    async check() {
      const res = await stub.fetch("https://login-limiter/check");
      return (await res.json()) as { locked: boolean; retryAfterMs: number };
    },
    async recordFailure() {
      await stub.fetch("https://login-limiter/failure", { method: "POST" });
    },
    async recordSuccess() {
      await stub.fetch("https://login-limiter/success", { method: "POST" });
    },
  };
}

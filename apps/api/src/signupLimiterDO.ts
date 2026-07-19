// U17b (QĐ-2) — Durable Object đếm lượt đăng ký theo IP, cửa sổ trượt. WIRING MỎNG: chỉ
// nạp/lưu state → ủy quyền cho logic THUẦN đã test kỹ ở signupLimiter.ts → lưu. Đơn luồng
// theo thiết kế DO → không cần khóa. KHÔNG test-cover (cần runtime DO thật; logic đã phủ
// ở signupLimiter.test.ts), giống loginLimiterDO.ts.
import {
  type SignupGate,
  type SignupLimitConfig,
  type SignupState,
  checkSignup,
  initialSignupState,
  recordSignup,
  resolveSignupLimitConfig,
} from "./signupLimiter";
import type { Env, SignupLimiterClient } from "./types";

const STATE_KEY = "state";

export class SignupLimiter {
  private readonly ctx: DurableObjectState;
  private readonly cfg: SignupLimitConfig;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.cfg = resolveSignupLimitConfig(env);
  }

  private async load(): Promise<SignupState> {
    return (await this.ctx.storage.get<SignupState>(STATE_KEY)) ?? initialSignupState();
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const nowMs = Date.now();
    const state = await this.load();

    if (url.pathname === "/check") {
      return Response.json(checkSignup(state, nowMs, this.cfg));
    }
    if (url.pathname === "/record") {
      const next = recordSignup(state, nowMs, this.cfg);
      await this.ctx.storage.put(STATE_KEY, next);
      const gate = checkSignup(next, nowMs, this.cfg);
      // QUAN SÁT khi chạm ngưỡng: CHỈ metadata vận hành, KHÔNG IP/PII (security.md).
      if (gate.chan) console.warn(JSON.stringify({ type: "signup_rate_limited", at: nowMs }));
      return Response.json(gate);
    }
    return new Response("not found", { status: 404 });
  }
}

/** Adapter DO stub → SignupLimiterClient. Khóa theo key (IP) ⇒ mỗi địa chỉ IP một bộ đếm
 * riêng. Nếu namespace thiếu (binding chưa bật) → fail-open (không chặn) — một limiter
 * mất không được phép làm sập cổng đăng ký công khai. */
export function signupLimiterClient(
  ns: DurableObjectNamespace | undefined,
  key: string,
): SignupLimiterClient {
  if (!ns) {
    console.warn(JSON.stringify({ type: "signup_limiter_unavailable", at: Date.now() }));
    return {
      check: async () => ({ chan: false, thuLaiSauMs: 0 }),
      record: async () => {},
    };
  }
  const stub = ns.get(ns.idFromName(key));
  return {
    async check() {
      const res = await stub.fetch("https://signup-limiter/check");
      return (await res.json()) as SignupGate;
    },
    async record() {
      await stub.fetch("https://signup-limiter/record", { method: "POST" });
    },
  };
}

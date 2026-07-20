// U17b (QĐ-2) — Durable Object đếm lượt đăng ký theo IP, cửa sổ trượt. WIRING MỎNG: chỉ
// nạp/lưu state → ủy quyền cho logic THUẦN đã test kỹ ở signupLimiter.ts → lưu. Đơn luồng
// theo thiết kế DO → không cần khóa. KHÔNG test-cover (cần runtime DO thật; logic đã phủ
// ở signupLimiter.test.ts), giống loginLimiterDO.ts.
//
// F1 (TOCTOU) — route CŨ gọi /check rồi /record qua HAI fetch() riêng, với việc DB thật xen
// giữa ⇒ nhiều request đồng thời cùng lọt qua /check trước khi request đầu kịp gọi /record
// (đo được 12/12 lọt ngưỡng 3 — xem RED-PROOF trong dangKy.test.ts). /check-and-record dưới
// đây gộp đọc+ghi vào ĐÚNG MỘT fetch() — input-gating của Durable Object đảm bảo fetch() này
// chạy TRỌN VẸN (đọc storage → tính toán → ghi storage) trước khi một fetch() KHÁC (từ IP
// khác hay chính IP này) được xử lý tiếp, khép lỗ TOCTOU tại đúng điểm cần nguyên tử.
import {
  type SignupCheckAndRecordOutcome,
  type SignupLimitConfig,
  type SignupState,
  checkAndRecordSignup,
  initialSignupState,
  refundSignup,
  resolveSignupLimitConfig,
} from "./signupLimiter";
import type { Env, SignupCheckAndRecordResult, SignupLimiterClient } from "./types";

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

    if (url.pathname === "/check-and-record") {
      const outcome: SignupCheckAndRecordOutcome = checkAndRecordSignup(state, nowMs, this.cfg);
      await this.ctx.storage.put(STATE_KEY, outcome.state);
      // QUAN SÁT khi chạm ngưỡng: CHỈ metadata vận hành, KHÔNG IP/PII (security.md).
      if (outcome.gate.chan) {
        console.warn(JSON.stringify({ type: "signup_rate_limited", at: nowMs }));
      }
      // KHÔNG trả `state` nội bộ ra ngoài — chỉ gate + token (hình dạng SignupLimiterClient).
      const body: SignupCheckAndRecordResult =
        outcome.token === undefined
          ? { gate: outcome.gate }
          : { gate: outcome.gate, token: outcome.token };
      return Response.json(body);
    }
    if (url.pathname === "/refund") {
      const payload = (await req.json().catch(() => null)) as { token?: unknown } | null;
      const token = typeof payload?.token === "number" ? payload.token : undefined;
      if (token !== undefined) {
        await this.ctx.storage.put(STATE_KEY, refundSignup(state, token));
      }
      return Response.json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }
}

/** Adapter DO stub → SignupLimiterClient. Khóa theo key (IP) ⇒ mỗi địa chỉ IP một bộ đếm
 * riêng. Nếu namespace thiếu (binding chưa bật) → fail-open (không chặn, không token nào để
 * refund) — một limiter mất không được phép làm sập cổng đăng ký công khai. */
export function signupLimiterClient(
  ns: DurableObjectNamespace | undefined,
  key: string,
): SignupLimiterClient {
  if (!ns) {
    console.warn(JSON.stringify({ type: "signup_limiter_unavailable", at: Date.now() }));
    return {
      checkAndRecord: async () => ({ gate: { chan: false, thuLaiSauMs: 0 } }),
      refund: async () => {},
    };
  }
  const stub = ns.get(ns.idFromName(key));
  return {
    async checkAndRecord() {
      const res = await stub.fetch("https://signup-limiter/check-and-record", { method: "POST" });
      return (await res.json()) as SignupCheckAndRecordResult;
    },
    async refund(token: number) {
      await stub.fetch("https://signup-limiter/refund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
    },
  };
}

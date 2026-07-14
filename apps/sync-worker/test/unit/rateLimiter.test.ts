// U9 — Test rate-limit token-bucket + circuit breaker (nhóm unit, thuần, offline).
// Logic tách khỏi Durable Object (runtime) để test xác định qua nowMs tiêm vào —
// DO chỉ là wiring mỏng bọc logic này (tenantLimiter.ts). "Không gọi dồn dập" máy
// chủ thuế (ADR-0001 §5, security.md).
import { describe, expect, it } from "vitest";
import {
  type RateLimiterConfig,
  initialState,
  recordResult,
  tryAcquire,
} from "../../src/rateLimiter";

const CFG: RateLimiterConfig = {
  capacity: 2,
  refillPerSec: 1,
  failureThreshold: 3,
  cooldownMs: 60_000,
};

describe("token bucket", () => {
  it("khởi tạo đầy giỏ; tiêu hết rồi bị chặn (rate_limited); nạp lại theo thời gian", () => {
    let s = initialState(CFG, 0);
    expect(s.tokens).toBe(2);

    const a1 = tryAcquire(s, 0, CFG);
    expect(a1.allowed).toBe(true);
    const a2 = tryAcquire(a1.state, 0, CFG);
    expect(a2.allowed).toBe(true);

    // Giỏ rỗng tại t=0 → chặn.
    const a3 = tryAcquire(a2.state, 0, CFG);
    expect(a3.allowed).toBe(false);
    expect(a3.reason).toBe("rate_limited");

    // Sau 1s (refillPerSec=1) → có lại 1 token.
    const a4 = tryAcquire(a3.state, 1000, CFG);
    expect(a4.allowed).toBe(true);
    s = a4.state;
    expect(s.tokens).toBeLessThan(1);
  });

  it("không nạp vượt capacity", () => {
    const s = initialState(CFG, 0);
    const a = tryAcquire(s, 10_000, CFG); // 10s trôi qua nhưng trần = capacity
    expect(a.allowed).toBe(true);
    expect(a.state.tokens).toBeLessThanOrEqual(CFG.capacity);
  });
});

describe("circuit breaker", () => {
  it("mở sau N lỗi liên tiếp → chặn dù còn token (breaker_open); đóng lại sau cooldown", () => {
    let s = initialState(CFG, 0);
    s = recordResult(s, false, 0, CFG);
    s = recordResult(s, false, 0, CFG);
    expect(s.breakerOpenUntilMs).toBe(0); // 2 lỗi < ngưỡng 3 → chưa mở
    s = recordResult(s, false, 0, CFG);
    expect(s.breakerOpenUntilMs).toBeGreaterThan(0); // lỗi thứ 3 → mở

    // Breaker mở → chặn NGAY dù giỏ còn token.
    const blocked = tryAcquire(s, 100, CFG);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("breaker_open");

    // Sau cooldown → cho qua lại.
    const ok = tryAcquire(s, 60_001, CFG);
    expect(ok.allowed).toBe(true);
  });

  it("một lần thành công reset chuỗi lỗi + đóng breaker", () => {
    let s = initialState(CFG, 0);
    s = recordResult(s, false, 0, CFG);
    s = recordResult(s, false, 0, CFG);
    s = recordResult(s, true, 0, CFG);
    expect(s.consecutiveFailures).toBe(0);
    expect(s.breakerOpenUntilMs).toBe(0);
    // Sau reset, cần lại đủ N lỗi mới mở → 1 lỗi không mở.
    s = recordResult(s, false, 0, CFG);
    expect(s.breakerOpenUntilMs).toBe(0);
  });
});

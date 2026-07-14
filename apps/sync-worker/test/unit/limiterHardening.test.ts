// U12 — Làm cứng rate limit (ngưỡng tinh chỉnh + quan sát), trên nền logic thuần U9.
// Hai bổ sung THUẦN, test offline: (1) resolveLimiterConfig — ngưỡng tiêm từ env
// (không hardcode trong DO); (2) limiterEvent — sự kiện quan sát khi bị chặn.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITER_CONFIG,
  initialState,
  limiterEvent,
  resolveLimiterConfig,
  tryAcquire,
} from "../../src/rateLimiter";

describe("resolveLimiterConfig (ngưỡng tiêm từ env)", () => {
  it("env rỗng → mặc định", () => {
    expect(resolveLimiterConfig({})).toEqual(DEFAULT_LIMITER_CONFIG);
  });

  it("env hợp lệ → ghi đè từng trường", () => {
    const cfg = resolveLimiterConfig({
      LIMITER_CAPACITY: "3",
      LIMITER_REFILL_PER_SEC: "1",
      LIMITER_FAILURE_THRESHOLD: "2",
      LIMITER_COOLDOWN_MS: "5000",
    });
    expect(cfg).toEqual({
      capacity: 3,
      refillPerSec: 1,
      failureThreshold: 2,
      cooldownMs: 5000,
    });
  });

  it("giá trị không hợp lệ (không phải số/≤0) → về mặc định trường đó", () => {
    const cfg = resolveLimiterConfig({
      LIMITER_CAPACITY: "abc",
      LIMITER_REFILL_PER_SEC: "-1",
      LIMITER_FAILURE_THRESHOLD: "0",
      LIMITER_COOLDOWN_MS: "",
    });
    expect(cfg).toEqual(DEFAULT_LIMITER_CONFIG);
  });

  it("ngưỡng tiêm áp dụng THẬT: capacity=2 từ env → lời gọi thứ 3 bị chặn", () => {
    const cfg = resolveLimiterConfig({ LIMITER_CAPACITY: "2", LIMITER_REFILL_PER_SEC: "0.0001" });
    let s = initialState(cfg, 0);
    expect(tryAcquire(s, 0, cfg).allowed).toBe(true);
    s = tryAcquire(s, 0, cfg).state;
    expect(tryAcquire(s, 0, cfg).allowed).toBe(true);
    s = tryAcquire(s, 0, cfg).state;
    const third = tryAcquire(s, 0, cfg);
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe("rate_limited");
  });
});

describe("limiterEvent (quan sát khi bị chặn)", () => {
  it("dựng sự kiện có cấu trúc: type + reason + key + mốc thời gian", () => {
    const ev = limiterEvent("breaker_open", "tenant-1:0100000001", 1234);
    expect(ev).toEqual({
      type: "limiter_blocked",
      reason: "breaker_open",
      key: "tenant-1:0100000001",
      at: 1234,
    });
  });

  it("không chứa trường nhạy cảm (chỉ metadata vận hành, security.md)", () => {
    const ev = limiterEvent("rate_limited", "k", 0);
    for (const k of Object.keys(ev)) {
      expect(["token", "password", "authorization", "raw_json"]).not.toContain(k);
    }
  });
});

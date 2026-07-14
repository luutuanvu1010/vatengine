// U9 — Logic token-bucket rate limit + circuit breaker (THUẦN, không side-effect,
// nhận `nowMs` tiêm vào → test xác định). Durable Object `TenantLimiter` chỉ bọc
// mỏng logic này + lưu trạng thái (tenantLimiter.ts). Mục tiêu: "không gọi dồn dập"
// máy chủ thuế theo tenant/MST (ADR-0001 §5, security.md). U9 = tối thiểu; làm cứng
// (ngưỡng tinh chỉnh, quan sát) ở U12.

export interface RateLimiterConfig {
  /** Sức chứa giỏ token (số lời gọi bùng nổ tối đa). */
  capacity: number;
  /** Tốc độ nạp token (token/giây). */
  refillPerSec: number;
  /** Số lỗi liên tiếp để MỞ circuit breaker. */
  failureThreshold: number;
  /** Thời gian breaker giữ mở (ms) trước khi cho thử lại. */
  cooldownMs: number;
}

export interface RateLimiterState {
  tokens: number;
  lastRefillMs: number;
  consecutiveFailures: number;
  /** Mốc epoch (ms) breaker còn mở tới; 0 = đóng. */
  breakerOpenUntilMs: number;
}

export const DEFAULT_LIMITER_CONFIG: RateLimiterConfig = {
  capacity: 10,
  refillPerSec: 2,
  failureThreshold: 5,
  cooldownMs: 60_000,
};

export function initialState(cfg: RateLimiterConfig, nowMs: number): RateLimiterState {
  return {
    tokens: cfg.capacity,
    lastRefillMs: nowMs,
    consecutiveFailures: 0,
    breakerOpenUntilMs: 0,
  };
}

/** Nạp token theo thời gian trôi qua, trần = capacity. */
function refill(state: RateLimiterState, nowMs: number, cfg: RateLimiterConfig): RateLimiterState {
  const elapsedMs = Math.max(0, nowMs - state.lastRefillMs);
  if (elapsedMs === 0) return state;
  const added = (elapsedMs / 1000) * cfg.refillPerSec;
  return {
    ...state,
    tokens: Math.min(cfg.capacity, state.tokens + added),
    lastRefillMs: nowMs,
  };
}

export interface AcquireResult {
  allowed: boolean;
  reason?: "rate_limited" | "breaker_open";
  state: RateLimiterState;
}

/** Thử lấy 1 token. Breaker mở → chặn NGAY (kể cả còn token). Giỏ rỗng → rate_limited. */
export function tryAcquire(
  state: RateLimiterState,
  nowMs: number,
  cfg: RateLimiterConfig,
): AcquireResult {
  if (state.breakerOpenUntilMs > nowMs) {
    return { allowed: false, reason: "breaker_open", state };
  }
  const refilled = refill(state, nowMs, cfg);
  if (refilled.tokens >= 1) {
    return { allowed: true, state: { ...refilled, tokens: refilled.tokens - 1 } };
  }
  return { allowed: false, reason: "rate_limited", state: refilled };
}

/** Cập nhật breaker theo kết quả một lời gọi. Thành công → reset + đóng breaker;
 * đủ N lỗi liên tiếp → mở breaker tới `nowMs + cooldownMs`. */
export function recordResult(
  state: RateLimiterState,
  ok: boolean,
  nowMs: number,
  cfg: RateLimiterConfig,
): RateLimiterState {
  if (ok) {
    return { ...state, consecutiveFailures: 0, breakerOpenUntilMs: 0 };
  }
  const failures = state.consecutiveFailures + 1;
  if (failures >= cfg.failureThreshold) {
    return { ...state, consecutiveFailures: 0, breakerOpenUntilMs: nowMs + cfg.cooldownMs };
  }
  return { ...state, consecutiveFailures: failures };
}

// H-A.5b — Logic khóa đăng nhập per-account (THUẦN, không side-effect, nhận nowMs tiêm
// → test xác định). Durable Object `LoginLimiter` (loginLimiterDO.ts) chỉ bọc mỏng logic
// này + lưu trạng thái. Bổ sung lớp app cho WAF per-IP (edge): khóa THEO TÀI KHOẢN mà
// WAF per-IP không làm được (chặn dò một tài khoản qua nhiều IP). Khóa TẠM auto-hết-hạn
// (không vĩnh viễn → giới hạn account-lockout DoS). Key theo email (kể cả email giả) ⇒
// enumeration-neutral. Ngưỡng tiêm từ env, fail-safe về mặc định.

export interface LoginLockConfig {
  /** Số lần sai (trong cửa sổ) để khóa. */
  maxFailures: number;
  /** Cửa sổ trượt đếm lần sai (ms). */
  windowMs: number;
  /** Thời gian khóa mỗi lần chạm ngưỡng (ms). */
  lockoutMs: number;
}

export interface LoginLockState {
  /** Mốc epoch (ms) các lần sai gần đây còn trong cửa sổ. */
  failures: number[];
  /** Mốc epoch (ms) khóa còn hiệu lực tới; 0 = không khóa. */
  lockedUntilMs: number;
}

export const DEFAULT_LOGIN_LOCK_CONFIG: LoginLockConfig = {
  maxFailures: 10,
  windowMs: 15 * 60_000, // 15 phút.
  lockoutMs: 15 * 60_000, // khóa 15 phút.
};

export interface LoginLockEnv {
  LOGIN_MAX_FAILURES?: string;
  LOGIN_WINDOW_MS?: string;
  LOGIN_LOCKOUT_MS?: string;
}

function positiveOr(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveLoginLockConfig(env: LoginLockEnv): LoginLockConfig {
  return {
    maxFailures: positiveOr(env.LOGIN_MAX_FAILURES, DEFAULT_LOGIN_LOCK_CONFIG.maxFailures),
    windowMs: positiveOr(env.LOGIN_WINDOW_MS, DEFAULT_LOGIN_LOCK_CONFIG.windowMs),
    lockoutMs: positiveOr(env.LOGIN_LOCKOUT_MS, DEFAULT_LOGIN_LOCK_CONFIG.lockoutMs),
  };
}

export function initialLockState(): LoginLockState {
  return { failures: [], lockedUntilMs: 0 };
}

export interface LockGate {
  locked: boolean;
  /** Còn bao lâu (ms) mới hết khóa; 0 nếu không khóa. */
  retryAfterMs: number;
}

/** Kiểm trạng thái khóa tại thời điểm nowMs (KHÔNG đột biến state). */
export function checkLock(state: LoginLockState, nowMs: number, _cfg: LoginLockConfig): LockGate {
  if (state.lockedUntilMs > nowMs) {
    return { locked: true, retryAfterMs: state.lockedUntilMs - nowMs };
  }
  return { locked: false, retryAfterMs: 0 };
}

/** Ghi một lần sai; nếu đủ N lần trong cửa sổ → đặt khóa mới. Trả state MỚI. */
export function recordFailure(
  state: LoginLockState,
  nowMs: number,
  cfg: LoginLockConfig,
): LoginLockState {
  // Giữ khóa hiện hành nếu còn hiệu lực (không nới lỏng do lần sai mới).
  const lockedUntilMs = state.lockedUntilMs > nowMs ? state.lockedUntilMs : 0;
  const recent = state.failures.filter((t) => t > nowMs - cfg.windowMs);
  recent.push(nowMs);
  if (recent.length >= cfg.maxFailures) {
    // Chạm ngưỡng → khóa + reset đếm (tránh khóa nối dài vô hạn từ một chuỗi cũ).
    return { failures: [], lockedUntilMs: nowMs + cfg.lockoutMs };
  }
  return { failures: recent, lockedUntilMs };
}

/** Đăng nhập đúng → xóa sạch lịch sử sai + khóa. */
export function recordSuccess(): LoginLockState {
  return initialLockState();
}

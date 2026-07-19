// U17b (QĐ-2) — Logic đếm lượt đăng ký theo IP, cửa sổ trượt (THUẦN, nhận nowMs tiêm →
// test xác định). Durable Object `SignupLimiter` (signupLimiterDO.ts) chỉ bọc mỏng logic
// này + lưu trạng thái, theo đúng khuôn loginLimiterDO.ts.
//
// KHÁC `LoginLimiter` ở điểm cốt lõi: LoginLimiter đếm LẦN SAI rồi khoá, và
// recordSuccess() xoá sạch bộ đếm. SignupLimiter đếm MỌI lượt kể cả thành công — một kẻ
// lạm dụng đăng ký thành công 1000 tenant rác vẫn là lạm dụng. KHÔNG tái dùng
// LoginLimiter (đăng ký công khai không có khái niệm "thất bại" để đếm riêng).
import { clampInt } from "./configClamp";

export interface SignupLimitConfig {
  /** Số lượt đăng ký tối đa (mọi kết quả) cho một IP trong cửa sổ. */
  maxMoiCuaSo: number;
  /** Cửa sổ trượt đếm lượt (ms). */
  cuaSoMs: number;
}

export interface SignupState {
  /** Mốc epoch (ms) các lượt đăng ký còn trong cửa sổ — MỌI kết quả, kể cả thành công. */
  luot: number[];
}

export const DEFAULT_SIGNUP_LIMIT_CONFIG: SignupLimitConfig = {
  maxMoiCuaSo: 5,
  cuaSoMs: 60 * 60_000, // 1 giờ.
};

export interface SignupLimitEnv {
  // Rác/thiếu → mặc định; luôn bị kẹp biên 1..50 ở resolveSignupLimitConfig (không nhạy
  // cảm — var wrangler thường, không phải secret).
  DANGKY_MAX_MOI_IP_GIO?: string;
}

/** Kẹp biên 1..50 qua clampInt (configClamp.ts, U17a): 0 không được phép khoá sạch người
 * đăng ký hợp lệ, số khổng lồ không được phép vô hiệu hoá chống lạm dụng. */
export function resolveSignupLimitConfig(env: SignupLimitEnv): SignupLimitConfig {
  return {
    maxMoiCuaSo: clampInt(
      env.DANGKY_MAX_MOI_IP_GIO,
      1,
      50,
      DEFAULT_SIGNUP_LIMIT_CONFIG.maxMoiCuaSo,
    ),
    cuaSoMs: DEFAULT_SIGNUP_LIMIT_CONFIG.cuaSoMs,
  };
}

export function initialSignupState(): SignupState {
  return { luot: [] };
}

export interface SignupGate {
  chan: boolean;
  /** Còn bao lâu (ms) mới được thử lại; 0 nếu không bị chặn. */
  thuLaiSauMs: number;
}

/** Kiểm trạng thái chặn tại thời điểm nowMs (KHÔNG đột biến state). */
export function checkSignup(state: SignupState, nowMs: number, cfg: SignupLimitConfig): SignupGate {
  const recent = state.luot.filter((t) => t > nowMs - cfg.cuaSoMs);
  if (recent.length < cfg.maxMoiCuaSo) return { chan: false, thuLaiSauMs: 0 };
  // Chặn tới khi lượt CŨ NHẤT còn trong cửa sổ hết hạn (cửa sổ trượt → thời gian chờ
  // giảm dần khi thời gian trôi, không phải một khoảng khoá cố định).
  const oldest = Math.min(...recent);
  return { chan: true, thuLaiSauMs: oldest + cfg.cuaSoMs - nowMs };
}

/** Ghi một lượt đăng ký — ĐẾM MỌI kết quả (kể cả thành công). Trả state MỚI. */
export function recordSignup(
  state: SignupState,
  nowMs: number,
  cfg: SignupLimitConfig,
): SignupState {
  const recent = state.luot.filter((t) => t > nowMs - cfg.cuaSoMs);
  recent.push(nowMs);
  return { luot: recent };
}

// U17b (QĐ-2) — Logic đếm lượt đăng ký theo IP, cửa sổ trượt (THUẦN, nhận nowMs tiêm →
// test xác định). Durable Object `SignupLimiter` (signupLimiterDO.ts) chỉ bọc mỏng logic
// này + lưu trạng thái, theo đúng khuôn loginLimiterDO.ts.
//
// KHÁC `LoginLimiter` ở điểm cốt lõi: LoginLimiter đếm LẦN SAI rồi khoá, và
// recordSuccess() xoá sạch bộ đếm. SignupLimiter đếm MỌI lượt kể cả thành công — một kẻ
// lạm dụng đăng ký thành công 1000 tenant rác vẫn là lạm dụng. KHÔNG tái dùng
// LoginLimiter (đăng ký công khai không có khái niệm "thất bại" để đếm riêng).
//
// F1 (2026-07-20, TOCTOU) — TRƯỚC bản vá này, API là checkSignup() (đọc, không đột biến) +
// recordSignup() (ghi) gọi RỜI qua HAI round-trip DO riêng (xem lịch sử git). dangKy.ts gọi
// check() rồi làm việc DB thật rồi mới record() — Durable Object chỉ tuần tự hoá TỪNG fetch()
// riêng lẻ, KHÔNG tuần tự hoá một CẶP check()→record() cách nhau bởi việc khác, nên N request
// đồng thời từ một IP đều lọt qua check() trước khi request đầu kịp record() (đo được: 12/12
// lọt qua ngưỡng 3 — xem RED-PROOF trong dangKy.test.ts trước khi sửa). Bản vá thay bằng MỘT
// hàm nguyên tử `checkAndRecordSignup` (kiểm+ghi trong cùng một fetch() DO) + `refundSignup`
// (hoàn tác có kiểm soát cho lỗi hạ tầng — xem dangKy.ts).
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

/** Kết quả một lượt kiểm+ghi NGUYÊN TỬ (checkAndRecordSignup). `state` là trạng thái MỚI
 * cần lưu (DO wrapper — signupLimiterDO.ts — chịu trách nhiệm persist). `token` (= nowMs lúc
 * ghi) CHỈ có khi `gate.chan === false` (có ghi thật) — dùng để refundSignup() hoàn tác
 * ĐÚNG lượt này nếu về sau request thất bại vì lỗi HẠ TẦNG (không phải lạm dụng). */
export interface SignupCheckAndRecordOutcome {
  state: SignupState;
  gate: SignupGate;
  token?: number;
}

/** F1 (TOCTOU) — thay cặp checkSignup()/recordSignup() TÁCH RỜI cũ (hai round-trip DO riêng,
 * để lọt cửa sổ giữa chúng cho N request đồng thời) bằng MỘT thao tác NGUYÊN TỬ: kiểm VÀ ghi
 * trong CÙNG một bước. Nguyên tử hoá đạt được ở TẦNG DO (signupLimiterDO.ts gọi hàm này bên
 * trong ĐÚNG MỘT fetch() — input-gating của Durable Object đảm bảo không lệnh gọi nào khác
 * xen được vào giữa đọc và ghi của LẦN GỌI NÀY).
 *
 * - ĐÃ chạm ngưỡng TRƯỚC lượt này → chặn, KHÔNG ghi thêm (giữ đúng hành vi cũ: một lượt đã
 *   biết bị chặn không được phép thổi phồng cửa sổ đếm — Finding 4 test riêng).
 * - CHƯA chạm ngưỡng → ghi lượt này NGAY (đếm cả lượt sẽ thất bại sau ở tầng validate/DB —
 *   đúng thiết kế đã chốt: validate rẻ không được là đường né limiter), rồi mới báo qua.
 */
export function checkAndRecordSignup(
  state: SignupState,
  nowMs: number,
  cfg: SignupLimitConfig,
): SignupCheckAndRecordOutcome {
  const recent = state.luot.filter((t) => t > nowMs - cfg.cuaSoMs);
  if (recent.length >= cfg.maxMoiCuaSo) {
    // Chặn tới khi lượt CŨ NHẤT còn trong cửa sổ hết hạn (cửa sổ trượt → thời gian chờ
    // giảm dần khi thời gian trôi, không phải một khoảng khoá cố định).
    const oldest = Math.min(...recent);
    return {
      state: { luot: recent },
      gate: { chan: true, thuLaiSauMs: oldest + cfg.cuaSoMs - nowMs },
    };
  }
  const next = [...recent, nowMs];
  return { state: { luot: next }, gate: { chan: false, thuLaiSauMs: 0 }, token: nowMs };
}

/** Hoàn lại ĐÚNG MỘT lượt đã ghi bởi checkAndRecordSignup, khớp theo `token` (= nowMs lúc
 * ghi) — dùng khi request sau đó lộ ra là lỗi HẠ TẦNG của HỆ THỐNG (vd DB hỏng kết nối giữa
 * chừng), không phải hành vi của người gọi (xem dangKy.ts, F9-hardening). KHÔNG dùng cho 4xx
 * nghiệp vụ hay 409 trùng lặp — những ca đó vẫn phải tính vào quota (đúng thiết kế đã chốt).
 *
 * Xoá ĐÚNG MỘT phần tử khớp token bằng indexOf + splice(1) — CHỦ Ý không dùng filter loại
 * MỌI phần tử bằng token, vì hai request khác nhau có thể ghi trùng mili-giây (nowMs) dưới
 * tải đồng thời; refund một request không được phép xoá luôn lượt của request khác. Token
 * không khớp (đã trôi khỏi cửa sổ, hoặc chưa từng ghi) → no-op, trả nguyên state.
 */
export function refundSignup(state: SignupState, token: number): SignupState {
  const idx = state.luot.indexOf(token);
  if (idx === -1) return state;
  const next = state.luot.slice();
  next.splice(idx, 1);
  return { luot: next };
}

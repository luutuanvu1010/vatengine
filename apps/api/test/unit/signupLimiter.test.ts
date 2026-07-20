// U17b (QĐ-2) — Logic đếm lượt đăng ký theo IP, cửa sổ trượt. THUẦN, nhận nowMs tiêm nên
// test xác định, không phụ thuộc đồng hồ thật.
//
// F1 (2026-07-20, TOCTOU) — checkSignup()/recordSignup() (đọc rồi ghi TÁCH RỜI) đã thay bằng
// checkAndRecordSignup() NGUYÊN TỬ (kiểm+ghi trong cùng một bước) + refundSignup() (hoàn tác
// có kiểm soát) — xem dangKy.ts và signupLimiterDO.ts để biết vì sao (12/12 request đồng thời
// lọt qua ngưỡng 3 dưới cặp check/record cũ, đo được trong dangKy.test.ts trước khi sửa).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNUP_LIMIT_CONFIG,
  type SignupState,
  checkAndRecordSignup,
  initialSignupState,
  refundSignup,
  resolveSignupLimitConfig,
} from "../../src/signupLimiter";

const CFG = { maxMoiCuaSo: 5, cuaSoMs: 60 * 60_000 };
const T0 = 1_700_000_000_000;

/** Tiện ích test: ghi N lượt liên tiếp bắt đầu từ T0, trả state cuối cùng. */
function recordN(n: number, startMs = T0, stepMs = 1000): SignupState {
  let s = initialSignupState();
  for (let i = 0; i < n; i++) {
    s = checkAndRecordSignup(s, startMs + i * stepMs, CFG).state;
  }
  return s;
}

describe("signupLimiter — checkAndRecordSignup (nguyên tử)", () => {
  it("dưới ngưỡng → cho qua VÀ ghi lượt (có token)", () => {
    const s = recordN(4);
    const r = checkAndRecordSignup(s, T0 + 5000, CFG);
    expect(r.gate.chan).toBe(false);
    expect(r.token).toBe(T0 + 5000);
    expect(r.state.luot).toHaveLength(5);
  });

  it("chạm ngưỡng → chặn, kèm thời gian chờ dương, KHÔNG token (không ghi)", () => {
    const s = recordN(5);
    const r = checkAndRecordSignup(s, T0 + 5000, CFG);
    expect(r.gate.chan).toBe(true);
    expect(r.gate.thuLaiSauMs).toBeGreaterThan(0);
    expect(r.token).toBeUndefined();
  });

  // Finding 4 — "một request đã biết bị chặn không được thổi phồng cửa sổ đếm": TRƯỚC đây
  // chỉ chứng minh bằng đọc code (record() không được gọi sau check() chặn). Giờ kiểm THẬT:
  // gọi checkAndRecordSignup NHIỀU LẦN sau khi đã đầy ngưỡng — state.luot phải giữ NGUYÊN độ
  // dài (không thêm phần tử nào), và thời gian chờ chỉ giảm dần theo thời gian trôi tự nhiên
  // (KHÔNG nhảy lên do bị "ghi thêm" rồi tính lại oldest mới).
  it("Finding 4 — lượt ĐÃ BỊ CHẶN gọi lặp lại KHÔNG thổi phồng cửa sổ đếm", () => {
    const full = recordN(5); // đúng 5/5, mốc cuối T0+4000
    const blocked1 = checkAndRecordSignup(full, T0 + 5000, CFG);
    expect(blocked1.gate.chan).toBe(true);
    expect(blocked1.state.luot).toHaveLength(5);

    const blocked2 = checkAndRecordSignup(blocked1.state, T0 + 6000, CFG);
    const blocked3 = checkAndRecordSignup(blocked2.state, T0 + 7000, CFG);
    expect(blocked3.state.luot).toHaveLength(5); // vẫn đúng 5 — không lượt chặn nào lọt vào
    expect(blocked3.token).toBeUndefined();
    // Thời gian chờ CHỈ giảm dần theo nowMs trôi (không nhảy lên vì bị ghi thêm oldest mới).
    expect(blocked3.gate.thuLaiSauMs).toBeLessThan(blocked1.gate.thuLaiSauMs);
  });

  it("ĐẾM CẢ LƯỢT THÀNH CÔNG — khác LoginLimiter (đăng ký rác thành công vẫn là lạm dụng)", () => {
    const s = recordN(5);
    // Không có recordSuccess() nào xoá bộ đếm — đúng thiết kế.
    expect(checkAndRecordSignup(s, T0 + 6000, CFG).gate.chan).toBe(true);
  });

  it("cửa sổ TRƯỢT: lượt cũ hết hạn thì lại cho qua", () => {
    const s = recordN(5);
    expect(checkAndRecordSignup(s, T0 + CFG.cuaSoMs + 2000, CFG).gate.chan).toBe(false);
  });

  it("thời gian chờ giảm dần khi thời gian trôi", () => {
    const s = recordN(5, T0, 0); // 5 lượt CÙNG mốc T0 → luôn đầy ngưỡng ngay sau đó
    const a = checkAndRecordSignup(s, T0 + 1000, CFG).gate.thuLaiSauMs;
    const b = checkAndRecordSignup(s, T0 + 60_000, CFG).gate.thuLaiSauMs;
    expect(b).toBeLessThan(a);
  });

  it("config: env hợp lệ thắng mặc định; rác → mặc định; luôn bị KẸP BIÊN", () => {
    expect(resolveSignupLimitConfig({ DANGKY_MAX_MOI_IP_GIO: "12" }).maxMoiCuaSo).toBe(12);
    expect(resolveSignupLimitConfig({ DANGKY_MAX_MOI_IP_GIO: "rác" }).maxMoiCuaSo).toBe(
      DEFAULT_SIGNUP_LIMIT_CONFIG.maxMoiCuaSo,
    );
    // Kẹp biên 1..50 — admin đặt 0 không được phép khoá sạch, đặt 99999 không được phép
    // vô hiệu hoá chống lạm dụng.
    expect(resolveSignupLimitConfig({ DANGKY_MAX_MOI_IP_GIO: "0" }).maxMoiCuaSo).toBe(1);
    expect(resolveSignupLimitConfig({ DANGKY_MAX_MOI_IP_GIO: "99999" }).maxMoiCuaSo).toBe(50);
  });
});

describe("signupLimiter — refundSignup (hoàn tác lỗi hạ tầng, Finding 1)", () => {
  it("hoàn ĐÚNG MỘT lượt khớp token — xoá khỏi state, ngưỡng lại còn chỗ", () => {
    const r = checkAndRecordSignup(recordN(4), T0 + 5000, CFG); // 5/5, token = T0+5000
    expect(r.gate.chan).toBe(false);
    const afterRefund = refundSignup(r.state, r.token as number);
    expect(afterRefund.luot).toHaveLength(4);
    // Ngưỡng lại còn 1 chỗ trống — request kế tiếp phải được cho qua.
    expect(checkAndRecordSignup(afterRefund, T0 + 5100, CFG).gate.chan).toBe(false);
  });

  it("token KHÔNG khớp (đã hết hạn/chưa từng ghi) → no-op, state giữ nguyên", () => {
    const s = recordN(3);
    const same = refundSignup(s, T0 + 999_999); // mốc không tồn tại trong luot
    expect(same.luot).toEqual(s.luot);
  });

  it("KHÔNG xoá nhầm lượt của request KHÁC ghi TRÙNG mili-giây — chỉ xoá MỘT phần tử khớp", () => {
    // Hai lượt cùng ghi đúng T0 (mô phỏng hai request xử lý trong cùng 1ms dưới tải đồng
    // thời — checkAndRecordSignup gọi hai lần liên tiếp với CÙNG nowMs).
    const first = checkAndRecordSignup(initialSignupState(), T0, CFG);
    const second = checkAndRecordSignup(first.state, T0, CFG);
    expect(second.state.luot).toEqual([T0, T0]);

    const afterRefund = refundSignup(second.state, T0);
    // Chỉ MỘT phần tử T0 bị xoá — phần tử còn lại của lượt kia vẫn còn nguyên.
    expect(afterRefund.luot).toEqual([T0]);
  });
});

// U17b (QĐ-2) — Logic đếm lượt đăng ký theo IP, cửa sổ trượt. THUẦN, nhận nowMs tiêm nên
// test xác định, không phụ thuộc đồng hồ thật.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNUP_LIMIT_CONFIG,
  checkSignup,
  initialSignupState,
  recordSignup,
  resolveSignupLimitConfig,
} from "../../src/signupLimiter";

const CFG = { maxMoiCuaSo: 5, cuaSoMs: 60 * 60_000 };
const T0 = 1_700_000_000_000;

describe("signupLimiter", () => {
  it("dưới ngưỡng → cho qua", () => {
    let s = initialSignupState();
    for (let i = 0; i < 4; i++) s = recordSignup(s, T0 + i * 1000, CFG);
    expect(checkSignup(s, T0 + 5000, CFG).chan).toBe(false);
  });

  it("chạm ngưỡng → chặn, kèm thời gian chờ dương", () => {
    let s = initialSignupState();
    for (let i = 0; i < 5; i++) s = recordSignup(s, T0 + i * 1000, CFG);
    const g = checkSignup(s, T0 + 5000, CFG);
    expect(g.chan).toBe(true);
    expect(g.thuLaiSauMs).toBeGreaterThan(0);
  });

  it("ĐẾM CẢ LƯỢT THÀNH CÔNG — khác LoginLimiter (đăng ký rác thành công vẫn là lạm dụng)", () => {
    let s = initialSignupState();
    for (let i = 0; i < 5; i++) s = recordSignup(s, T0 + i * 1000, CFG);
    // Không có recordSuccess() nào xoá bộ đếm — đúng thiết kế.
    expect(checkSignup(s, T0 + 6000, CFG).chan).toBe(true);
  });

  it("cửa sổ TRƯỢT: lượt cũ hết hạn thì lại cho qua", () => {
    let s = initialSignupState();
    for (let i = 0; i < 5; i++) s = recordSignup(s, T0 + i * 1000, CFG);
    expect(checkSignup(s, T0 + CFG.cuaSoMs + 2000, CFG).chan).toBe(false);
  });

  it("thời gian chờ giảm dần khi thời gian trôi", () => {
    let s = initialSignupState();
    for (let i = 0; i < 5; i++) s = recordSignup(s, T0, CFG);
    const a = checkSignup(s, T0 + 1000, CFG).thuLaiSauMs;
    const b = checkSignup(s, T0 + 60_000, CFG).thuLaiSauMs;
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

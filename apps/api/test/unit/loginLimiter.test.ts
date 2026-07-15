// H-A.5b — logic khóa đăng nhập per-account (THUẦN, nhận nowMs tiêm → test xác định).
// Durable Object LoginLimiter chỉ bọc mỏng logic này. Khóa TẠM auto-hết-hạn (không
// khóa vĩnh viễn → giới hạn account-lockout DoS). Key theo email (kể cả email giả) ⇒
// enumeration-neutral. Ngưỡng env-tunable, fail-safe về mặc định.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOGIN_LOCK_CONFIG,
  checkLock,
  initialLockState,
  recordFailure,
  recordSuccess,
  resolveLoginLockConfig,
} from "../../src/loginLimiter";

const CFG = { maxFailures: 3, windowMs: 10_000, lockoutMs: 60_000 };
const T0 = 1_000_000;

describe("loginLimiter (thuần)", () => {
  it("dưới ngưỡng: không khóa", () => {
    let s = initialLockState();
    s = recordFailure(s, T0, CFG);
    s = recordFailure(s, T0 + 1, CFG);
    expect(checkLock(s, T0 + 2, CFG).locked).toBe(false);
  });

  it("đạt N lần sai trong cửa sổ → KHÓA, retryAfter > 0", () => {
    let s = initialLockState();
    for (let i = 0; i < CFG.maxFailures; i++) s = recordFailure(s, T0 + i, CFG);
    const g = checkLock(s, T0 + CFG.maxFailures, CFG);
    expect(g.locked).toBe(true);
    expect(g.retryAfterMs).toBeGreaterThan(0);
    expect(g.retryAfterMs).toBeLessThanOrEqual(CFG.lockoutMs);
  });

  it("khóa TỰ HẾT HẠN sau lockoutMs (tính từ lần sai cuối)", () => {
    let s = initialLockState();
    for (let i = 0; i < CFG.maxFailures; i++) s = recordFailure(s, T0 + i, CFG);
    // Lần sai cuối tại T0+(N-1) → khóa tới T0+(N-1)+lockoutMs. Còn khóa ngay trước đó:
    expect(checkLock(s, T0 + CFG.maxFailures - 1 + CFG.lockoutMs - 1, CFG).locked).toBe(true);
    // Hết khóa sau đó:
    expect(checkLock(s, T0 + CFG.maxFailures + CFG.lockoutMs, CFG).locked).toBe(false);
  });

  it("lần sai NGOÀI cửa sổ không tính dồn (trượt cửa sổ)", () => {
    let s = initialLockState();
    s = recordFailure(s, T0, CFG);
    s = recordFailure(s, T0 + 1, CFG);
    // lần thứ 3 sau khi 2 lần đầu đã rơi khỏi cửa sổ → chỉ còn 1 trong cửa sổ
    s = recordFailure(s, T0 + CFG.windowMs + 5, CFG);
    expect(checkLock(s, T0 + CFG.windowMs + 6, CFG).locked).toBe(false);
  });

  it("recordFailure khi ĐANG khóa → GIỮ nguyên khóa (không nới hạn)", () => {
    let s = initialLockState();
    for (let i = 0; i < CFG.maxFailures; i++) s = recordFailure(s, T0 + i, CFG);
    const lockedUntil = s.lockedUntilMs;
    // thêm một lần sai khi vẫn còn khóa → mốc hết khóa KHÔNG bị đẩy xa thêm.
    s = recordFailure(s, T0 + 10, CFG);
    expect(s.lockedUntilMs).toBe(lockedUntil);
  });

  it("đăng nhập ĐÚNG → reset đếm (recordSuccess)", () => {
    let s = initialLockState();
    s = recordFailure(s, T0, CFG);
    s = recordFailure(s, T0 + 1, CFG);
    s = recordSuccess();
    s = recordFailure(s, T0 + 2, CFG); // chỉ còn 1 lần sai sau reset
    expect(checkLock(s, T0 + 3, CFG).locked).toBe(false);
  });

  describe("resolveLoginLockConfig (env)", () => {
    it("không đặt env → mặc định", () => {
      expect(resolveLoginLockConfig({})).toEqual(DEFAULT_LOGIN_LOCK_CONFIG);
    });
    it("env hợp lệ → dùng giá trị env", () => {
      const c = resolveLoginLockConfig({ LOGIN_MAX_FAILURES: "5", LOGIN_LOCKOUT_MS: "1000" });
      expect(c.maxFailures).toBe(5);
      expect(c.lockoutMs).toBe(1000);
    });
    it("env rác/không dương → fail-safe về mặc định (không tắt khóa vì cấu hình sai)", () => {
      const c = resolveLoginLockConfig({ LOGIN_MAX_FAILURES: "abc", LOGIN_WINDOW_MS: "-1" });
      expect(c.maxFailures).toBe(DEFAULT_LOGIN_LOCK_CONFIG.maxFailures);
      expect(c.windowMs).toBe(DEFAULT_LOGIN_LOCK_CONFIG.windowMs);
    });
  });
});

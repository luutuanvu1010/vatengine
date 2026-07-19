// GIÁM SÁT (mục C) — Test logic "sức khỏe egress" thuần (nhóm unit, offline).
// Theo dõi chuỗi verdict xấu liên tiếp; chỉ cảnh báo khi ỔN ĐỊNH (3 tick liên
// tiếp — quyết định #3), tránh báo động giả do trục trặc mạng nhất thời. OK ở
// giữa reset chuỗi; đã cảnh báo thì không lặp lại tới khi hồi phục (chống spam).
import { describe, expect, it } from "vitest";
import { BAD_STREAK_THRESHOLD, HEALTHY, isEgressBlocked, nextHealth } from "../../src/health";

// Chạy tuần tự một dãy verdict qua nextHealth, trả về (state cuối, danh sách alert).
function run(verdicts: Parameters<typeof nextHealth>[1][]) {
  let state = HEALTHY;
  const alerts = [];
  for (const v of verdicts) {
    const step = nextHealth(state, v);
    state = step.state;
    if (step.alert) alerts.push(step.alert);
  }
  return { state, alerts };
}

describe("nextHealth — sức khỏe egress", () => {
  it("(a) verdict OK từ trạng thái khỏe → vẫn khỏe, không cảnh báo", () => {
    const step = nextHealth(HEALTHY, "OK");
    expect(step.state).toEqual(HEALTHY);
    expect(step.alert).toBeNull();
  });

  it("(b) 3 GEO_BLOCKED liên tiếp → cảnh báo đúng ở tick thứ 3 (ngưỡng ổn định)", () => {
    const { alerts } = run(["GEO_BLOCKED", "GEO_BLOCKED", "GEO_BLOCKED"]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual({ verdict: "GEO_BLOCKED", consecutiveBad: BAD_STREAK_THRESHOLD });
  });

  it("(b') dưới ngưỡng (1–2 verdict xấu) → CHƯA cảnh báo", () => {
    expect(run(["GEO_BLOCKED"]).alerts).toHaveLength(0);
    expect(run(["GEO_BLOCKED", "GEO_BLOCKED"]).alerts).toHaveLength(0);
  });

  it("(c) OK xen giữa → reset chuỗi, phải xấu lại đủ ngưỡng mới báo", () => {
    const { alerts } = run(["GEO_BLOCKED", "GEO_BLOCKED", "OK", "GEO_BLOCKED", "GEO_BLOCKED"]);
    expect(alerts).toHaveLength(0);
  });

  it("(d) RATE_LIMITED phân biệt GEO_BLOCKED — cảnh báo mang đúng verdict", () => {
    const { alerts } = run(["RATE_LIMITED", "RATE_LIMITED", "RATE_LIMITED"]);
    expect(alerts).toEqual([{ verdict: "RATE_LIMITED", consecutiveBad: 3 }]);
  });

  it("(e) TIMEOUT/ERROR: một tick KHÔNG lập tức báo; 3 liên tiếp mới báo (chờ ổn định)", () => {
    expect(run(["TIMEOUT"]).alerts).toHaveLength(0);
    expect(run(["ERROR", "ERROR", "ERROR"]).alerts).toHaveLength(1);
  });

  it("(f) đã cảnh báo → verdict xấu tiếp KHÔNG cảnh báo lại (chống spam) tới khi OK hồi phục", () => {
    const { alerts, state } = run(["GEO_BLOCKED", "GEO_BLOCKED", "GEO_BLOCKED", "GEO_BLOCKED"]);
    expect(alerts).toHaveLength(1);
    expect(state.alerted).toBe(true);
    // Sau khi hồi phục rồi xấu lại đủ ngưỡng → cảnh báo LẦN NỮA.
    const again = run([
      "GEO_BLOCKED",
      "GEO_BLOCKED",
      "GEO_BLOCKED",
      "OK",
      "GEO_BLOCKED",
      "GEO_BLOCKED",
      "GEO_BLOCKED",
    ]);
    expect(again.alerts).toHaveLength(2);
  });
});

describe("H-B.6 — lastVerdict + isEgressBlocked", () => {
  it("nextHealth ghi lastVerdict ở nhánh XẤU; nhánh OK giữ HEALTHY (lastVerdict undefined)", () => {
    expect(nextHealth(HEALTHY, "GEO_BLOCKED").state.lastVerdict).toBe("GEO_BLOCKED");
    // OK KHÔNG đặt lastVerdict (giữ nguyên HEALTHY) → gate mở. Xem Step 3 giải thích.
    expect(nextHealth(HEALTHY, "OK").state.lastVerdict).toBeUndefined();
  });
  it("isEgressBlocked chỉ true khi lastVerdict = GEO_BLOCKED", () => {
    expect(isEgressBlocked(nextHealth(HEALTHY, "GEO_BLOCKED").state)).toBe(true);
    expect(isEgressBlocked(nextHealth(HEALTHY, "RATE_LIMITED").state)).toBe(false);
    expect(isEgressBlocked(HEALTHY)).toBe(false); // mặc định không chặn
  });
});

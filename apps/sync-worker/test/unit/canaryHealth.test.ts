// U43 — Máy trạng thái canary (thuần). QĐ-5: WAF_BLOCKED/DRIFT báo NGAY lần đầu (tín hiệu
// xác định), im tới khi hồi phục, hồi phục thì báo; TIMEOUT/ERROR cần 3 lần liên tiếp.
// Lần chạy đầu (chưa có trạng thái) và OK → tin "đã bật" đúng một lần.
import type { CanaryResult } from "@vat/gdt-client";
import { describe, expect, it } from "vitest";
import { type CanaryState, HEALTHY_CANARY, nextCanaryHealth } from "../../src/canaryHealth";

const NOW = "2026-09-24T05:00:00.000Z";
const kq = (verdict: CanaryResult["verdict"], httpStatus?: number): CanaryResult => ({
  verdict,
  httpStatus,
  latencyMs: 10,
});

describe("nextCanaryHealth", () => {
  it("chưa có trạng thái + OK → alert bat_giam_sat, state khỏe", () => {
    const s = nextCanaryHealth(undefined, kq("OK", 401), NOW);
    expect(s.alert?.kind).toBe("bat_giam_sat");
    expect(s.state).toEqual({ lastVerdict: "OK", consecutiveBad: 0, alerted: false });
  });

  it("chưa có trạng thái + WAF_BLOCKED → alert chan (KHÔNG phải 'đã bật')", () => {
    const s = nextCanaryHealth(undefined, kq("WAF_BLOCKED", 403), NOW);
    expect(s.alert?.kind).toBe("chan");
    expect(s.state.alerted).toBe(true);
    expect(s.state.since).toBe(NOW);
  });

  it("OK khi đang khỏe → không alert", () => {
    expect(nextCanaryHealth(HEALTHY_CANARY, kq("OK", 401), NOW).alert).toBeNull();
  });

  it("WAF_BLOCKED lần đầu → alert chan; lần hai → im (chống spam)", () => {
    const b1 = nextCanaryHealth(HEALTHY_CANARY, kq("WAF_BLOCKED", 403), NOW);
    expect(b1.alert?.kind).toBe("chan");
    expect(b1.alert?.result.httpStatus).toBe(403);
    const b2 = nextCanaryHealth(b1.state, kq("WAF_BLOCKED", 403), NOW);
    expect(b2.alert).toBeNull();
    expect(b2.state.consecutiveBad).toBe(2);
    expect(b2.state.since).toBe(NOW); // giữ mốc bắt đầu sự cố
  });

  it("DRIFT lần đầu → alert drift", () => {
    expect(nextCanaryHealth(HEALTHY_CANARY, kq("DRIFT", 200), NOW).alert?.kind).toBe("drift");
  });

  it("OK sau khi đã báo → alert hoi_phuc, state về khỏe", () => {
    const chan: CanaryState = {
      lastVerdict: "WAF_BLOCKED",
      consecutiveBad: 5,
      alerted: true,
      since: NOW,
    };
    const s = nextCanaryHealth(chan, kq("OK", 401), NOW);
    expect(s.alert?.kind).toBe("hoi_phuc");
    expect(s.state).toEqual({ lastVerdict: "OK", consecutiveBad: 0, alerted: false });
  });

  it("TIMEOUT ×2 → im; ×3 → alert loi_lien_tiep; ×4 → im", () => {
    let st: CanaryState = HEALTHY_CANARY;
    let s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert).toBeNull();
    st = s.state;
    s = nextCanaryHealth(st, kq("ERROR"), NOW);
    expect(s.alert).toBeNull();
    st = s.state;
    s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert?.kind).toBe("loi_lien_tiep");
    expect(s.alert?.consecutiveBad).toBe(3);
    st = s.state;
    s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert).toBeNull();
  });

  it("đang chuỗi TIMEOUT chưa báo, gặp WAF_BLOCKED → báo chan ngay", () => {
    const st: CanaryState = {
      lastVerdict: "TIMEOUT",
      consecutiveBad: 1,
      alerted: false,
      since: NOW,
    };
    expect(nextCanaryHealth(st, kq("WAF_BLOCKED", 403), NOW).alert?.kind).toBe("chan");
  });
});

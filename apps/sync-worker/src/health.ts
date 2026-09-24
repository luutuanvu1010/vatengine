// GIÁM SÁT (mục C) — Logic "sức khỏe egress" THUẦN (không I/O, test được offline).
// Probe egress phân loại mỗi tick thành ProbeVerdict (classify của @vat/gdt-client);
// hàm này gộp chuỗi verdict thành quyết định CÓ cảnh báo hay không. Cảnh báo chỉ phát
// khi verdict xấu ỔN ĐỊNH (BAD_STREAK_THRESHOLD tick liên tiếp — QĐ #3), tránh báo
// động giả do trục trặc mạng nhất thời. OK reset chuỗi; đã cảnh báo thì không lặp
// (chống spam) tới khi hồi phục (một OK). Runtime chỉ lưu/đọc HealthState qua DO.
import type { ProbeVerdict } from "@vat/gdt-client";

export const BAD_STREAK_THRESHOLD = 3;

export interface HealthState {
  /** Số verdict xấu (≠ OK) liên tiếp tính tới hiện tại. */
  consecutiveBad: number;
  /** Đã phát cảnh báo cho đợt xấu hiện tại chưa (chống spam). */
  alerted: boolean;
  /** H-B.6 — verdict tick gần nhất, để EgressHealth-gate biết LOẠI lỗi. */
  lastVerdict?: ProbeVerdict;
}

export const HEALTHY: HealthState = { consecutiveBad: 0, alerted: false };

export interface HealthAlert {
  verdict: ProbeVerdict;
  consecutiveBad: number;
}

export interface HealthStep {
  state: HealthState;
  /** Bản ghi cảnh báo nếu tick này vượt ngưỡng lần đầu; ngược lại null. */
  alert: HealthAlert | null;
}

/**
 * Cập nhật trạng thái sức khỏe theo verdict mới; trả state kế tiếp + alert (nếu có).
 * OK → về HEALTHY. Verdict xấu → tăng chuỗi; đạt ngưỡng lần đầu → phát một cảnh báo.
 */
export function nextHealth(prev: HealthState, verdict: ProbeVerdict): HealthStep {
  if (verdict === "OK") {
    return { state: HEALTHY, alert: null };
  }
  const consecutiveBad = prev.consecutiveBad + 1;
  const shouldAlert = consecutiveBad >= BAD_STREAK_THRESHOLD && !prev.alerted;
  return {
    state: { consecutiveBad, alerted: prev.alerted || shouldAlert, lastVerdict: verdict },
    alert: shouldAlert ? { verdict, consecutiveBad } : null,
  };
}

/** H-B.6 — egress đang bị CHẶN theo verdict gần nhất: GEO_BLOCKED (403/451 địa lý) hoặc
 * WAF_BLOCKED (U43, 2026-09-24: 403 + chữ ký WAF — chặn theo header). Cả hai đều = "gọi
 * thêm chỉ nhồi DLQ". RATE_LIMITED do backpressure H-B.4 xử; TIMEOUT/ERROR không gate. */
export function isEgressBlocked(state: HealthState): boolean {
  return state.lastVerdict === "GEO_BLOCKED" || state.lastVerdict === "WAF_BLOCKED";
}

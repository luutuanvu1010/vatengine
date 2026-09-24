// U43 — Máy trạng thái canary lối vào GDT (THUẦN, không I/O, test offline).
// Khác probe egress (health.ts: mọi verdict xấu đều cần 3 tick): WAF_BLOCKED và DRIFT là tín
// hiệu XÁC ĐỊNH (thân phản hồi/mã HTTP nói rõ) → báo ngay lần đầu; TIMEOUT/ERROR là nhiễu
// mạng → giữ ngưỡng 3. Đã báo thì im tới khi hồi phục (một OK) → báo "đã thông lại".
// Lần chạy đầu tiên (chưa có trạng thái trong DO) + OK → tin "đã bật" một lần: kiểm CÁI
// CHUÔNG ngay khi deploy, không đợi sự cố thật để biết Telegram có nối hay không.
import type { CanaryResult, CanaryVerdict } from "@vat/gdt-client";

export const CANARY_BAD_STREAK_THRESHOLD = 3;

export interface CanaryState {
  lastVerdict?: CanaryVerdict;
  /** Số verdict ≠ OK liên tiếp. */
  consecutiveBad: number;
  /** Đã phát cảnh báo cho đợt xấu hiện tại chưa (chống spam). */
  alerted: boolean;
  /** ISO thời điểm bắt đầu đợt xấu hiện tại. */
  since?: string;
}

export const HEALTHY_CANARY: CanaryState = { consecutiveBad: 0, alerted: false };

export type CanaryAlertKind = "bat_giam_sat" | "chan" | "drift" | "loi_lien_tiep" | "hoi_phuc";

export interface CanaryAlert {
  kind: CanaryAlertKind;
  result: CanaryResult;
  consecutiveBad: number;
}

export interface CanaryStep {
  state: CanaryState;
  alert: CanaryAlert | null;
}

const XAC_DINH: ReadonlySet<CanaryVerdict> = new Set(["WAF_BLOCKED", "DRIFT"]);

export function nextCanaryHealth(
  prev: CanaryState | undefined,
  result: CanaryResult,
  nowIso: string,
): CanaryStep {
  const verdict = result.verdict;
  const khoe: CanaryState = { lastVerdict: "OK", consecutiveBad: 0, alerted: false };

  if (verdict === "OK") {
    if (prev === undefined)
      return { state: khoe, alert: { kind: "bat_giam_sat", result, consecutiveBad: 0 } };
    if (prev.alerted)
      return { state: khoe, alert: { kind: "hoi_phuc", result, consecutiveBad: 0 } };
    return { state: khoe, alert: null };
  }

  const truoc = prev ?? HEALTHY_CANARY;
  const consecutiveBad = truoc.consecutiveBad + 1;
  const since = truoc.since ?? nowIso;
  let kind: CanaryAlertKind | null = null;
  if (!truoc.alerted) {
    if (XAC_DINH.has(verdict)) kind = verdict === "WAF_BLOCKED" ? "chan" : "drift";
    else if (consecutiveBad >= CANARY_BAD_STREAK_THRESHOLD) kind = "loi_lien_tiep";
  }
  return {
    state: { lastVerdict: verdict, consecutiveBad, alerted: truoc.alerted || kind !== null, since },
    alert: kind ? { kind, result, consecutiveBad } : null,
  };
}

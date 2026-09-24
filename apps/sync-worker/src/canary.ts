// U43 — Điều phối canary lối vào GDT (cron mỗi giờ). Cùng khuôn egressProbe.ts: mọi I/O
// tiêm qua deps (transport, DO load/save, sink cảnh báo) để test offline; KHÔNG được ném
// làm chết cron — lỗi bất ngờ ở đâu cũng quy về verdict ERROR / log, tick sau vẫn chạy.
import {
  type CanaryResult,
  type CanaryVerdict,
  type GdtTransport,
  canaryAuthenticate,
} from "@vat/gdt-client";
import { type CanaryAlert, type CanaryState, nextCanaryHealth } from "./canaryHealth";

export interface CanaryDeps {
  transport: GdtTransport;
  loadCanary(): Promise<CanaryState | undefined>;
  saveCanary(state: CanaryState): Promise<void>;
  emitCanaryAlert(alert: CanaryAlert): Promise<void> | void;
  /** Tiêm đồng hồ để test xác định; mặc định Date thật. */
  now?: () => Date;
}

export interface CanaryOutcome {
  verdict: CanaryVerdict;
  alerted: boolean;
}

export async function runCanary(deps: CanaryDeps): Promise<CanaryOutcome> {
  let result: CanaryResult;
  try {
    result = await canaryAuthenticate(deps.transport);
  } catch (err) {
    // canaryAuthenticate đã tự phân loại mọi lỗi; try/catch này là phòng thủ cuối.
    result = {
      verdict: "ERROR",
      message: err instanceof Error ? err.message : String(err),
      latencyMs: 0,
    };
  }

  const prev = await deps.loadCanary();
  const step = nextCanaryHealth(prev, result, (deps.now?.() ?? new Date()).toISOString());
  // LƯU TRƯỚC, báo sau: sink cảnh báo hỏng không được làm mất trạng thái (nếu không, tick
  // sau lại tưởng "lần đầu" và báo lặp).
  await deps.saveCanary(step.state);
  if (step.alert) {
    try {
      await deps.emitCanaryAlert(step.alert);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "ERROR",
          event: "canary_alert_sink_failed",
          kind: step.alert.kind,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
  return { verdict: result.verdict, alerted: step.alert !== null };
}

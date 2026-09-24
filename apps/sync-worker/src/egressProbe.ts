// GIÁM SÁT (mục C) — Điều phối probe egress (ADR-0001 §5B, gdt-adapter.md).
// Mỗi tick cron: probe đường ra T0 qua GdtTransport (KHÔNG fetch() trực tiếp GDT) →
// phân loại verdict → phát cảnh báo khi verdict xấu ổn định → CUỐI CÙNG mới cập nhật
// health-state (DO). Thứ tự "báo trước, lưu sau" là CỐ Ý (review U43): sink trả
// boolean, chưa giao được thì không ghi `alerted` để tick sau báo lại.
// Mọi I/O tiêm vào (transport, load/save state, sink cảnh báo) để test offline.
//
// Cảnh báo là sự kiện TOÀN HỆ THỐNG (không theo tenant) nên KHÔNG ghi audit_log
// (tenant-scoped, tenant_id NOT NULL). Sink production = Workers observability
// (structured log CRITICAL) — xem wiring ở index.ts/deps. KHÔNG bật T1 (đang TREO):
// probe chỉ PHÁT HIỆN + cảnh báo.
import type { GdtTransport, ProbeResult, ProbeVerdict } from "@vat/gdt-client";
import { type HealthAlert, type HealthState, nextHealth } from "./health";

export interface EgressProbeDeps {
  transport: GdtTransport;
  loadHealth(): Promise<HealthState>;
  saveHealth(state: HealthState): Promise<void>;
  /**
   * Phát cảnh báo. Trả `true` KHI VÀ CHỈ KHI tin đã tới nơi (Telegram nhận). Thiếu cấu
   * hình cũng là "chưa giao" (review U43, mục A — cùng khuôn với canary).
   */
  emitAlert(alert: HealthAlert, result: ProbeResult): Promise<boolean>;
}

export interface EgressProbeOutcome {
  verdict: ProbeVerdict;
  alerted: boolean;
}

export async function runEgressProbe(deps: EgressProbeDeps): Promise<EgressProbeOutcome> {
  // probe() theo hợp đồng tự phân loại lỗi thành ERROR/TIMEOUT; bọc thêm try/catch
  // phòng thủ để một lỗi bất ngờ KHÔNG làm chết cron (tick sau vẫn chạy).
  let result: ProbeResult;
  try {
    result = await deps.transport.probe();
  } catch {
    result = { transport: deps.transport.name, verdict: "ERROR", latencyMs: 0 };
  }

  const prev = await deps.loadHealth();
  const step = nextHealth(prev, result.verdict);
  // BÁO TRƯỚC, LƯU SAU (cùng khuôn runCanary): cảnh báo không giao được thì KHÔNG ghi
  // `alerted: true`, nếu không một lần POST Telegram hỏng là im tới tận khi hồi phục.
  // `lastVerdict` VẪN được lưu ở cả hai đường — gate enqueue (isEgressBlocked) đọc nó.
  let daGiao = true;
  if (step.alert) {
    try {
      daGiao = (await deps.emitAlert(step.alert, result)) === true;
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "ERROR",
          event: "egress_alert_sink_failed",
          verdict: step.alert.verdict,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      daGiao = false;
    }
  }
  await deps.saveHealth(daGiao ? step.state : { ...step.state, alerted: false });
  return { verdict: result.verdict, alerted: step.alert !== null };
}

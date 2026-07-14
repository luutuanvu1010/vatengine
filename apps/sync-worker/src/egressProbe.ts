// GIÁM SÁT (mục C) — Điều phối probe egress (ADR-0001 §5B, gdt-adapter.md).
// Mỗi tick cron: probe đường ra T0 qua GdtTransport (KHÔNG fetch() trực tiếp GDT) →
// phân loại verdict → cập nhật health-state (DO) → phát cảnh báo khi verdict xấu ổn
// định. Mọi I/O tiêm vào (transport, load/save state, sink cảnh báo) để test offline.
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
  emitAlert(alert: HealthAlert, result: ProbeResult): Promise<void> | void;
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
  await deps.saveHealth(step.state);
  if (step.alert) {
    await deps.emitAlert(step.alert, result);
  }
  return { verdict: result.verdict, alerted: step.alert !== null };
}

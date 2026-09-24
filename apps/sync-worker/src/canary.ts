// U43 — Điều phối canary lối vào GDT (cron mỗi giờ). Cùng khuôn egressProbe.ts: mọi I/O
// tiêm qua deps (transport, DO load/save, sink cảnh báo) để test offline; KHÔNG được ném
// làm chết cron — lỗi bất ngờ ở đâu cũng quy về verdict ERROR / log, tick sau vẫn chạy.
import {
  type CanaryResult,
  type CanaryVerdict,
  type GdtTransport,
  canaryAuthenticate,
} from "@vat/gdt-client";
import {
  type CanaryAlert,
  type CanaryState,
  nextCanaryHealth,
  trangThaiKhiGiaoHong,
} from "./canaryHealth";

export interface CanaryDeps {
  transport: GdtTransport;
  loadCanary(): Promise<CanaryState | undefined>;
  saveCanary(state: CanaryState): Promise<void>;
  /**
   * Phát cảnh báo. Trả `true` KHI VÀ CHỈ KHI tin đã tới nơi (Telegram nhận). Thiếu cấu
   * hình cũng là "chưa giao" — chính ca đó làm mất tin lúc deploy (review U43, mục A).
   */
  emitCanaryAlert(alert: CanaryAlert): Promise<boolean>;
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

  // NHỊP TIM mỗi tick, TRƯỚC mọi I/O khác: "im lặng không phải thành công" — `wrangler
  // tail` phải thấy canary chạy kể cả khi không có cảnh báo nào và cả khi DO hỏng.
  console.log(
    JSON.stringify({
      level: "INFO",
      event: "gdt_canary_tick",
      verdict: result.verdict,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
    }),
  );

  const prev = await deps.loadCanary();
  const step = nextCanaryHealth(prev, result, (deps.now?.() ?? new Date()).toISOString());
  // BÁO TRƯỚC, LƯU SAU (đảo so với bản đầu U43): `guiCanhBaoTelegram` KHÔNG BAO GIỜ ném
  // (thiếu cấu hình / Telegram 4xx / mạng hỏng đều trả giá trị), nên lưu `alerted: true`
  // trước khi biết tin có tới hay không là cách chắc chắn để NUỐT cảnh báo cho tới tận lúc
  // hồi phục. Giao hỏng ⇒ lưu trạng thái đã hạ dấu "đã báo" để tick sau báo lại.
  const daGiao = step.alert === null || (await giaoCanhBao(deps, step.alert));
  await deps.saveCanary(daGiao ? step.state : trangThaiKhiGiaoHong(step, prev));
  return { verdict: result.verdict, alerted: step.alert !== null };
}

/** Gọi sink; `true` = tin đã tới nơi. Sink ném (không đúng hợp đồng) ⇒ coi như chưa giao,
 * KHÔNG để lỗi thoát ra làm chết cron. */
async function giaoCanhBao(deps: CanaryDeps, alert: CanaryAlert): Promise<boolean> {
  try {
    return (await deps.emitCanaryAlert(alert)) === true;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "ERROR",
        event: "canary_alert_sink_failed",
        kind: alert.kind,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    return false;
  }
}

// Worker đồng bộ nền (U9) — điểm vào Cloudflare. WIRING thuần (loại khỏi ngưỡng phủ):
//  - scheduled(): Cron → liệt kê account đến hạn → CHIA lô (≤100/≤256KB) + jitter
//    delaySeconds theo tenant → enqueue một message/(account×chiều) (H-B.4);
//  - queue(): consumer → runScheduledSync mỗi message → `consumerAction` ánh xạ outcome
//    → hành động: `reenqueue` (backpressure rate_limited/breaker_open: gửi msg mới có
//    delay + ack, KHÔNG tính max_retries) · `retry` (lỗi thật: message.retry(), trần
//    max_retries → dead-letter) · `ack` (xong / cần đăng nhập lại) — H-B.4;
//  - export TenantLimiter: Durable Object rate-limit/circuit-breaker theo tenant/MST.
// Logic (schedule/runJob/fanout/rateLimiter/recorder) đã test offline; wiring kiểm khi deploy.
import { isDetailMessage } from "@vat/sync";
import { getDbFromHyperdrive } from "./db";
import { listActiveTenantIds, makeDetailJobDeps, makeEgressProbeDeps, makeJobDeps } from "./deps";
import { EgressHealth } from "./egressHealth";
import { runEgressProbe } from "./egressProbe";
import {
  QUEUE_MAX_BATCH_BYTES,
  QUEUE_MAX_BATCH_COUNT,
  chunkForQueue,
  consumerAction,
  jitterDelaySeconds,
  resolveFanoutConfig,
} from "./fanout";
import { detailConsumerAction, runDetailJob } from "./runDetailJob";
import { runScheduledSync } from "./runJob";
import { buildMessages, currentPeriodWindow, enumerateDueAccounts } from "./schedule";
import { TenantLimiter } from "./tenantLimiter";
import type { Env, VatSyncQueueMessage } from "./types";

export { TenantLimiter, EgressHealth };

// GIÁM SÁT (mục C) — cron probe egress (mỗi 15'); TÁCH khỏi cron đồng bộ (0 3 * * *).
const EGRESS_PROBE_CRON = "*/15 * * * *";

export default {
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // GIÁM SÁT: tick probe egress — không đụng DB đồng bộ, chỉ probe T0 + health-state.
    if (event.cron === EGRESS_PROBE_CRON) {
      await runEgressProbe(makeEgressProbeDeps(env));
      return;
    }

    const { db, close } = await getDbFromHyperdrive(env);
    try {
      const nowMs = Date.now();
      // Đọc sổ đăng ký (control-plane) → per-tenant chọn account token còn hạn (RLS).
      const due = await enumerateDueAccounts(db, nowMs, () => listActiveTenantIds(db));
      const window = currentPeriodWindow(nowMs);
      const msgs = buildMessages(due, window, ["purchase", "sold"]);
      // H-B.4 — CHIA lô ≤100 msg/≤256KB (vượt → sendBatch lỗi) + JITTER delaySeconds
      // theo hash-tenant (giãn khởi động, không dồn dập máy chủ thuế — gdt-adapter.md).
      if (msgs.length > 0) {
        const { jitterSpreadSeconds } = resolveFanoutConfig(env);
        for (const chunk of chunkForQueue(msgs, QUEUE_MAX_BATCH_COUNT, QUEUE_MAX_BATCH_BYTES)) {
          await env.SYNC_QUEUE.sendBatch(
            chunk.map((body) => ({
              body,
              delaySeconds: jitterDelaySeconds(body.tenantId, jitterSpreadSeconds),
            })),
          );
        }
      }
    } finally {
      await close();
    }
  },

  async queue(
    batch: MessageBatch<VatSyncQueueMessage>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const { db, close } = await getDbFromHyperdrive(env);
    const { backpressureDelaySeconds, maxBackpressure } = resolveFanoutConfig(env);
    try {
      for (const message of batch.messages) {
        const body = message.body;
        // H-B.4 — TÁCH backpressure (rate_limited/breaker_open) khỏi lỗi thật:
        //  - reenqueue: gửi message MỚI có delay + ack bản cũ ⇒ KHÔNG tính max_retries
        //    (backpressure thoáng qua không được đẩy job vào dead-letter oan). Mang
        //    `bpAttempt` tăng dần; đạt trần → consumerAction trả `retry` (điểm dừng);
        //  - retry: message.retry() ⇒ tính max_retries → dead-letter khi vượt trần;
        //  - ack: xong / cần đăng nhập lại / bỏ qua có chủ đích (U26 ack_skip).
        const bpAttempt = body.bpAttempt ?? 0;
        const actionOpts = { backpressureDelaySeconds, bpAttempt, maxBackpressure };
        try {
          // U26 — CÙNG queue chở 2 loại message: `kind:"detail"` (pha 2, MỘT hóa đơn /
          // message, 1 permit / request) và header (không `kind` — tương thích lùi).
          const action = isDetailMessage(body)
            ? detailConsumerAction(
                await runDetailJob(makeDetailJobDeps(env, db, body), body),
                actionOpts,
              )
            : consumerAction(await runScheduledSync(makeJobDeps(env, db, body), body), actionOpts);
          if (action.type === "reenqueue") {
            await env.SYNC_QUEUE.send(
              { ...body, bpAttempt: action.bpAttempt },
              { delaySeconds: action.delaySeconds },
            );
            message.ack();
          } else if (action.type === "retry") {
            message.retry();
          } else {
            message.ack();
          }
        } catch (err) {
          // An toàn cuối: lỗi ngoài dự kiến → retry (trần max_retries làm chốt chặn).
          // security.md "che trước khi ghi": KHÔNG log message thô (có thể mang dữ
          // liệu nhạy cảm) — chỉ định danh job (không nhạy cảm) + LOẠI lỗi để định vị.
          const nhan = isDetailMessage(body)
            ? `hoadon=${body.hoaDonId}`
            : `kỳ=${body.period} chiều=${body.direction}`;
          console.warn(
            `Job đồng bộ nền lỗi bất ngờ (tenant=${body.tenantId} ${nhan}): ${err instanceof Error ? err.name : "unknown"}`,
          );
          message.retry();
        }
      }
    } finally {
      await close();
    }
  },
};

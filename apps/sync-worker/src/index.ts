// Worker đồng bộ nền (U9) — điểm vào Cloudflare. WIRING thuần (loại khỏi ngưỡng phủ):
//  - scheduled(): Cron → liệt kê account đến hạn → enqueue một message/(account×chiều);
//  - queue(): consumer → runScheduledSync mỗi message → outcome "retry" thì message.retry()
//    (queue thử lại, trần max_retries → dead-letter), còn lại thì ack;
//  - export TenantLimiter: Durable Object rate-limit/circuit-breaker theo tenant/MST.
// Logic (schedule/runJob/rateLimiter/recorder) đã test offline; wiring kiểm khi deploy.
import { getDbFromHyperdrive } from "./db";
import { listActiveTenantIds, makeEgressProbeDeps, makeJobDeps } from "./deps";
import { EgressHealth } from "./egressHealth";
import { runEgressProbe } from "./egressProbe";
import { runScheduledSync } from "./runJob";
import { buildMessages, currentPeriodWindow, enumerateDueAccounts } from "./schedule";
import { TenantLimiter } from "./tenantLimiter";
import type { Env, SyncJobMessage } from "./types";

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
      if (msgs.length > 0) {
        await env.SYNC_QUEUE.sendBatch(msgs.map((body) => ({ body })));
      }
    } finally {
      await close();
    }
  },

  async queue(
    batch: MessageBatch<SyncJobMessage>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const { db, close } = await getDbFromHyperdrive(env);
    try {
      for (const message of batch.messages) {
        const deps = makeJobDeps(env, db, message.body);
        try {
          const outcome = await runScheduledSync(deps, message.body);
          if (outcome.kind === "retry") {
            message.retry();
          } else {
            message.ack();
          }
        } catch (err) {
          // An toàn cuối: lỗi ngoài dự kiến → retry (trần max_retries làm chốt chặn).
          // security.md "che trước khi ghi": KHÔNG log message thô (có thể mang dữ
          // liệu nhạy cảm) — chỉ định danh job (không nhạy cảm) + LOẠI lỗi để định vị.
          const body = message.body;
          console.warn(
            `Job đồng bộ nền lỗi bất ngờ (tenant=${body.tenantId} kỳ=${body.period} chiều=${body.direction}): ${err instanceof Error ? err.name : "unknown"}`,
          );
          message.retry();
        }
      }
    } finally {
      await close();
    }
  },
};

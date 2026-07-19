// Worker đồng bộ nền (U9) — điểm vào Cloudflare. WIRING thuần (loại khỏi ngưỡng phủ):
//  - scheduled(): Cron → liệt kê account đến hạn → CHIA lô (≤100/≤256KB) + jitter
//    delaySeconds theo tenant → enqueue một message/(account×chiều) (H-B.4);
//  - queue(): MỘT Worker consume 2 queue (batch.queue phân biệt nguồn) —
//    "vat-sync-dlq" (H-B.6): dlqConsume ghi sổ dong_bo_that_bai + audit CRITICAL rồi
//    ack (lỗi ghi sổ → retry, trần max_retries:3 của consumer DLQ làm chốt, KHÔNG log
//    body); còn lại = "vat-sync": trước tiên GATE H-B.6 (b) — đọc egress health MỘT
//    LẦN đầu batch, GEO_BLOCKED → `blockedAction` hoãn TOÀN BỘ message thay vì chạy
//    job (không đập GDT): dưới trần → reenqueue có delay + ack (KHÔNG tính max_retries),
//    ĐẠT trần bpAttempt → retry thật (max_retries → dead-letter, điểm dừng khi chặn
//    kéo dài — spec §4); nếu không blocked, khối xử lý
//    H-B.4 (KHÔNG đổi): consumer → runScheduledSync mỗi message → `consumerAction`
//    ánh xạ outcome → hành động: `reenqueue` (backpressure rate_limited/breaker_open:
//    gửi msg mới có delay + ack, KHÔNG tính max_retries) · `retry` (lỗi thật:
//    message.retry(), trần max_retries → dead-letter) · `ack` (xong / cần đăng nhập lại);
//  - export TenantLimiter: Durable Object rate-limit/circuit-breaker theo tenant/MST.
// Logic (schedule/runJob/fanout/rateLimiter/recorder) đã test offline; wiring kiểm khi deploy.
import { isDetailMessage } from "@vat/sync";
import { getDbFromHyperdrive } from "./db";
import { listActiveTenantIds, makeDetailJobDeps, makeEgressProbeDeps, makeJobDeps } from "./deps";
import { dlqConsume } from "./dlqConsumer";
import { EgressHealth, egressHealthClient } from "./egressHealth";
import { runEgressProbe } from "./egressProbe";
import {
  QUEUE_MAX_BATCH_BYTES,
  QUEUE_MAX_BATCH_COUNT,
  blockedAction,
  chunkForQueue,
  consumerAction,
  jitterDelaySeconds,
  resolveFanoutConfig,
} from "./fanout";
import { isEgressBlocked } from "./health";
import { replayDeadLetters } from "./replay";
import { detailConsumerAction, runDetailJob } from "./runDetailJob";
import { runScheduledSync } from "./runJob";
import { buildMessages, currentPeriodWindow, enumerateDueAccounts } from "./schedule";
import { TenantLimiter } from "./tenantLimiter";
import type { Env, VatSyncQueueMessage } from "./types";

export { TenantLimiter, EgressHealth };

// GIÁM SÁT (mục C) — cron probe egress (mỗi 15'); TÁCH khỏi cron đồng bộ (0 3 * * *).
const EGRESS_PROBE_CRON = "*/15 * * * *";

export default {
  // H-B.6 (c) — endpoint phát lại THỦ CÔNG job DLQ. PHẢI đặt sau Cloudflare Access
  // (khu quản trị — security.md); code KHÔNG tự xác thực, chỉ ép `tenantId` tường
  // minh (không "replay tất tenant" ẩn — multi-tenant.md, "tenant_id phải nằm tường
  // minh trong payload, không suy đoán ngầm").
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/dlq/replay") {
      const { tenantId, ids } = (await req.json()) as { tenantId?: string; ids?: string[] };
      if (!tenantId) return Response.json({ error: "thiếu tenantId" }, { status: 400 });
      const { db, close } = await getDbFromHyperdrive(env);
      try {
        const res = await replayDeadLetters(db, env.SYNC_QUEUE, { tenantId, ids });
        return Response.json(res);
      } finally {
        await close();
      }
    }
    return new Response("not found", { status: 404 });
  },

  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // GIÁM SÁT: tick probe egress — không đụng DB đồng bộ, chỉ probe T0 + health-state.
    if (event.cron === EGRESS_PROBE_CRON) {
      await runEgressProbe(makeEgressProbeDeps(env));
      return;
    }

    // H-B.6 (b) — GATE: egress đang GEO_BLOCKED (403/451) thì KHÔNG enqueue lô nào
    // (chỉ nhồi DLQ vô ích). Sự kiện toàn cục → chỉ observability, không audit (cần tenant).
    const health = await egressHealthClient(env.EGRESS_HEALTH).loadHealth();
    if (isEgressBlocked(health)) {
      console.warn("[GATE] egress GEO_BLOCKED — skip cron enqueue");
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
    try {
      // H-B.6 — nhánh DLQ (batch.queue === "vat-sync-dlq"): ghi sổ + audit rồi ack;
      // KHÔNG chạm khối xử lý "vat-sync" (H-B.4) bên dưới.
      if (batch.queue === "vat-sync-dlq") {
        for (const message of batch.messages) {
          try {
            await dlqConsume(db, message.body);
            message.ack();
          } catch (err) {
            // Ghi sổ lỗi → retry (max_retries:3 của DLQ consumer làm chốt). KHÔNG log body.
            console.warn(`DLQ consumer lỗi ghi sổ: ${err instanceof Error ? err.name : "unknown"}`);
            message.retry();
          }
        }
        return;
      }
      // ---- H-B.4 — khối xử lý "vat-sync" hiện có, KHÔNG đổi logic ----
      const { backpressureDelaySeconds, maxBackpressure } = resolveFanoutConfig(env);
      // H-B.6 (b) — GATE: đọc health MỘT LẦN đầu batch (không mỗi message). GEO_BLOCKED
      // → hoãn TOÀN BỘ message trong batch (reenqueue-delay, mirror backpressure H-B.4)
      // thay vì chạy job (tránh đập GDT khi biết chắc đang bị chặn địa lý).
      const blocked = isEgressBlocked(await egressHealthClient(env.EGRESS_HEALTH).loadHealth());
      for (const message of batch.messages) {
        const body = message.body;
        if (blocked) {
          const action = blockedAction(body, { backpressureDelaySeconds, maxBackpressure });
          if (action.type === "reenqueue") {
            await env.SYNC_QUEUE.send(
              { ...body, bpAttempt: action.bpAttempt },
              { delaySeconds: action.delaySeconds },
            );
            message.ack();
          } else {
            message.retry(); // đạt trần → tính max_retries → dead-letter
          }
          continue;
        }
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

// Wiring production: dựng RunJobDeps thật (db qua Hyperdrive bound vào sync/recorder,
// transport egress T0, limiter theo tenant) + đọc sổ đăng ký tenant để lập lịch.
// KHÔNG test-cover (test tiêm fake/PGlite trực tiếp vào runJob/enumerate).
import { tenants, withTenant } from "@vat/db";
import { createDirectCfTransport } from "@vat/gdt-client";
import { adapterFetchDetail, persistInvoiceLines, sync } from "@vat/sync";
import { eq } from "drizzle-orm";
import { egressHealthClient } from "./egressHealth";
import type { EgressProbeDeps } from "./egressProbe";
import { QUEUE_MAX_BATCH_BYTES, QUEUE_MAX_BATCH_COUNT, chunkForQueue } from "./fanout";
import { dbRecorder, loadAccountToken } from "./recorder";
import type { RunDetailJobDeps } from "./runDetailJob";
import { resolveSyncRetryConfig } from "./syncRetryConfig";
import { tenantLimiterClient } from "./tenantLimiter";
import type { AnyDb, DetailSyncMessage, Env, RunJobDeps, SyncJobMessage } from "./types";

// Egress T0 (direct-cf) — điểm gọi GDT DUY NHẤT đi qua adapter (gdt-adapter.md).
const transport = createDirectCfTransport();

/** GIÁM SÁT (mục C) — dựng deps cho probe egress. Sink cảnh báo = Workers
 * observability (structured log CRITICAL): sự kiện TOÀN HỆ THỐNG, không tenant →
 * KHÔNG audit_log (tenant-scoped). Chỉ metadata vận hành, KHÔNG token/secret
 * (security.md — probe gọi endpoint công khai, không đăng nhập). */
export function makeEgressProbeDeps(env: Env): EgressProbeDeps {
  return {
    transport,
    ...egressHealthClient(env.EGRESS_HEALTH),
    emitAlert(alert, result) {
      console.error(
        JSON.stringify({
          level: "CRITICAL",
          event: "egress_probe_alert",
          transport: result.transport,
          verdict: alert.verdict,
          consecutiveBad: alert.consecutiveBad,
          httpStatus: result.httpStatus,
          egressCountry: result.egressCountry,
          latencyMs: result.latencyMs,
        }),
      );
    },
  };
}

/**
 * CONTROL-PLANE: đọc sổ đăng ký tenant để Cron lập lịch.
 *
 * ⚠️ VẬN HÀNH: bảng `tenants` có RLS keyed theo `id` → dưới role app tenant-scoped
 * (không đặt `app.tenant_id`) sẽ FAIL-CLOSED (0 hàng). Kết nối của sync-worker phải
 * được cấp quyền đọc sổ đăng ký (vai control-plane), TÁCH bạch với đường dữ liệu
 * per-tenant — vốn vẫn tenant-scoped qua `withTenant` ở enumerate/runJob/recorder.
 * Đây là hạng mục hạ tầng khi deploy (như HYPERDRIVE id), xem handoff U9.
 */
export async function listActiveTenantIds(db: AnyDb): Promise<string[]> {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.trangThai, "active"));
  return rows.map((r) => r.id);
}

/** Dựng deps cho MỘT message: limiter bound theo tenant/MST (giỏ token + breaker
 * riêng, "không gọi dồn dập"); db bound vào sync()/loadAccount/recorder. */
export function makeJobDeps(env: Env, db: AnyDb, msg: SyncJobMessage): RunJobDeps {
  return {
    now: () => Date.now(),
    loadAccount: (m) => loadAccountToken(db, m, env.TOKEN_KEK),
    limiter: tenantLimiterClient(env.TENANT_LIMITER, msg.tenantId),
    // U26 — job header CHỈ đồng bộ header (KHÔNG tiêm fetchDetail nữa): fetch detail
    // inline tuần tự cho ~2000 HĐ trong MỘT lần gọi Worker là nguyên nhân 170/188 lần
    // sync FAILED trên prod (GDT 429 + "Too many subrequests" — BACKLOG 2026-07-16).
    // Dòng hàng đi pha 2: sync() trả detailCandidates → enqueueDetail bên dưới.
    sync: (o) => sync({ db, ...o }),
    transport,
    recorder: dbRecorder(db),
    // Pha 2: 1 message / hóa đơn vào CÙNG queue vat-sync, chia lô ≤100 msg/≤256KB.
    // KHÔNG jitter delay: message detail đã tự điều tốc bằng permit-per-request +
    // backpressure ở consumer (runDetailJob).
    enqueueDetail: async (msgs) => {
      for (const chunk of chunkForQueue(msgs, QUEUE_MAX_BATCH_COUNT, QUEUE_MAX_BATCH_BYTES)) {
        await env.SYNC_QUEUE.sendBatch(chunk.map((body) => ({ body })));
      }
    },
    // SỰ CỐ 2026-07-18: trước đây KHÔNG truyền `retry` → phân trang header bắn GDT
    // không nghỉ (drift so với U25 AC3 "mặc định > 0") → 429 kéo dài giết run ở nhánh
    // sco. Giãn nhịp + backoff 429 lấy từ vars (syncRetryConfig.ts).
    syncParams: { includeSco: true, retry: resolveSyncRetryConfig(env) },
  };
}

/** U26 (pha 2) — deps cho MỘT message chi tiết: limiter bound theo tenant (1 permit /
 * request GDT), fetch qua adapter (cô lập gdt-client), persist idempotent trong
 * withTenant. `maxAttempts: 2` — adapter chỉ thử lại 1 lần cho blip 5xx/timeout;
 * QUEUE là tầng retry chính (max_retries → DLQ), tránh khuếch đại retry 2 tầng. */
export function makeDetailJobDeps(env: Env, db: AnyDb, msg: DetailSyncMessage): RunDetailJobDeps {
  return {
    now: () => Date.now(),
    loadAccount: (m) => loadAccountToken(db, m, env.TOKEN_KEK),
    limiter: tenantLimiterClient(env.TENANT_LIMITER, msg.tenantId),
    fetchLines: (token, ref) => adapterFetchDetail(transport, token, { maxAttempts: 2 })(ref),
    persistLines: (tenantId, hoaDonId, lines) =>
      withTenant(db, tenantId, (tx) => persistInvoiceLines(tx, tenantId, hoaDonId, lines)),
    markTokenDead: (m, reason) =>
      dbRecorder(db).reauthRuntime({ tenantId: m.tenantId, taikhoanId: m.taikhoanId }, reason),
  };
}

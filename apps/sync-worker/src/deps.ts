// Wiring production: dựng RunJobDeps thật (db qua Hyperdrive bound vào sync/recorder,
// transport egress T0, limiter theo tenant) + đọc sổ đăng ký tenant để lập lịch.
// KHÔNG test-cover (test tiêm fake/PGlite trực tiếp vào runJob/enumerate).
import { tenants } from "@vat/db";
import { createDirectCfTransport } from "@vat/gdt-client";
import { sync } from "@vat/sync";
import { eq } from "drizzle-orm";
import { dbRecorder, loadAccountToken } from "./recorder";
import { tenantLimiterClient } from "./tenantLimiter";
import type { AnyDb, Env, RunJobDeps, SyncJobMessage } from "./types";

// Egress T0 (direct-cf) — điểm gọi GDT DUY NHẤT đi qua adapter (gdt-adapter.md).
const transport = createDirectCfTransport();

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
    loadAccount: (m) => loadAccountToken(db, m),
    limiter: tenantLimiterClient(env.TENANT_LIMITER, msg.tenantId),
    sync: (o) => sync({ db, ...o }),
    transport,
    recorder: dbRecorder(db),
    syncParams: { includeSco: true },
  };
}

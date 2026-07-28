// Wiring production: dựng RunJobDeps thật (db qua Hyperdrive bound vào sync/recorder,
// transport egress T0, limiter theo tenant) + đọc sổ đăng ký tenant để lập lịch.
// KHÔNG test-cover (test tiêm fake/PGlite trực tiếp vào runJob/enumerate).
import { tenants, withTenant } from "@vat/db";
import { createDirectCfTransport, getInvoiceOriginalZip, queryInvoiceTotal } from "@vat/gdt-client";
import {
  KHOA_TAI_NGUYEN_CHUNG,
  adapterFetchDetail,
  chotDeltaRun,
  coDeltaRunDangChay,
  daCoHoSoGoc,
  demHoaDonTheoNguon,
  ghiAuditDu,
  ghiNhanKhongCoHoSoGoc,
  khoaHoSoGoc,
  luuTepHoaDonGoc,
  moDeltaRun,
  persistInvoiceLines,
  sync,
  syncChunk,
} from "@vat/sync";
import type { AuditSyncMessage, DeltaPullMessage, HoSoGocMessage } from "@vat/sync";
import { eq } from "drizzle-orm";
import { egressHealthClient } from "./egressHealth";
import type { EgressProbeDeps } from "./egressProbe";
import {
  QUEUE_MAX_BATCH_BYTES,
  QUEUE_MAX_BATCH_COUNT,
  chunkForQueue,
  resolveDeltaChunkPages,
} from "./fanout";
import { dbRecorder, loadAccountToken } from "./recorder";
import type { DeltaJobDeps } from "./runDeltaJob";
import type { RunDetailJobDeps } from "./runDetailJob";
import type { RunHoSoGocJobDeps } from "./runHoSoGocJob";
import { resolveSyncRetryConfig } from "./syncRetryConfig";
import { tenantLimiterClient } from "./tenantLimiter";
import { throttledTransport } from "./throttledTransport";
import type {
  AnyDb,
  DetailSyncMessage,
  Env,
  RunJobDeps,
  SyncJobMessage,
  VatSyncQueueMessage,
} from "./types";

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
  const limiter = tenantLimiterClient(env.TENANT_LIMITER, msg.tenantId);
  return {
    now: () => Date.now(),
    loadAccount: (m) => loadAccountToken(db, m, env.TOKEN_KEK),
    limiter,
    // U26 — job header CHỈ đồng bộ header (KHÔNG tiêm fetchDetail nữa): fetch detail
    // inline tuần tự cho ~2000 HĐ trong MỘT lần gọi Worker là nguyên nhân 170/188 lần
    // sync FAILED trên prod (GDT 429 + "Too many subrequests" — BACKLOG 2026-07-16).
    // Dòng hàng đi pha 2: sync() trả detailCandidates → enqueueDetail bên dưới.
    sync: (o) => sync({ db, ...o }),
    // U28 — permit-per-request pha 1: MỌI fetch ra GDT của job header xin permit từ
    // CÙNG limiter (trước đây 1 permit/cả job → 42 request/permit → 429 hàng loạt
    // 2026-07-18). Kế toán: runJob vẫn giữ tryAcquire đầu job (fail-fast + audit
    // breakerSkip) nên một job tiêu 1+N permit — lệch 1, thiên về thận trọng.
    transport: throttledTransport(transport, limiter),
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

/**
 * Task 6 (delta-sync) — deps cho MỘT message audit hoặc delta. Cùng khuôn `makeJobDeps`:
 * limiter bound theo tenant, transport bọc `throttledTransport` (1 permit / request GDT
 * — U28), db bound vào mọi hàm chạm DB, retry/giãn nhịp lấy từ vars (U25 AC3).
 *
 * Khác `makeJobDeps` ở chỗ job KHÔNG kéo cả kỳ trong một lần gọi: mỗi lô tối đa
 * `DELTA_CHUNK_PAGES` trang rồi tự enqueue message nối tiếp vào CÙNG queue `vat-sync`
 * (chia lô ≤100 msg/≤256KB, KHÔNG jitter — nhịp đã do permit + backpressure giữ).
 */
export function makeDeltaJobDeps(
  env: Env,
  db: AnyDb,
  msg: AuditSyncMessage | DeltaPullMessage,
): DeltaJobDeps {
  const limiter = tenantLimiterClient(env.TENANT_LIMITER, msg.tenantId);
  const throttled = throttledTransport(transport, limiter);
  const retry = resolveSyncRetryConfig(env);
  const enqueue = async (msgs: VatSyncQueueMessage[]) => {
    for (const chunk of chunkForQueue(msgs, QUEUE_MAX_BATCH_COUNT, QUEUE_MAX_BATCH_BYTES)) {
      await env.SYNC_QUEUE.sendBatch(chunk.map((body) => ({ body })));
    }
  };
  return {
    now: () => Date.now(),
    loadAccount: (m) => loadAccountToken(db, m, env.TOKEN_KEK),
    limiter,
    recorder: dbRecorder(db),
    layTotal: (token, direction, family, dateFrom, dateTo) =>
      queryInvoiceTotal(throttled, token, { direction, family, dateFrom, dateTo }, retry),
    demTheoNguon: (tenantId, direction, period) =>
      withTenant(db, tenantId, (tx) => demHoaDonTheoNguon(tx, tenantId, direction, period)),
    coChuoiKeoDangChay: (m) =>
      coDeltaRunDangChay(db, m.tenantId, {
        taikhoanId: m.taikhoanId,
        direction: m.direction,
        dateFrom: m.dateFrom,
        dateTo: m.dateTo,
      }),
    moRun: (m) =>
      moDeltaRun(db, m.tenantId, {
        taikhoanId: m.taikhoanId,
        direction: m.direction,
        dateFrom: m.dateFrom,
        dateTo: m.dateTo,
      }),
    ghiDu: (m) =>
      ghiAuditDu(db, m.tenantId, {
        taikhoanId: m.taikhoanId,
        direction: m.direction,
        dateFrom: m.dateFrom,
        dateTo: m.dateTo,
      }),
    chotRun: (tenantId, lanDongBoId, kq) => chotDeltaRun(db, tenantId, lanDongBoId, kq),
    keoChunk: (m, token) =>
      syncChunk({
        db,
        transport: throttled,
        token,
        tenantId: m.tenantId,
        taikhoanId: m.taikhoanId,
        direction: m.direction,
        family: m.family,
        dateFrom: m.dateFrom,
        dateTo: m.dateTo,
        lanDongBoId: m.lanDongBoId,
        ...(m.state ? { state: m.state } : {}),
        maxPages: resolveDeltaChunkPages(env),
        retry,
      }),
    enqueue,
    enqueueDetail: (msgs: DetailSyncMessage[]) => enqueue(msgs),
    chunkPages: resolveDeltaChunkPages(env),
  };
}

/**
 * U37a (lát 3) — deps cho MỘT message tải hồ sơ gốc. Cùng kỷ luật `makeDetailJobDeps`:
 * limiter bound theo tenant, 1 permit / request GDT, mọi hàm chạm DB bọc `withTenant`.
 *
 * Ghi R2 TRƯỚC rồi mới upsert DB: nếu ngược lại và R2 hỏng giữa chừng, sổ sẽ khẳng định
 * "đã có" trong khi tệp không tồn tại — `daCo` chặn từ đầu nên hóa đơn đó KHÔNG BAO GIỜ
 * được tải lại, và lỗi chỉ lộ ra lúc người dùng tải gói về. Theo thứ tự này, ca xấu nhất
 * là R2 có tệp mà DB chưa ghi ⇒ lần chạy sau tải lại và ghi đè cùng khóa (idempotent),
 * chỉ tốn một request, không mất dữ liệu.
 *
 * Ba tệp tĩnh dùng chung ghi cùng lúc, LUÔN cùng khóa cố định `hoadon-goc/_chung/…` —
 * ghi đè bằng chính nội dung giống hệt là vô hại và tự lành nếu bộ cũ bị mất.
 */
export function makeHoSoGocJobDeps(env: Env, db: AnyDb, msg: HoSoGocMessage): RunHoSoGocJobDeps {
  const limiter = tenantLimiterClient(env.TENANT_LIMITER, msg.tenantId);
  return {
    now: () => Date.now(),
    loadAccount: (m) => loadAccountToken(db, m, env.TOKEN_KEK),
    limiter,
    daCo: (tenantId, hoaDonId) =>
      withTenant(db, tenantId, (tx) => daCoHoSoGoc(tx, tenantId, hoaDonId)),
    taiHoSoGoc: (token, ref) => getInvoiceOriginalZip(transport, token, ref, { maxAttempts: 2 }),
    luuHoSoGoc: async (tenantId, hoaDonId, daTach) => {
      const khoa = khoaHoSoGoc(tenantId, hoaDonId);
      await env.RAW.put(khoa.xml, daTach.xml);
      await env.RAW.put(khoa.html, daTach.html);
      for (const [ten, noiDung] of Object.entries(daTach.taiNguyenChung)) {
        const khoaChung = KHOA_TAI_NGUYEN_CHUNG[ten];
        if (khoaChung) await env.RAW.put(khoaChung, noiDung);
      }
      await withTenant(db, tenantId, (tx) =>
        luuTepHoaDonGoc(tx, tenantId, hoaDonId, {
          soByteXml: daTach.xml.length,
          soByteHtml: daTach.html.length,
        }),
      );
    },
    ghiNhanKhongCoHoSoGoc: (tenantId, hoaDonId, maLoi) =>
      withTenant(db, tenantId, (tx) => ghiNhanKhongCoHoSoGoc(tx, tenantId, hoaDonId, maLoi)),
    markTokenDead: (m, reason) =>
      dbRecorder(db).reauthRuntime({ tenantId: m.tenantId, taikhoanId: m.taikhoanId }, reason),
  };
}

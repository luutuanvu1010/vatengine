// Cấu hình retry/giãn nhịp cho job đồng bộ HEADER production (U25 AC3/AC7) — khuôn
// resolveFanoutConfig/resolveLimiterConfig: tinh chỉnh qua vars wrangler (KHÔNG nhạy
// cảm), bỏ trống/hỏng → mặc định an toàn.
//
// SỰ CỐ 2026-07-18 (bằng chứng `lan_dong_bo` production: 68 lần failed HTTP 429 trong
// 24h, kéo dài 05:29→09:10Z, ~90% rơi ở nhánh sco-query — nhánh đứng CUỐI chuỗi gọi
// của một run): U25 AC3 đã xây `minIntervalMs` ("mặc định > 0") nhưng wiring
// production (deps.ts) chỉ truyền `includeSco` → phân trang header bắn GDT liên tiếp
// KHÔNG NGHỈ, vi phạm "tôn trọng máy chủ thuế" (CLAUDE.md §Ranh giới) và tự nuôi
// cửa sổ phạt tốc độ của GDT. Đây là chỗ đóng drift đó.
import type { RetryOptions } from "@vat/gdt-client";
import { parseNonNegInt } from "./fanout";

export interface SyncRetryEnv {
  /** Nghỉ tối thiểu (ms) giữa hai request GDT liên tiếp trong MỘT job header
   * (phân trang + nhánh sco). "0" = tắt tường minh. */
  SYNC_PAGE_MIN_INTERVAL_MS?: string;
  /** Backoff cơ bản (ms) khi GDT 429/5xx mà không có Retry-After parse được
   * (nhân đôi mỗi lần thử, trần maxBackoffMs của adapter). */
  SYNC_RETRY_BACKOFF_MS?: string;
}

// 500ms ↔ 2 req/s — khớp nhịp LIMITER_REFILL_PER_SEC=2 đã chọn cho token bucket
// (wrangler.jsonc): một job không được vượt nhịp mà limiter coi là "tôn trọng".
// CHƯA KIỂM CHỨNG ngưỡng 429 thật của GDT — đây là trần an toàn phía client,
// không phải số đo từ GDT; tinh chỉnh qua vars khi có quan sát mới.
export const DEFAULT_SYNC_PAGE_MIN_INTERVAL_MS = 500;
// Mặc định adapter 300ms là quá sát cho 429 (GDT đang phạt mà 300ms sau đã đập
// lại). 3s → 6s (nhân đôi) cho tối đa 3 lượt thử của adapter; kiệt lượt → tầng
// job backpressure (reenqueue có delay), không retry nóng thêm.
export const DEFAULT_SYNC_RETRY_BACKOFF_MS = 3000;

/** Dựng `RetryOptions` cho sync() header từ env — CHỈ hai knob cần cho sự cố này;
 * các ngưỡng khác (timeout/maxAttempts/maxBackoffMs) giữ mặc định adapter. */
export function resolveSyncRetryConfig(env: SyncRetryEnv): RetryOptions {
  return {
    minIntervalMs: parseNonNegInt(env.SYNC_PAGE_MIN_INTERVAL_MS, DEFAULT_SYNC_PAGE_MIN_INTERVAL_MS),
    backoffMs: parseNonNegInt(env.SYNC_RETRY_BACKOFF_MS, DEFAULT_SYNC_RETRY_BACKOFF_MS),
  };
}

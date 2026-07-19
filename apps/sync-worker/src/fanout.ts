// H-B.4 — Fan-out job đồng bộ nền: chia lô gửi hàng đợi, giãn tải theo tenant, và
// ánh xạ outcome → hành động hàng đợi (tách backpressure khỏi lỗi thật). THUẦN LOGIC,
// không phụ thuộc runtime Cloudflare → test offline. Áp dụng ở wiring index.ts.
import type { JobOutcome } from "./types";

// Giới hạn một lần `Queue.sendBatch` (Cloudflare Queues): ≤100 message VÀ ≤256KB tổng.
// Vượt bất kỳ giới hạn nào → sendBatch lỗi. Chia trước khi gửi để cron enqueue nhiều
// tenant không vỡ.
export const QUEUE_MAX_BATCH_COUNT = 100;
export const QUEUE_MAX_BATCH_BYTES = 256 * 1024;

/**
 * Chia `items` thành các lô sao cho mỗi lô ≤ `maxCount` phần tử VÀ ≤ `maxBytes` (ước
 * lượng bằng độ dài JSON của lô). Greedy, giữ nguyên thứ tự, không mất phần tử. Một
 * phần tử đơn lớn hơn `maxBytes` vẫn được đặt riêng một lô (không rơi, không kẹt).
 */
export function chunkForQueue<T>(items: T[], maxCount: number, maxBytes: number): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  for (const item of items) {
    // Thử thêm vào lô hiện tại; nếu vượt trần (mà lô không rỗng) → chốt lô, mở lô mới.
    const tentative = cur.length === 0 ? [item] : [...cur, item];
    if (cur.length > 0 && (tentative.length > maxCount || byteLen(tentative) > maxBytes)) {
      chunks.push(cur);
      cur = [item];
    } else {
      cur = tentative;
    }
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

function byteLen(v: unknown): number {
  return JSON.stringify(v).length;
}

/**
 * Độ trễ (giây) TẤT ĐỊNH theo `tenantId` trong [0, `spreadSeconds`) — giãn thời điểm
 * bắt đầu đồng bộ giữa các tenant để KHÔNG dồn dập máy chủ thuế (gdt-adapter.md). Hash
 * FNV-1a 32-bit (ổn định, không cần crypto). `spreadSeconds ≤ 0` → 0 (tắt jitter).
 */
export function jitterDelaySeconds(tenantId: string, spreadSeconds: number): number {
  if (spreadSeconds <= 0) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < tenantId.length; i++) {
    h ^= tenantId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % Math.floor(spreadSeconds);
}

/** Hành động hàng đợi cho MỘT message sau khi xử lý (áp ở index.ts). */
export type QueueAction =
  | { type: "ack" }
  | { type: "retry" }
  | { type: "reenqueue"; delaySeconds: number; bpAttempt: number };

/**
 * Ánh xạ outcome → hành động hàng đợi (H-B.4):
 * - completed / needs_reauth → ack (xong hoặc chờ người đăng nhập lại, retry vô ích).
 * - retry_backpressure DƯỚI trần → reenqueue message MỚI có delay (KHÔNG tính
 *   max_retries), tăng `bpAttempt`.
 * - retry_backpressure ĐẠT trần (`bpAttempt ≥ maxBackpressure`) → retry THẬT: chặn
 *   vòng lặp vô hạn khi rate_limited/breaker kéo dài (không để mọi tenant lặp mãi,
 *   khuếch đại tải đúng lúc sự cố). Rơi vào max_retries → dead-letter: có điểm dừng +
 *   được giám sát. (Vòng khép kín DLQ/quota đầy đủ ở H-B.6.)
 * - retry → message.retry() (lỗi thật; tính max_retries → dead-letter khi vượt trần).
 */
export function consumerAction(
  outcome: JobOutcome,
  opts: { backpressureDelaySeconds: number; bpAttempt: number; maxBackpressure: number },
): QueueAction {
  switch (outcome.kind) {
    case "completed":
    case "needs_reauth":
      return { type: "ack" };
    case "retry_backpressure":
      if (opts.bpAttempt >= opts.maxBackpressure) return { type: "retry" };
      return {
        type: "reenqueue",
        delaySeconds: opts.backpressureDelaySeconds,
        bpAttempt: opts.bpAttempt + 1,
      };
    case "retry":
      return { type: "retry" };
  }
}

// Cấu hình fan-out tinh chỉnh qua env (vars wrangler; KHÔNG nhạy cảm) — giống mẫu
// resolveLimiterConfig. Bỏ trống/không hợp lệ → mặc định.
export interface FanoutEnv {
  FANOUT_JITTER_SPREAD_SEC?: string;
  FANOUT_BACKPRESSURE_DELAY_SEC?: string;
  FANOUT_MAX_BACKPRESSURE?: string;
}
// Cron đồng bộ chạy 1 lần/ngày: giãn khởi động các tenant trên ~5' để không dồn dập.
export const DEFAULT_JITTER_SPREAD_SEC = 300;
// Backpressure: SỰ CỐ 2026-07-18 — 60s là quá sát khi GDT phạt 429 theo cửa sổ NHIỀU
// GIỜ (mỗi lần thử lại chạy lại cả chuỗi phân trang → tự nuôi cửa sổ phạt). Fallback
// phải cùng giá trị an toàn với vars wrangler.jsonc (300s), để env nào quên set var
// không âm thầm rơi lại đúng giá trị từng gây sự cố.
export const DEFAULT_BACKPRESSURE_DELAY_SEC = 300;
// Trần reenqueue backpressure liên tiếp trước khi rơi về dead-letter (~10×60s ≈ 10').
// Tenant kẹt lâu hơn thế là bất thường → cần người/giám sát, không lặp mãi.
export const DEFAULT_MAX_BACKPRESSURE = 10;

export function resolveFanoutConfig(env: FanoutEnv): {
  jitterSpreadSeconds: number;
  backpressureDelaySeconds: number;
  maxBackpressure: number;
} {
  return {
    jitterSpreadSeconds: parseNonNegInt(env.FANOUT_JITTER_SPREAD_SEC, DEFAULT_JITTER_SPREAD_SEC),
    backpressureDelaySeconds: parseNonNegInt(
      env.FANOUT_BACKPRESSURE_DELAY_SEC,
      DEFAULT_BACKPRESSURE_DELAY_SEC,
    ),
    maxBackpressure: parseNonNegInt(env.FANOUT_MAX_BACKPRESSURE, DEFAULT_MAX_BACKPRESSURE),
  };
}

/** Parse int không âm từ var env; thiếu/hỏng → mặc định. Dùng chung cho các resolver
 * cấu hình (fanout, syncRetryConfig). */
export function parseNonNegInt(s: string | undefined, dflt: number): number {
  if (s === undefined) return dflt;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

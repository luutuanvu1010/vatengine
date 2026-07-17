// Sự cố Queue 429 (2026-07-17): burst enqueue backfill dòng hàng (U26) chạm trần
// 5.000 message/giây/queue của Cloudflare Queues → `sendBatch` ném "Too Many Requests"
// → app.onError → 500 → UI báo lỗi chung (hồi quy nút "Đồng bộ ngay"). Nguồn:
// https://developers.cloudflare.com/queues/platform/limits/
//
// Helper dùng chung cho MỌI route producer (sync/backfill/backfill-lines):
//  (1) `isQueueRateLimited` — nhận diện 429 để route trả 503 `sync_busy` (có kiểm soát),
//      KHÔNG để 500 trần trụi;
//  (2) `sendBatchesPaced` — gửi lô ≤100 có GIÃN NHỊP `paceMs` giữa các lô để burst
//      không tự chạm trần (vd 100 msg / 50ms = 2.000/giây < 5.000/giây).
// THUẦN LOGIC (không phụ thuộc runtime Cloudflare) → test offline, tất định.

/**
 * Nhận diện lỗi 429 từ Cloudflare Queues (`sendBatch`/`send` ném khi vượt 5.000
 * msg/giây/queue). Thông điệp thật quan sát được: "Queue sendBatch failed: Too Many
 * Requests". Bắt cả biến thể mang mã 429 ĐỘC LẬP (word-boundary — tránh khớp nhầm
 * "42900"). KHÔNG bắt lỗi khác để chúng vẫn nổi lên onError → 500 như cũ.
 */
export function isQueueRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /too many requests|\b429\b/i.test(msg);
}

/** Trần một lô `sendBatch` của Cloudflare Queues: ≤100 message/lô. */
export const QUEUE_SEND_BATCH_MAX = 100;

/**
 * Gửi `bodies` theo lô ≤100, GIÃN NHỊP `paceMs` mili-giây GIỮA các lô (lô đầu KHÔNG
 * chờ) để tổng tốc độ ghi nằm an toàn dưới trần 5.000 msg/giây/queue. `paceMs ≤ 0` →
 * không giãn (dùng trong test). `sleep` tiêm được để test tất định (không chờ thật).
 * `sendBatch` là closure bọc `queue.sendBatch` — nhận đủ kiểu Queue<...> đa dạng mà
 * KHÔNG ép biến thể (variance) ở tầng helper. Lỗi từ `sendBatch` (vd 429) được
 * PROPAGATE nguyên trạng cho caller quyết định (503).
 */
export async function sendBatchesPaced<T>(
  sendBatch: (batch: { body: T }[]) => Promise<unknown>,
  bodies: T[],
  paceMs: number,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  for (let i = 0; i < bodies.length; i += QUEUE_SEND_BATCH_MAX) {
    if (i > 0 && paceMs > 0) await sleep(paceMs);
    await sendBatch(bodies.slice(i, i + QUEUE_SEND_BATCH_MAX).map((body) => ({ body })));
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Nhịp giãn mặc định giữa các lô backfill dòng hàng: 100 msg / 50ms = 2.000/giây, chừa
// biên rộng dưới trần 5.000/giây kể cả khi có producer khác ghi song song. Tinh chỉnh
// qua var `BACKFILL_LINES_PACE_MS` (KHÔNG nhạy cảm) — bỏ trống/không hợp lệ → mặc định.
export const DEFAULT_BACKFILL_LINES_PACE_MS = 50;

export function resolveBackfillLinesPaceMs(env: { BACKFILL_LINES_PACE_MS?: string }): number {
  const s = env.BACKFILL_LINES_PACE_MS;
  if (s === undefined) return DEFAULT_BACKFILL_LINES_PACE_MS;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BACKFILL_LINES_PACE_MS;
}

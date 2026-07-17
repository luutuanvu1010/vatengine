// Sự cố Queue 429 (2026-07-17): burst enqueue backfill dòng hàng chạm trần 5000 msg/giây
// /queue của Cloudflare Queues → sendBatch ném "Too Many Requests". Helper này (1) nhận
// diện lỗi 429 để route trả 503 sync_busy thay vì 500, (2) gửi lô có GIÃN NHỊP để không
// tự chạm trần. THUẦN LOGIC → test offline, tất định (sleep tiêm được).
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKFILL_LINES_PACE_MS,
  isQueueRateLimited,
  resolveBackfillLinesPaceMs,
  sendBatchesPaced,
} from "../../src/queueEnqueue";

describe("isQueueRateLimited", () => {
  it("nhận diện lỗi 429 Cloudflare Queues (thông điệp thật + biến thể)", () => {
    expect(isQueueRateLimited(new Error("Queue sendBatch failed: Too Many Requests"))).toBe(true);
    expect(isQueueRateLimited(new Error("too many requests"))).toBe(true);
    expect(isQueueRateLimited(new Error("HTTP 429"))).toBe(true);
  });

  it("KHÔNG bắt lỗi khác (để nổi lên onError → 500 như cũ)", () => {
    expect(isQueueRateLimited(new Error("boom"))).toBe(false);
    expect(isQueueRateLimited(new Error("token_het_han"))).toBe(false);
    expect(isQueueRateLimited(new Error("42900 records"))).toBe(false); // không phải mã 429 độc lập
    expect(isQueueRateLimited(undefined)).toBe(false);
  });
});

describe("sendBatchesPaced", () => {
  function collectSender() {
    const calls: number[] = []; // kích thước mỗi lô
    return {
      calls,
      sendBatch: async (batch: { body: number }[]) => {
        calls.push(batch.length);
      },
    };
  }

  it("chia lô ≤100, gửi đủ, đúng thứ tự", async () => {
    const { calls, sendBatch } = collectSender();
    const bodies = Array.from({ length: 250 }, (_, i) => i);
    await sendBatchesPaced(sendBatch, bodies, 0);
    expect(calls).toEqual([100, 100, 50]);
  });

  it("GIÃN NHỊP giữa các lô (không chờ trước lô đầu), paceMs truyền đúng", async () => {
    const { sendBatch } = collectSender();
    const sleep = vi.fn(async () => {});
    const bodies = Array.from({ length: 250 }, (_, i) => i); // 3 lô → 2 lần chờ
    await sendBatchesPaced(sendBatch, bodies, 50, sleep);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
  });

  it("paceMs=0 → KHÔNG chờ", async () => {
    const { sendBatch } = collectSender();
    const sleep = vi.fn(async () => {});
    await sendBatchesPaced(sendBatch, [1, 2, 3], 0, sleep);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("propagate lỗi sendBatch (vd 429) cho caller xử lý", async () => {
    const sendBatch = async () => {
      throw new Error("Too Many Requests");
    };
    await expect(sendBatchesPaced(sendBatch, [1], 0)).rejects.toThrow("Too Many Requests");
  });
});

describe("resolveBackfillLinesPaceMs", () => {
  it("mặc định khi không đặt / không hợp lệ; parse số hợp lệ (kể cả 0)", () => {
    expect(resolveBackfillLinesPaceMs({})).toBe(DEFAULT_BACKFILL_LINES_PACE_MS);
    expect(resolveBackfillLinesPaceMs({ BACKFILL_LINES_PACE_MS: "abc" })).toBe(
      DEFAULT_BACKFILL_LINES_PACE_MS,
    );
    expect(resolveBackfillLinesPaceMs({ BACKFILL_LINES_PACE_MS: "-5" })).toBe(
      DEFAULT_BACKFILL_LINES_PACE_MS,
    );
    expect(resolveBackfillLinesPaceMs({ BACKFILL_LINES_PACE_MS: "0" })).toBe(0);
    expect(resolveBackfillLinesPaceMs({ BACKFILL_LINES_PACE_MS: "120" })).toBe(120);
  });
});

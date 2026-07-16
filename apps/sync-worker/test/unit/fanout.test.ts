// H-B.4 — fan-out: chia lô gửi hàng đợi (≤100 msg/≤256KB), jitter delaySeconds theo
// hash-tenant (giãn tải, tôn trọng máy chủ thuế), và ánh xạ outcome → hành động hàng
// đợi (TÁCH backpressure rate_limited/breaker_open khỏi lỗi thật). Thuần logic, offline.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKPRESSURE_DELAY_SEC,
  DEFAULT_JITTER_SPREAD_SEC,
  DEFAULT_MAX_BACKPRESSURE,
  QUEUE_MAX_BATCH_BYTES,
  QUEUE_MAX_BATCH_COUNT,
  chunkForQueue,
  consumerAction,
  jitterDelaySeconds,
  resolveFanoutConfig,
} from "../../src/fanout";
import type { JobOutcome } from "../../src/types";

describe("chunkForQueue — chia lô sendBatch (≤100 msg/≤256KB)", () => {
  it("chia theo TRẦN SỐ LƯỢNG: 250 phần tử, maxCount=100 → 100/100/50, giữ đủ + đúng thứ tự", () => {
    const items = Array.from({ length: 250 }, (_, i) => ({ i }));
    const chunks = chunkForQueue(items, 100, 256 * 1024);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(items); // không mất, không đổi thứ tự
  });

  it("chia theo TRẦN BYTE: mỗi lô không vượt maxBytes (ước lượng JSON)", () => {
    // Mỗi phần tử ~ >50 byte JSON; maxBytes nhỏ để ép chia theo byte trước số lượng.
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `tenant-${i}-xxxxxxxxxx` }));
    const maxBytes = 60;
    const chunks = chunkForQueue(items, 100, maxBytes);
    for (const c of chunks) {
      expect(JSON.stringify(c).length).toBeLessThanOrEqual(maxBytes);
    }
    expect(chunks.flat()).toEqual(items);
    expect(chunks.length).toBeGreaterThan(1); // đã thực sự chia
  });

  it("một phần tử vượt maxBytes vẫn nằm riêng một lô (không rơi/không kẹt vòng lặp)", () => {
    const big = { blob: "x".repeat(500) };
    const chunks = chunkForQueue([big], 100, 60);
    expect(chunks).toEqual([[big]]);
  });

  it("mảng rỗng → không lô nào", () => {
    expect(chunkForQueue([], 100, 256 * 1024)).toEqual([]);
  });

  it("hằng trần khớp giới hạn Cloudflare Queues", () => {
    expect(QUEUE_MAX_BATCH_COUNT).toBe(100);
    expect(QUEUE_MAX_BATCH_BYTES).toBe(256 * 1024);
  });
});

describe("jitterDelaySeconds — giãn tải theo hash-tenant", () => {
  it("TẤT ĐỊNH: cùng tenant → cùng delay", () => {
    expect(jitterDelaySeconds("tenant-abc", 60)).toBe(jitterDelaySeconds("tenant-abc", 60));
  });

  it("nằm trong [0, spread)", () => {
    for (const t of ["a", "b", "c", "tenant-xyz", ""]) {
      const d = jitterDelaySeconds(t, 60);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(60);
      expect(Number.isInteger(d)).toBe(true);
    }
  });

  it("PHÂN TÁN: nhiều tenant khác nhau → không dồn về một giá trị", () => {
    const vals = new Set(
      Array.from({ length: 30 }, (_, i) => jitterDelaySeconds(`tenant-${i}`, 60)),
    );
    expect(vals.size).toBeGreaterThan(1);
  });

  it("spread=0 → luôn 0 (không jitter)", () => {
    expect(jitterDelaySeconds("bất kỳ", 0)).toBe(0);
  });
});

describe("consumerAction — ánh xạ outcome → hành động hàng đợi", () => {
  const OPTS = { backpressureDelaySeconds: 30, bpAttempt: 0, maxBackpressure: 3 };

  it("completed → ack", () => {
    const o: JobOutcome = { kind: "completed", lanDongBoId: "x", soHdMoi: 1, soHdCapNhat: 0 };
    expect(consumerAction(o, OPTS)).toEqual({ type: "ack" });
  });

  it("needs_reauth → ack (không retry token chết)", () => {
    const o: JobOutcome = { kind: "needs_reauth", reason: "session_expired" };
    expect(consumerAction(o, OPTS)).toEqual({ type: "ack" });
  });

  it("rate_limited (backpressure, dưới trần) → reenqueue có delay + tăng bpAttempt (KHÔNG tính max_retries)", () => {
    const o: JobOutcome = { kind: "retry_backpressure", reason: "rate_limited" };
    expect(consumerAction(o, OPTS)).toEqual({ type: "reenqueue", delaySeconds: 30, bpAttempt: 1 });
  });

  it("breaker_open (backpressure, dưới trần) → reenqueue có delay", () => {
    const o: JobOutcome = { kind: "retry_backpressure", reason: "breaker_open" };
    expect(consumerAction(o, { ...OPTS, bpAttempt: 2 })).toEqual({
      type: "reenqueue",
      delaySeconds: 30,
      bpAttempt: 3,
    });
  });

  it("backpressure ĐẠT TRẦN (bpAttempt ≥ maxBackpressure) → retry thật (max_retries → dead-letter, có điểm dừng)", () => {
    const o: JobOutcome = { kind: "retry_backpressure", reason: "rate_limited" };
    expect(consumerAction(o, { ...OPTS, bpAttempt: 3 })).toEqual({ type: "retry" });
    expect(consumerAction(o, { ...OPTS, bpAttempt: 99 })).toEqual({ type: "retry" });
  });

  it("lỗi tạm (transient) → retry (tính vào max_retries → dead-letter)", () => {
    const o: JobOutcome = { kind: "retry", reason: "transient" };
    expect(consumerAction(o, OPTS)).toEqual({ type: "retry" });
  });
});

describe("resolveFanoutConfig — tinh chỉnh qua env, mặc định an toàn", () => {
  it("env trống → mặc định", () => {
    expect(resolveFanoutConfig({})).toEqual({
      jitterSpreadSeconds: DEFAULT_JITTER_SPREAD_SEC,
      backpressureDelaySeconds: DEFAULT_BACKPRESSURE_DELAY_SEC,
      maxBackpressure: DEFAULT_MAX_BACKPRESSURE,
    });
  });

  it("env hợp lệ → dùng giá trị env", () => {
    expect(
      resolveFanoutConfig({
        FANOUT_JITTER_SPREAD_SEC: "120",
        FANOUT_BACKPRESSURE_DELAY_SEC: "0",
        FANOUT_MAX_BACKPRESSURE: "5",
      }),
    ).toEqual({ jitterSpreadSeconds: 120, backpressureDelaySeconds: 0, maxBackpressure: 5 });
  });

  it("env rác → rơi về mặc định (không vỡ)", () => {
    expect(
      resolveFanoutConfig({
        FANOUT_JITTER_SPREAD_SEC: "abc",
        FANOUT_BACKPRESSURE_DELAY_SEC: "-5",
        FANOUT_MAX_BACKPRESSURE: "xyz",
      }),
    ).toEqual({
      jitterSpreadSeconds: DEFAULT_JITTER_SPREAD_SEC,
      backpressureDelaySeconds: DEFAULT_BACKPRESSURE_DELAY_SEC,
      maxBackpressure: DEFAULT_MAX_BACKPRESSURE,
    });
  });
});

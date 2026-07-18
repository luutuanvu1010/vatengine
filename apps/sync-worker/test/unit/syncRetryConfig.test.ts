// Sự cố production 2026-07-18 (GDT 429 kéo dài): U25 AC3 định "mặc định > 0" cho
// giãn nhịp phân trang nhưng production chưa bao giờ truyền `retry` vào sync()
// (deps.ts chỉ có `includeSco`) → phân trang header bắn GDT không nghỉ. Resolver này
// (khuôn resolveFanoutConfig — U25 AC7) chốt mặc định an toàn + cho tinh chỉnh qua
// vars wrangler mà không sửa code.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYNC_PAGE_MIN_INTERVAL_MS,
  DEFAULT_SYNC_RETRY_BACKOFF_MS,
  resolveSyncRetryConfig,
} from "../../src/syncRetryConfig";

describe("resolveSyncRetryConfig (U25 AC3/AC7 — giãn nhịp header production)", () => {
  it("bỏ trống → mặc định AN TOÀN: có giãn nhịp (>0) và backoff 429 đủ lớn", () => {
    const cfg = resolveSyncRetryConfig({});
    expect(cfg.minIntervalMs).toBe(DEFAULT_SYNC_PAGE_MIN_INTERVAL_MS);
    expect(cfg.backoffMs).toBe(DEFAULT_SYNC_RETRY_BACKOFF_MS);
    // Chốt tinh thần AC3 "mặc định > 0" — không được lùi về 0 (bắn không nghỉ).
    expect(cfg.minIntervalMs).toBeGreaterThan(0);
    // Backoff fallback khi GDT 429 không kèm Retry-After parse được: mặc định
    // adapter 300ms là quá sát (đập lại đúng lúc đang bị phạt) — phải ≥ 1s.
    expect(cfg.backoffMs).toBeGreaterThanOrEqual(1000);
  });

  it("đặt hợp lệ qua vars → dùng đúng giá trị (kể cả 0 = tắt có chủ đích)", () => {
    const cfg = resolveSyncRetryConfig({
      SYNC_PAGE_MIN_INTERVAL_MS: "250",
      SYNC_RETRY_BACKOFF_MS: "5000",
    });
    expect(cfg.minIntervalMs).toBe(250);
    expect(cfg.backoffMs).toBe(5000);
    // 0 là giá trị hợp lệ (tắt tường minh) — cùng ngữ nghĩa parseNonNegInt của fanout.
    expect(resolveSyncRetryConfig({ SYNC_PAGE_MIN_INTERVAL_MS: "0" }).minIntervalMs).toBe(0);
  });

  it("giá trị hỏng (âm/không phải số) → rơi về mặc định, không ném", () => {
    const cfg = resolveSyncRetryConfig({
      SYNC_PAGE_MIN_INTERVAL_MS: "-1",
      SYNC_RETRY_BACKOFF_MS: "abc",
    });
    expect(cfg.minIntervalMs).toBe(DEFAULT_SYNC_PAGE_MIN_INTERVAL_MS);
    expect(cfg.backoffMs).toBe(DEFAULT_SYNC_RETRY_BACKOFF_MS);
  });
});

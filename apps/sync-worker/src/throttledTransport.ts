// U28 — Decorator GdtTransport: xin permit TenantLimiter trước MỖI fetch() ra GDT.
// Trả nợ permit-per-request cho pha 1 (mirror runDetailJob pha 2): trước đây runJob
// xin 1 permit cho CẢ job rồi sync() phân trang tự do — tới 42 request GDT / 1 permit
// → 429 hàng loạt, job tháng chết, 0 dữ liệu (sự cố 2026-07-18, U28-plan §0).
//
// Vì sao bọc transport thay vì bơm limiter vào adapter: ADR-0001 quy định mọi gọi ra
// đi qua interface `GdtTransport` hoán đổi được — decorator đứng ở khe đó nên bảo vệ
// MỌI lời gọi GDT tự động, không đụng packages/gdt-client lẫn packages/sync
// (gdt-adapter.md: không rò rỉ khái niệm hạ tầng vào adapter).
import { GdtError } from "@vat/gdt-client";
import type { GdtTransport } from "@vat/gdt-client";
import type { TenantLimiterClient } from "./types";

/** Nhịp chờ giữa hai lượt xin permit khi giỏ token cạn (ms) — khớp refill mặc định
 * 2 token/s của TenantLimiter: các trang tự giãn ~500ms ("không gọi dồn dập"). */
const DEFAULT_RETRY_DELAY_MS = 500;

/** Trần TỔNG thời gian chờ permit cho MỘT request (ms). Hết trần → ném GdtError 429
 * để job rơi vào đường backpressure (reenqueue có delay) thay vì treo Worker.
 * PHẢI < 10s: fetchWithRetry (packages/gdt-client/src/http.ts, DEFAULT_TIMEOUT_MS)
 * đặt AbortController 10s quanh MỖI transport.fetch — chờ vắt qua mốc đó rồi mới gọi
 * GDT bằng signal đã abort sẽ nổ "The operation was aborted" → phân loại transient →
 * tính oan vào breaker (nợ backlog 2026-07-18, n=43). */
const DEFAULT_MAX_WAIT_MS = 8_000;

export interface ThrottleOptions {
  retryDelayMs?: number;
  maxWaitMs?: number;
  /** Tiêm hàm chờ để test offline không ngủ thật. Production: setTimeout
   * (thời gian CHỜ là wall-time, không tính CPU — Workers Paid, U28-plan §7). */
  wait?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Bọc một `GdtTransport`: mọi `fetch()` phải xin permit từ giỏ token/breaker của
 * tenant trước khi chạm GDT.
 *
 * Ánh xạ kết quả `tryAcquire()` (U28-plan §4):
 * - `allowed`      → gọi transport gốc, trả nguyên Response (không đổi ngữ nghĩa).
 * - `rate_limited` → chờ rồi thử lại (giỏ tự đầy theo thời gian), có trần tổng.
 * - `breaker_open` → ném NGAY, không chờ (cooldown breaker dài — chờ trong request
 *   là treo vô ích), không gọi GDT.
 * - quá trần chờ   → ném lỗi có kiểu.
 *
 * Lỗi ném ra là `GdtError(httpStatus: 429)` — đúng hình dạng mà packages/sync
 * (`classifyFailure`) xếp vào `failureKind: "rate_limited"`, để runJob trả
 * `retry_backpressure` qua nhánh ĐÃ CÓ, không sinh đường xử lý mới.
 *
 * `probe()`/`name` ủy quyền nguyên trạng: probe là health check TOÀN HỆ THỐNG chạy
 * theo nhịp cron riêng, không phải việc của tenant → không tiêu permit tenant.
 */
export function throttledTransport(
  inner: GdtTransport,
  limiter: TenantLimiterClient,
  opts: ThrottleOptions = {},
): GdtTransport {
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const wait = opts.wait ?? sleep;

  return {
    name: inner.name,
    probe: () => inner.probe(),
    async fetch(url, init) {
      let waitedMs = 0;
      for (;;) {
        // Caller (fetchWithRetry) có thể đã abort trong lúc ta chờ permit — bail bằng
        // lỗi CÓ KIỂU đi đường backpressure, KHÔNG gọi GDT bằng signal chết (sẽ thành
        // AbortError → phân loại transient → tính oan vào breaker).
        if (init?.signal?.aborted) {
          throw new GdtError(
            "Kìm nhịp GDT (U28): caller đã hủy (timeout) trong lúc chờ permit — đẩy lùi qua backpressure.",
            "HTTP_ERROR",
            429,
          );
        }
        const permit = await limiter.tryAcquire();
        if (permit.allowed) return inner.fetch(url, init);
        // KHÔNG kèm url vào thông điệp lỗi (security.md — không log URL đầy đủ).
        if (permit.reason === "breaker_open") {
          throw new GdtError(
            "Kìm nhịp GDT (U28): circuit breaker đang mở — không gọi GDT lúc này.",
            "HTTP_ERROR",
            429,
          );
        }
        if (waitedMs >= maxWaitMs) {
          throw new GdtError(
            `Kìm nhịp GDT (U28): quá trần chờ permit ${maxWaitMs}ms — đẩy lùi qua backpressure.`,
            "HTTP_ERROR",
            429,
          );
        }
        await wait(retryDelayMs);
        waitedMs += retryDelayMs;
      }
    },
  };
}

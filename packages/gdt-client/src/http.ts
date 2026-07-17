// Gọi mạng qua GdtTransport với timeout tường minh + retry có backoff cho lỗi
// tạm (5xx/timeout). KHÔNG retry cho 401 — caller tự xử lý hết phiên.
// Xem .claude/rules/gdt-adapter.md.

import type { GdtTransport } from "./transport";

export interface RetryOptions {
  /** Timeout mỗi lần gọi (ms). Mặc định 10s. */
  timeoutMs?: number;
  /** Tổng số lần thử (kể cả lần đầu). Mặc định 3. */
  maxAttempts?: number;
  /** Backoff cơ bản (ms), nhân đôi mỗi lần thử lại. Mặc định 300ms. */
  backoffMs?: number;
  /**
   * Coi HTTP 429 (Too Many Requests) là lỗi tạm — chờ rồi retry, giống 5xx.
   * Mặc định `true` (U25 — tôn trọng rate-limit của GDT thay vì ném lỗi ngay).
   */
  retryOn429?: boolean;
  /**
   * Trần thời gian chờ một lần (ms), áp cho CẢ `Retry-After` lẫn backoff mũ — chặn
   * chờ dài vô ích/treo Worker khi GDT trả `Retry-After` bất thường lớn. Mặc định 30s.
   */
  maxBackoffMs?: number;
  /**
   * Hàm chờ có thể tiêm (test dùng để không chờ thật). Mặc định `setTimeout` thật.
   */
  sleepFn?: (ms: number) => Promise<void>;
  /**
   * Khoảng nghỉ tối thiểu (ms) giữa các lần gọi liên tiếp (giãn nhịp phân trang/detail
   * — U25 AC3). `0`/không đặt = tắt (hành vi cũ). Bản thân `fetchWithRetry` KHÔNG tự
   * áp giá trị này — caller (vòng lặp phân trang/detail) gọi `pace()` giữa hai request.
   */
  minIntervalMs?: number;
}

/**
 * Nghỉ `minIntervalMs` ms nếu > 0 (giãn nhịp giữa hai request liên tiếp — U25 AC3).
 * `minIntervalMs` không đặt/`<= 0` → không chờ, giữ hành vi cũ (test khác chạy nhanh).
 * `sleepFn` cho phép tiêm hàm chờ giả trong test.
 */
export async function pace(
  minIntervalMs: number | undefined,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  if (!minIntervalMs || minIntervalMs <= 0) return;
  await sleepFn(minIntervalMs);
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 300;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Đọc header `Retry-After` của một 429/503 và quy ra số ms cần chờ.
 * CHƯA KIỂM CHỨNG định dạng thật GDT trả khi 429 (§1 U25-plan.md) — hỗ trợ cả hai
 * dạng chuẩn HTTP: số giây nguyên, hoặc HTTP-date. Không parse được/không có header
 * → `undefined` (caller fallback backoff mũ). Thuần, không side effect.
 */
export function retryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const trimmed = raw.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }

  return undefined;
}

/**
 * Gọi `transport.fetch` với timeout + retry backoff cho lỗi tạm.
 * - HTTP 401: trả về ngay, KHÔNG retry (caller quyết định "hết phiên").
 * - HTTP 5xx: retry cho tới khi hết `maxAttempts`, sau đó trả response cuối
 *   (caller tự kiểm tra status, không nuốt lỗi HTTP im lặng).
 * - Timeout/lỗi mạng: retry cho tới khi hết `maxAttempts`, sau đó throw.
 */
export async function fetchWithRetry(
  transport: GdtTransport,
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const retryOn429 = opts.retryOn429 ?? true;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const wait = opts.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await transport.fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);

      if (res.status === 401) return res;
      const isRateLimited = retryOn429 && (res.status === 429 || res.status === 503);
      if (isRateLimited && attempt < maxAttempts) {
        const ms = Math.min(retryAfterMs(res) ?? backoffMs * 2 ** (attempt - 1), maxBackoffMs);
        await wait(ms);
        continue;
      }
      if (res.status >= 500 && attempt < maxAttempts) {
        await wait(backoffMs * 2 ** (attempt - 1));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < maxAttempts) {
        await sleep(backoffMs * 2 ** (attempt - 1));
        continue;
      }
      throw err;
    }
  }
  // Không thể tới đây (vòng lặp luôn return hoặc throw), giữ để tsc thoả mãn kiểu trả về.
  throw new Error("fetchWithRetry: hết lượt thử nhưng không có kết quả");
}

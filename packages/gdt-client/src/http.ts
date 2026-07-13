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
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await transport.fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);

      if (res.status === 401) return res;
      if (res.status >= 500 && attempt < maxAttempts) {
        await sleep(backoffMs * 2 ** (attempt - 1));
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

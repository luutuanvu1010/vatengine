// Worker API — điểm vào tầng ứng dụng (stateless). ADR-0001.
// U6: nối app Hono (tra cứu hóa đơn) với kết nối Postgres thật qua Hyperdrive.
import { createApp } from "./app";
import { getDbFromHyperdrive } from "./db";
import { getTransportDirect } from "./gdt";
import { loginLimiterClient } from "./loginLimiterDO";
import { getStorageFromR2 } from "./storage";
import type { Env } from "./types";

export type { Env };
// H-A.5b — Durable Object khóa đăng nhập PHẢI export tên từ entry (Workers yêu cầu).
export { LoginLimiter } from "./loginLimiterDO";
// U22 — Durable Object tracker backfill (B4). Export tên từ entry (Workers yêu cầu);
// producer/GET (B5/B6) tiêu thụ qua binding BACKFILL_TRACKER.
export { BackfillTracker } from "./backfillTrackerDO";

const app = createApp({
  getDb: getDbFromHyperdrive,
  getStorage: getStorageFromR2,
  getTransport: getTransportDirect,
  // H-A.5b — client DO theo key (fail-open nếu binding thiếu; xem loginLimiterDO.ts).
  getLoginLimiter: (env, key) => loginLimiterClient(env.LOGIN_LIMITER, key),
});

export default app;

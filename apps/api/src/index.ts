// Worker API — điểm vào tầng ứng dụng (stateless). ADR-0001.
// U6: nối app Hono (tra cứu hóa đơn) với kết nối Postgres thật qua Hyperdrive.
import { createApp } from "./app";
import { backfillTrackerClient } from "./backfillTrackerDO";
import { getDbFromHyperdrive } from "./db";
import { getTransportDirect } from "./gdt";
import { getStorageFromR2 } from "./storage";
import type { Env } from "./types";

export type { Env };
// U22 — Durable Object tracker backfill (B4). Export tên từ entry (Workers yêu cầu);
// producer/GET (B5/B6) tiêu thụ qua binding BACKFILL_TRACKER.
export { BackfillTracker } from "./backfillTrackerDO";
import { baoDangKyMoi } from "./thongBao/telegram";

const app = createApp({
  getDb: getDbFromHyperdrive,
  getStorage: getStorageFromR2,
  getTransport: getTransportDirect,
  // U22 — client DO tracker backfill theo backfillId (fail-closed nếu binding thiếu).
  getBackfillTracker: (env, backfillId) => backfillTrackerClient(env.BACKFILL_TRACKER, backfillId),
  baoDangKyMoi: (env, tt) => baoDangKyMoi(env, tt),
});

export default app;

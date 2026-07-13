// Worker API — điểm vào tầng ứng dụng (stateless). ADR-0001.
// U6: nối app Hono (tra cứu hóa đơn) với kết nối Postgres thật qua Hyperdrive.
import { createApp } from "./app";
import { getDbFromHyperdrive } from "./db";
import type { Env } from "./types";

export type { Env };

const app = createApp({ getDb: getDbFromHyperdrive });

export default app;

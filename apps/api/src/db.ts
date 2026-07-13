// Wiring production: mở kết nối Postgres QUA Hyperdrive cho MỘT request rồi đóng ở
// `close()` (finally trong route) — Worker phi trạng thái, Hyperdrive gom kết nối phía
// server (ADR-0001). KHÔNG test-cover (test tiêm PGlite); cần kiểm chứng với Hyperdrive
// thật khi deploy (xem U6-plan "Rủi ro"). `nodejs_compat` đã bật trong wrangler.jsonc.
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import type { DbHandle, Env } from "./types";

export async function getDbFromHyperdrive(env: Env): Promise<DbHandle> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  return {
    // Cast ở RANH GIỚI wiring: kiểu db cụ thể (node-postgres) khớp AnyDb về hành vi
    // nhưng bất biến ở tham số generic của Drizzle — query fns generic nhận lại đúng.
    db: drizzle(client) as unknown as DbHandle["db"],
    close: () => client.end(),
  };
}

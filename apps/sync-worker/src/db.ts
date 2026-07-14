// Wiring production: mở kết nối Postgres QUA Hyperdrive cho MỘT lô job rồi đóng
// (finally trong queue handler). Giống apps/api/db.ts — KHÔNG test-cover (test tiêm
// PGlite); kiểm chứng với Hyperdrive thật khi deploy. `nodejs_compat` bật ở wrangler.jsonc.
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import type { DbHandle, Env } from "./types";

export async function getDbFromHyperdrive(env: Env): Promise<DbHandle> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  return {
    // Cast ở RANH GIỚI wiring: kiểu db cụ thể (node-postgres) khớp AnyDb về hành vi
    // nhưng bất biến ở tham số generic của Drizzle.
    db: drizzle(client) as unknown as DbHandle["db"],
    close: () => client.end(),
  };
}

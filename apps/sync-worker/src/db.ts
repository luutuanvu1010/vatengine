// Wiring production: mở kết nối Postgres QUA Hyperdrive cho MỘT lô job rồi đóng
// (finally trong queue handler). Giống apps/api/db.ts — KHÔNG test-cover (test tiêm
// PGlite); kiểm chứng với Hyperdrive thật khi deploy. `nodejs_compat` bật ở wrangler.jsonc.
import { type RoleGuardVerdict, assertConnectionRoleSafe, checkConnectionRole } from "@vat/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import type { DbHandle, Env } from "./types";

// H-A.2 — verdict role kết nối, cache MỘT LẦN/isolate. Role app phải NOSUPERUSER/
// NOBYPASSRLS/không-own-bảng, nếu không RLS (cách ly tenant) vô hiệu (ADR-0004).
let roleVerdict: RoleGuardVerdict | null = null;

export async function getDbFromHyperdrive(env: Env): Promise<DbHandle> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  const db = drizzle(client);
  try {
    if (roleVerdict === null) {
      roleVerdict = await checkConnectionRole(
        db as unknown as Parameters<typeof checkConnectionRole>[0],
      );
    }
    assertConnectionRoleSafe(roleVerdict);
  } catch (e) {
    await client.end();
    throw e;
  }
  return {
    // Cast ở RANH GIỚI wiring: kiểu db cụ thể (node-postgres) khớp AnyDb về hành vi
    // nhưng bất biến ở tham số generic của Drizzle.
    db: db as unknown as DbHandle["db"],
    close: () => client.end(),
  };
}

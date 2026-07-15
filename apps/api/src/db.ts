// Wiring production: mở kết nối Postgres QUA Hyperdrive cho MỘT request rồi đóng ở
// `close()` (finally trong route) — Worker phi trạng thái, Hyperdrive gom kết nối phía
// server (ADR-0001). KHÔNG test-cover (test tiêm PGlite); cần kiểm chứng với Hyperdrive
// thật khi deploy (xem U6-plan "Rủi ro"). `nodejs_compat` đã bật trong wrangler.jsonc.
import { type RoleGuardVerdict, assertConnectionRoleSafe, checkConnectionRole } from "@vat/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import type { DbHandle, Env } from "./types";

// H-A.2 — verdict role kết nối, cache MỘT LẦN/isolate (cold start). Không kiểm lại mỗi
// request. Role app phải NOSUPERUSER/NOBYPASSRLS/không-own-bảng, nếu không RLS vô hiệu.
let roleVerdict: RoleGuardVerdict | null = null;

export async function getDbFromHyperdrive(env: Env): Promise<DbHandle> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  const db = drizzle(client);
  // Cổng an ninh RLS (ADR-0004): role sai → đóng kết nối + TỪ CHỐI khởi động.
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
    // nhưng bất biến ở tham số generic của Drizzle — query fns generic nhận lại đúng.
    db: db as unknown as DbHandle["db"],
    close: () => client.end(),
  };
}

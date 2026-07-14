// A1 (U15) — GET /me: hồ sơ tenant hiện tại (ten/mst/goiDichVu) + vai từ token. Đọc-only,
// cả 3 vai (chỉ requireTenant). Cách ly tenant: `tenant_id` LẤY TỪ TOKEN (không nhận từ
// client); truy vấn trong withTenant (RLS lớp 2) + lọc id tường minh (lớp 1). KHÔNG trả
// bí mật (không secret_ref/token thuế). Email không cần (client biết từ lúc đăng nhập).
import { tenants, withTenant } from "@vat/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireTenant } from "../auth";
import type { AppDeps, AppEnv } from "../types";

export function meRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.use("*", requireTenant);

  r.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    const role = c.get("role");
    const { db, close } = await deps.getDb(c.env);
    try {
      const row = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .select({ ten: tenants.ten, mst: tenants.mst, goiDichVu: tenants.goiDichVu })
          .from(tenants)
          .where(eq(tenants.id, tenantId));
        return rows[0] ?? null;
      });
      if (!row) return c.json({ error: "not_found" }, 404);
      return c.json({ ten: row.ten, mst: row.mst, goiDichVu: row.goiDichVu, role });
    } finally {
      await close();
    }
  });

  return r;
}

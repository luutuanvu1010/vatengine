// U14 — quản lý tài khoản thuế + đường login GDT (ghi token mã hóa). Mọi route sau
// requireTenant + requireRole(ke_toan_truong|quan_tri), trong withTenant (RLS lớp 2)
// + lọc tenant_id tường minh (lớp 1). Gọi GDT CHỈ qua @vat/gdt-client (gdt-adapter.md).
import { taiKhoanThue, withTenant } from "@vat/db";
import { Hono } from "hono";
import { z } from "zod";
import { requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

const registerSchema = z.object({
  username: z.string().min(1),
  loai: z.enum(["chinh", "con"]).optional(),
});

export function taxAccountsRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan_truong", "quan_tri"));

  // POST /tax-accounts — đăng ký bản ghi tài khoản thuế (chưa có token).
  r.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const id = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .insert(taiKhoanThue)
          .values({
            tenantId,
            username: parsed.data.username,
            ...(parsed.data.loai ? { loai: parsed.data.loai } : {}),
          })
          .returning({ id: taiKhoanThue.id });
        return rows[0]?.id;
      });
      if (!id) return c.json({ error: "server_error" }, 500);
      return c.json({ id }, 201);
    } finally {
      await close();
    }
  });

  return r;
}

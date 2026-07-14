// Route xác thực người dùng NỘI BỘ (U8): POST /auth/login đổi email+mật khẩu lấy JWT
// nội bộ mang `tenant_id`+`role`. KHÔNG liên quan tài khoản thuế (security.md).
//
// CÁCH LY vs RLS: login xảy ra TRƯỚC khi biết tenant nên KHÔNG chạy trong withTenant.
// `nguoi_dung` bật FORCE RLS ⇒ SELECT thường (role app production, non-superuser) sẽ
// thấy 0 hàng. Vì vậy tra cứu đi qua hàm SECURITY DEFINER `auth_lookup_user(email)`
// (owner BYPASSRLS, bề mặt hẹp — chỉ trả trường xác thực; xem migration 0001). Email
// UNIQUE toàn cục nên một email định danh đúng một người dùng.
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { signToken } from "../auth";
import { verifyPassword } from "../password";
import { isRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

interface AuthRow {
  id: string;
  tenant_id: string;
  vai_tro: string;
  password_hash: string | null;
}

export function authRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  // POST /auth/login — KHÔNG requireTenant (đây là đường phát hành token). Sai thông tin
  // → 401 GỌN, không phân biệt "email sai" vs "mật khẩu sai" (không rò cho dò tài khoản).
  r.post("/login", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const { email, password } = parsed.data;

    const { db, close } = await deps.getDb(c.env);
    try {
      const res = (await db.execute(
        sql`select id, tenant_id, vai_tro, password_hash from auth_lookup_user(${email})`,
      )) as { rows: AuthRow[] };
      const row = res.rows[0];
      // Không có người dùng / chưa đặt mật khẩu → 401 (vẫn chạy verify giả sẽ tốn CPU
      // vô ích; ở đây 401 sớm — đánh đổi chấp nhận được cho MVP nội bộ).
      if (!row || !row.password_hash) return c.json({ error: "unauthorized" }, 401);

      const ok = await verifyPassword(password, row.password_hash);
      if (!ok) return c.json({ error: "unauthorized" }, 401);

      // Vai lưu trong DB phải hợp lệ trước khi đưa vào token (chặn dữ liệu bẩn).
      if (!isRole(row.vai_tro)) return c.json({ error: "unauthorized" }, 401);

      const token = await signToken(
        { tenantId: row.tenant_id, role: row.vai_tro, sub: row.id },
        c.env.JWT_SECRET,
      );
      return c.json({ token });
    } finally {
      await close();
    }
  });

  return r;
}

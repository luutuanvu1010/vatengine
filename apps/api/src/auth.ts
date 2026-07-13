// Xác thực JWT NỘI BỘ của SaaS (U6, phương án A). KHÔNG dùng token thuế (security.md).
// Xác minh chữ ký HS256 bằng `env.JWT_SECRET` (Workers Secret) → trích claim `tenant_id`
// → đặt vào context cho route lọc + RLS. Phát hành token + RBAC là U8 (mở rộng seam này).
// Mọi ca hỏng → 401 gọn (không rò chi tiết lý do cho client).
import type { MiddlewareHandler } from "hono";
import { verify } from "hono/jwt";
import type { AppEnv } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export const requireTenant: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return c.json({ error: "unauthorized" }, 401);

  let payload: Awaited<ReturnType<typeof verify>>;
  try {
    // verify kiểm chữ ký + `exp`/`nbf` mặc định → ném nếu sai/hết hạn.
    payload = await verify(token, c.env.JWT_SECRET, "HS256");
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }

  const tenantId = payload.tenant_id;
  // Thiếu claim hoặc không phải UUID → từ chối (không đoán tenant — multi-tenant.md).
  if (!isUuid(tenantId)) return c.json({ error: "unauthorized" }, 401);

  c.set("tenantId", tenantId);
  await next();
};

// Xác thực JWT NỘI BỘ của SaaS (U6/U8). KHÔNG dùng token thuế (security.md). Xác minh
// chữ ký HS256 bằng `env.JWT_SECRET` (Workers Secret) → trích claim `tenant_id` + `role`
// → đặt vào context cho route lọc/RLS + RBAC (rbac.ts). U8 bổ sung phát hành (signToken)
// dùng ở /auth/login. Mọi ca hỏng xác thực → 401 gọn (không rò lý do cho client).
import type { MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import { isRole } from "./rbac";
import type { Role } from "./rbac";
import type { AppEnv } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vòng đời token nội bộ (giây). Ngắn để giảm cửa sổ rủi ro nếu rò (security.md tinh thần).
const TOKEN_TTL_SEC = 8 * 60 * 60; // 8 giờ.

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// Phát hành JWT nội bộ (U8) sau khi /auth/login xác thực email+mật khẩu. Claim tối thiểu:
// `tenant_id` (gắn ĐÚNG một tenant), `role` (vai RBAC), `sub` (id người dùng), `exp`.
export async function signToken(
  args: { tenantId: string; role: Role; sub: string },
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return sign(
    { tenant_id: args.tenantId, role: args.role, sub: args.sub, exp: nowSec + TOKEN_TTL_SEC },
    secret,
    "HS256",
  );
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

  // U8: token phải mang vai hợp lệ. Thiếu/sai vai = token dở → 401 (xác thực), không 403.
  const role = payload.role;
  if (!isRole(role)) return c.json({ error: "unauthorized" }, 401);

  c.set("tenantId", tenantId);
  c.set("role", role);
  await next();
};

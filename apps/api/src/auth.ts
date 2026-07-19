// Xác thực JWT NỘI BỘ của SaaS (U6/U8). KHÔNG dùng token thuế (security.md). Xác minh
// chữ ký HS256 bằng `env.JWT_SECRET` (Workers Secret) → trích claim `tenant_id` + `role`
// → đặt vào context cho route lọc/RLS + RBAC (rbac.ts). U8 bổ sung phát hành (signToken)
// dùng ở /auth/login. Mọi ca hỏng xác thực → 401 gọn (không rò lý do cho client).
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { isRole } from "./rbac";
import type { Role } from "./rbac";
import type { AppEnv } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vòng đời token nội bộ (giây). Ngắn để giảm cửa sổ rủi ro nếu rò (security.md tinh thần).
// Export vì cookie phiên (session.ts) phải dùng ĐÚNG giá trị này cho Max-Age — nếu hai
// nơi khai riêng, chúng sẽ lệch nhau khi ai đó sửa một bên (ADR-0003 Amendment #1 C1).
export const TOKEN_TTL_SEC = 8 * 60 * 60; // 8 giờ.

// Tên cookie phiên. Đặt Ở ĐÂY (không phải session.ts) để phụ thuộc chạy MỘT CHIỀU
// session.ts → auth.ts: session.ts cần TOKEN_TTL_SEC cho Max-Age, nên nếu auth.ts import
// ngược lại sẽ thành vòng tròn. session.ts re-export tên này làm bề mặt công khai.
export const SESSION_COOKIE = "vat_session";

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
  // ADR-0003 Amendment #1 (C3) — COOKIE trước, `Authorization: Bearer` sau. Trình duyệt
  // dùng cookie HttpOnly (JS không chạm được); Bearer giữ lại cho client không-trình-duyệt
  // và test. Giữ Bearer KHÔNG làm yếu C1: kẻ tấn công vẫn không có đường lấy được token.
  const header = c.req.header("Authorization");
  const token =
    getCookie(c, SESSION_COOKIE) ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
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

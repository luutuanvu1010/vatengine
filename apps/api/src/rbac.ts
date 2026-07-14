// RBAC (U8) — vai trò người dùng nội bộ + middleware gác quyền. Vai đi trong claim JWT
// (quyết định #3, docs/plans/U8-plan.md), do requireTenant xác minh + đặt vào context.
// NGUỒN CHÂN LÝ DUY NHẤT của tập vai — không hardcode lại chuỗi vai ở nơi khác.
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./types";

// 3 vai theo kiến trúc (mục 5 KIEN_TRUC): kế toán < kế toán trưởng < quản trị.
export const ROLES = ["ke_toan", "ke_toan_truong", "quan_tri"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// Gác route theo vai. Chạy SAU requireTenant (đã đặt `role`). Đúng token nhưng sai vai
// → 403 (ủy quyền), PHÂN BIỆT với 401 (xác thực — thiếu/sai token). RBAC KHÔNG thay
// cách ly tenant: một tenant vẫn chỉ thấy dữ liệu của mình dù vai là quan_tri (RLS +
// lọc tenant_id tường minh — multi-tenant.md).
export function requireRole(...allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const role = c.get("role");
    if (!isRole(role) || !allowed.includes(role)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  };
}

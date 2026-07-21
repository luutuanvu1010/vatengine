// U18 — Cổng vào MỌI route `/admin/*`. Đây là ranh giới duy nhất giữa Internet và con
// đường xuyên-tenant của migration 0011.
//
// KHÔNG dựa vào Cloudflare Access để gác thay (QĐ-4): Access bảo vệ ở tầng BIÊN theo
// hostname, mà `/admin/*` hiện mount CHUNG Worker API với route khách — một request tới
// hostname của khách vẫn chạm được đường dẫn này. Access là lớp cộng thêm khi U19 dựng
// `apps/admin` trên subdomain riêng; middleware này phải tự đứng vững khi KHÔNG có gì
// phía trước.
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { isUuid } from "../auth";
import type { AdminEnv } from "../types";
import { ADMIN_AUD, ADMIN_SESSION_COOKIE, kiemTraCauHinhAdmin } from "./adminAuth";

export const requireSuperAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  // Lớp 2 (xem adminAuth.ts): cấu hình sai ⇒ TỪ CHỐI PHỤC VỤ, không chạy tiếp với một lớp
  // phòng thủ duy nhất. 503 chứ không 401/500: đây không phải lỗi của người gọi, mà là
  // điều kiện vận hành khiến ta không thể gác an toàn — cùng ngữ nghĩa dangKy.ts dùng khi
  // thiếu CF-Connecting-IP.
  const cauHinh = kiemTraCauHinhAdmin(c.env);
  if (!cauHinh.ok) return c.json({ error: "admin_chua_cau_hinh" }, 503);

  // Cookie trước, Bearer sau — cùng thứ tự requireTenant dùng (ADR-0003 Amendment #1 C3).
  // Trình duyệt (Cổng Admin U19) đi bằng cookie HttpOnly; Bearer giữ cho client không
  // phải trình duyệt và cho test.
  const header = c.req.header("Authorization");
  const token =
    getCookie(c, ADMIN_SESSION_COOKIE) ??
    (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) return c.json({ error: "unauthorized" }, 401);

  let payload: Awaited<ReturnType<typeof verify>>;
  try {
    payload = await verify(token, cauHinh.secret, "HS256");
  } catch {
    // Chữ ký sai / hết hạn / dị dạng đều về CÙNG một 401 gọn — không nói cho kẻ gọi biết
    // họ sai ở đâu.
    return c.json({ error: "unauthorized" }, 401);
  }

  // Lớp 3: `aud`. hono/jwt verify chỉ kiểm chữ ký + exp/nbf, KHÔNG kiểm aud — phải tự làm.
  if (payload.aud !== ADMIN_AUD) return c.json({ error: "unauthorized" }, 401);

  // Token miền admin KHÔNG được mang tenant_id. Kiểm tường minh thay vì chỉ "không đọc
  // tới": nếu một token lai (có cả aud admin lẫn tenant_id) bao giờ đó xuất hiện, nó là
  // dấu hiệu hai miền đã lẫn nhau ⇒ từ chối, đừng đoán ý.
  if (payload.tenant_id !== undefined) return c.json({ error: "unauthorized" }, 401);

  if (!isUuid(payload.sub)) return c.json({ error: "unauthorized" }, 401);

  c.set("adminId", payload.sub);
  await next();
};

// Phiên đăng nhập bằng cookie HttpOnly (ADR-0003 Amendment #1, C1–C6). NƠI DUY NHẤT
// định nghĩa hợp đồng cookie phiên — route/middleware không tự chế biến chuỗi cookie.
//
// Vì sao cookie thay cho JWT in-memory: token nằm trong biến JS thì reload mất phiên,
// và XSS đọc được. HttpOnly đảo ngược cả hai: sống qua reload, mà JS KHÔNG chạm tới.
// Đánh đổi đã biết: cookie tự gửi kèm ⇒ mở bề mặt CSRF → vá bằng SameSite=Strict (C1)
// + kiểm Origin (C6). Xem docs/adr/0003-frontend-react-vite.md §A.4/§A.5.
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE, TOKEN_TTL_SEC } from "./auth";
import type { AppEnv } from "./types";

// Re-export: session.ts là bề mặt công khai của hợp đồng cookie; hằng số nằm ở auth.ts
// chỉ để phụ thuộc chạy một chiều (xem chú thích tại auth.ts).
export { SESSION_COOKIE };

/** Method KHÔNG đổi trạng thái → miễn kiểm Origin (C6c). */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Chỉ gắn Secure khi thực sự chạy HTTPS. Dev qua http://localhost mà gắn Secure thì
 * trình duyệt BỎ cookie ⇒ hỏng dev cục bộ trong khi production vẫn chạy (C1b). */
function isHttps(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === "https:";
}

/** Đặt cookie phiên sau khi đăng nhập thành công (C1 + C5).
 * `Max-Age` khớp ĐÚNG `TOKEN_TTL_SEC` — cookie và JWT hết hạn cùng lúc, không lệch. */
export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, // JS không đọc được → XSS không exfil được token.
    secure: isHttps(c),
    sameSite: "Strict", // Khả thi vì web+api CÙNG origin (ADR §A.2).
    // Path=/ chứ KHÔNG /auth: trình duyệt thấy /api/auth/*, front-door mới bóc /api
    // (apps/web/worker.ts). Đặt /auth ⇒ cookie không bao giờ được gửi (C5).
    path: "/",
    maxAge: TOKEN_TTL_SEC,
  });
}

/** Xoá cookie phiên khi đăng xuất (C4). Không có bước này thì "Đăng xuất" chỉ dọn
 * phía client còn cookie vẫn sống — tức là KHÔNG thực sự đăng xuất. */
export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isHttps(c), sameSite: "Strict" });
}

/** Đọc token phiên từ cookie (C3). */
export function readSessionCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/** C6 — chặn CSRF: cookie tự động gửi kèm mọi request, kể cả request do trang của kẻ
 * tấn công khởi tạo. `SameSite=Strict` đã chặn gần trọn vẹn; đây là lớp thứ hai (phòng
 * thủ nhiều lớp), rẻ vì API chỉ phục vụ same-origin (ADR §A.2).
 *
 * Quy tắc: method đổi trạng thái + có `Origin` khác host của request ⇒ 403.
 * KHÔNG có `Origin` ⇒ cho qua: client không-trình-duyệt (curl, test, service binding)
 * không gửi Origin, và cũng không mang cookie ngầm nên không phải vector CSRF.
 *
 * Cố tình KHÔNG dùng `hono/csrf`: middleware đó chỉ chặn request trông giống form
 * (content-type form/text), bỏ qua JSON vì tin rằng preflight CORS đã chặn. Ở đây ta
 * không muốn phụ thuộc hành vi preflight của trình duyệt — chặn thẳng mọi content-type. */
export const requireSameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header("Origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return c.json({ error: "forbidden_origin" }, 403); // Origin dị dạng → từ chối.
    }
    if (originHost !== new URL(c.req.url).host) {
      return c.json({ error: "forbidden_origin" }, 403);
    }
  }
  return next();
};

// U19 — Front-door Cổng Admin. Phục vụ SPA quản trị + proxy `/api/admin/*` → `vat-api`.
//
// ĐỐI XỨNG VỚI apps/web/worker.ts, VÀ ĐÓ LÀ TOÀN BỘ Ý ĐỒ:
//   apps/web  (hostname khách)  → CHẶN /api/admin/*, cho phần còn lại
//   apps/admin (hostname admin) → CHO /api/admin/*, CHẶN phần còn lại
// Hai cửa, hai miền, không cửa nào với sang miền kia. Nếu cookie khách bằng cách nào đó
// tới được origin admin thì nó cũng vô dụng: đường tới `/invoices` bị đóng ngay ở đây,
// trước khi chạm `vat-api`.
//
// VÌ SAO PHẢI PROXY chứ không để SPA gọi thẳng `vatengine.tourdao.vn/api`: phiên admin đi
// bằng cookie `SameSite=Strict` do `apps/api` đặt. Cookie đó chỉ được trình duyệt gửi kèm
// khi request CÙNG ORIGIN với trang. SPA ở `adminvatengine.tourdao.vn` gọi sang hostname
// khác ⇒ cookie không bao giờ được gửi ⇒ phiên hỏng im lặng. Proxy ở đây làm hai origin
// mỗi bên tự khép kín — và nhờ vậy hai hũ cookie tách nhau VẬT LÝ, không chỉ theo quy ước.
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API: { fetch(request: Request): Promise<Response> };
}

// CSP tối thiểu cho SPA admin: chỉ tự phục vụ, chỉ gọi API same-origin. Không CDN, không
// nhúng ngoài — bề mặt của khu vực quản trị phải hẹp hơn app khách, không rộng bằng.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  // `unsafe-inline` cho style: Vite nhúng style tag lúc chạy. Không mở cho script.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("content-security-policy", CSP);
  out.headers.set("x-frame-options", "DENY");
  out.headers.set("x-content-type-options", "nosniff");
  out.headers.set("referrer-policy", "no-referrer");
  // Khu vực quản trị KHÔNG được lập chỉ mục hay lưu bản sao ở proxy trung gian.
  out.headers.set("x-robots-tag", "noindex, nofollow");
  return out;
}

function khongTimThay(): Response {
  return withSecurityHeaders(
    new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      // ALLOWLIST, không phải denylist. Một endpoint khách MỚI thêm vào `vat-api` sau này
      // sẽ mặc định KHÔNG tới được từ origin admin — không cần ai nhớ đi cập nhật danh
      // sách chặn. Đây là khác biệt quan trọng so với cách làm ngược lại.
      if (url.pathname !== "/api/admin" && !url.pathname.startsWith("/api/admin/")) {
        return khongTimThay();
      }
      // Bóc `/api`: `/api/admin/tenants` → vat-api thấy `/admin/tenants`.
      const target = new URL(request.url);
      target.pathname = url.pathname.replace(/^\/api/, "") || "/";
      return withSecurityHeaders(await env.API.fetch(new Request(target.toString(), request)));
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};

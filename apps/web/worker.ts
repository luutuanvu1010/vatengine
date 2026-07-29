// Front-door vat-web (production same-origin) — ADR-0001 + docs/plans/production-deploy.md §3.
// Phục vụ SPA tĩnh + proxy `/api/*` → `vat-api` qua service binding (strip tiền tố `/api`).
// Same-origin ⇒ KHÔNG cần CORS. `vat-api` giữ nguyên path gốc (`/auth`, `/invoices`, …).
// Type structural tối giản (không phụ thuộc @cloudflare/workers-types) để không vướng tsc app.
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
interface Env {
  ASSETS: Fetcher; // binding tới static assets (SPA, có not_found_handling = SPA fallback)
  API: Fetcher; // service binding tới Worker vat-api
}

// H-A.6 — CSP khớp ĐÚNG nhu cầu SPA (đã kiểm chứng qua build 2026-07-15): script &
// style & font & ảnh đều same-origin `/assets/*`; KHÔNG inline script trong index.html
// (→ script-src 'self', không nới lỏng); inline `style=` của React (→ style-src
// 'unsafe-inline'); captcha `<img src="data:image/svg+xml…">` (→ img-src data:);
// gọi API same-origin `/api` (→ connect-src 'self'). Chặt phần còn lại.
//
// U33 — NỚI ĐÚNG HAI CHỈ THỊ cho Cloudflare Turnstile, không hơn:
//   script-src: tải `challenges.cloudflare.com/turnstile/v0/api.js`
//   frame-src : widget tự dựng một <iframe> tới cùng máy chủ đó
// `frame-src` trước đây không được liệt kê nên rơi về `default-src 'self'` — thiếu nó thì
// script tải được nhưng ô xác minh không bao giờ hiện, và vì fail-closed, KHÔNG AI đăng ký
// hay đăng nhập được. Không nới `connect-src`: iframe là origin riêng, lưu lượng xác minh
// của nó không chịu CSP của trang này.
//
// Nới ở ĐÂY (cổng khách) và CHỈ ở đây. `apps/admin` không có Turnstile — nó nằm sau
// Cloudflare Access — nên CSP của nó giữ nguyên chặt.
const NGUON_TURNSTILE = "https://challenges.cloudflare.com";
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${NGUON_TURNSTILE}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  `frame-src ${NGUON_TURNSTILE}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

// Bọc security header lên MỌI phản hồi (asset lẫn proxy /api). Tạo Response mới để
// header bất biến từ upstream vẫn ghi đè được. HSTS đặt ở TẦNG ZONE Cloudflare (chỉ
// bật trên HTTPS, phủ cả redirect) — không đặt ở đây (production-deploy.md).
function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("Content-Security-Policy", CSP);
  out.headers.set("X-Frame-Options", "DENY");
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // U37c — ĐƯỜNG TẢI CÔNG KHAI `/tai/<token>`, chuyển thẳng tới vat-api giữ nguyên path.
    //
    // Vì sao đi qua front-door này thay vì gắn `docs.tourdao.vn` vào vat-api: gắn thẳng sẽ
    // phơi TOÀN BỘ route của vat-api ra công cộng trên hostname đó — mở rộng bề mặt tấn
    // công để đổi lấy đúng một đường tải. Ở đây chỉ đúng tiền tố `/tai/` lọt qua.
    if (url.pathname.startsWith("/tai/")) {
      return withSecurityHeaders(await env.API.fetch(new Request(url.toString(), request)));
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      // U18 — CỬA KHÁCH KHÔNG DẪN TỚI MIỀN QUẢN TRỊ.
      //
      // `apps/api` không có route công khai (`workers_dev:false`, không `routes`) nên chỉ
      // tới được qua service binding NÀY. Hệ quả dễ bỏ sót: front-door đang đứng trên
      // hostname của KHÁCH (`vatengine.tourdao.vn`), nên nếu không chặn ở đây thì
      // `https://vatengine.tourdao.vn/api/admin/auth/login` đi thẳng tới đường đăng nhập
      // super-admin — công khai, không lớp nào phía trước.
      //
      // Cloudflare Access (P5) được chốt cho Cổng Admin, nhưng nó gắn trên subdomain
      // RIÊNG của U19 (`adminvatengine.tourdao.vn`); nó KHÔNG chi phối hostname khách.
      // Vì vậy việc đóng cửa này phải nằm ở đây, trong code, chứ không ở cấu hình biên:
      // fail-closed kể cả khi một rule WAF bị sửa nhầm hoặc chưa kịp tạo.
      //
      // 404 (không phải 403): với người dùng của cửa này, `/admin/*` đơn giản là không
      // tồn tại — không xác nhận cho ai rằng có một miền quản trị đang ở phía sau.
      if (url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/")) {
        return withSecurityHeaders(
          new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      // Bóc `/api` rồi chuyển tiếp: `/api/auth/login` → vat-api thấy `/auth/login`.
      const target = new URL(request.url);
      target.pathname = url.pathname.replace(/^\/api/, "") || "/";
      return withSecurityHeaders(await env.API.fetch(new Request(target.toString(), request)));
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};

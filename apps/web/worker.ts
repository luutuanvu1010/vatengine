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
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
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
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      // Bóc `/api` rồi chuyển tiếp: `/api/auth/login` → vat-api thấy `/auth/login`.
      const target = new URL(request.url);
      target.pathname = url.pathname.replace(/^\/api/, "") || "/";
      return withSecurityHeaders(await env.API.fetch(new Request(target.toString(), request)));
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};

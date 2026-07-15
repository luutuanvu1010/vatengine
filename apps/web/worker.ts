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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      // Bóc `/api` rồi chuyển tiếp: `/api/auth/login` → vat-api thấy `/auth/login`.
      const target = new URL(request.url);
      target.pathname = url.pathname.replace(/^\/api/, "") || "/";
      return env.API.fetch(new Request(target.toString(), request));
    }
    return env.ASSETS.fetch(request);
  },
};

// Dựng ứng dụng Hono (U6). Tách khỏi index.ts để test tiêm được `deps.getDb` (PGlite)
// mà không cần Hyperdrive thật. /health miễn xác thực (security.md); /invoices* gắn JWT
// trong sub-router (routes/invoices.ts).
import { Hono } from "hono";
import { invoicesRoutes } from "./routes/invoices";
import type { AppDeps, AppEnv } from "./types";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  // Health-check: endpoint duy nhất miễn xác thực (security.md).
  app.get("/health", (c) =>
    c.json({ status: "ok", service: "vat-api", env: c.env.ENVIRONMENT ?? "dev" }),
  );

  app.route("/invoices", invoicesRoutes(deps));

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}

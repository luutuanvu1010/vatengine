// Dựng ứng dụng Hono (U6). Tách khỏi index.ts để test tiêm được `deps.getDb` (PGlite)
// mà không cần Hyperdrive thật. /health miễn xác thực (security.md); /invoices* gắn JWT
// trong sub-router (routes/invoices.ts).
import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { exportsRoutes } from "./routes/exports";
import { invoicesRoutes } from "./routes/invoices";
import { reconcileRoutes } from "./routes/reconcile";
import { taxAccountsRoutes } from "./routes/taxAccounts";
import type { AppDeps, AppEnv } from "./types";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  // Health-check: endpoint duy nhất miễn xác thực (security.md).
  app.get("/health", (c) =>
    c.json({ status: "ok", service: "vat-api", env: c.env.ENVIRONMENT ?? "dev" }),
  );

  // U8: phát hành token — NGOÀI requireTenant (login xảy ra trước khi có token/tenant).
  app.route("/auth", authRoutes(deps));

  app.route("/invoices", invoicesRoutes(deps));
  // U7: kết xuất (POST /exports) + tải (GET /exports/:id) — đều sau requireTenant.
  app.route("/exports", exportsRoutes(deps));
  // U10: đối chiếu (GET /reconcile) — đọc-only, sau requireTenant + RBAC.
  app.route("/reconcile", reconcileRoutes(deps));
  // U14: quản lý tài khoản thuế (POST /tax-accounts, ...) — sau requireTenant + RBAC.
  app.route("/tax-accounts", taxAccountsRoutes(deps));

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}

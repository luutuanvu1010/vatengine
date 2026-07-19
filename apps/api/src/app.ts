// Dựng ứng dụng Hono (U6). Tách khỏi index.ts để test tiêm được `deps.getDb` (PGlite)
// mà không cần Hyperdrive thật. /health miễn xác thực (security.md); /invoices* gắn JWT
// trong sub-router (routes/invoices.ts).
import { maskSensitive } from "@vat/crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRoutes } from "./routes/auth";
import { backfillRoutes } from "./routes/backfill";
import { exportsRoutes } from "./routes/exports";
import { invoicesRoutes } from "./routes/invoices";
import { meRoutes } from "./routes/me";
import { reconcileRoutes } from "./routes/reconcile";
import { taxAccountsRoutes } from "./routes/taxAccounts";
import { requireSameOrigin } from "./session";
import type { AppDeps, AppEnv } from "./types";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  // Health-check: endpoint duy nhất miễn xác thực (security.md).
  app.get("/health", (c) =>
    c.json({ status: "ok", service: "vat-api", env: c.env.ENVIRONMENT ?? "dev" }),
  );

  // ADR-0003 Amendment #1 (C6) — chặn CSRF cho MỌI method đổi trạng thái, đặt TRƯỚC mọi
  // route nghiệp vụ. Từ khi phiên đi bằng cookie, trình duyệt tự đính cookie vào cả
  // request do trang của kẻ tấn công khởi tạo; SameSite=Strict đã chặn gần trọn vẹn và
  // đây là lớp thứ hai. Phủ cả /auth/login (chặn "login CSRF" — ép nạn nhân đăng nhập
  // vào tài khoản của kẻ tấn công).
  app.use("*", requireSameOrigin);

  // U8: phát hành token — NGOÀI requireTenant (login xảy ra trước khi có token/tenant).
  app.route("/auth", authRoutes(deps));

  // A1 (U15): hồ sơ tenant + vai — đọc-only, sau requireTenant (cả 3 vai).
  app.route("/me", meRoutes(deps));

  app.route("/invoices", invoicesRoutes(deps));
  // U7: kết xuất (POST /exports) + tải (GET /exports/:id) — đều sau requireTenant.
  app.route("/exports", exportsRoutes(deps));
  // U10: đối chiếu (GET /reconcile) — đọc-only, sau requireTenant + RBAC.
  app.route("/reconcile", reconcileRoutes(deps));
  // U14: quản lý tài khoản thuế (POST /tax-accounts, ...) — sau requireTenant + RBAC.
  app.route("/tax-accounts", taxAccountsRoutes(deps));
  // U22 B6: theo dõi tiến độ backfill (GET /backfill/:id) — đọc-only, sau requireTenant.
  app.route("/backfill", backfillRoutes(deps));

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  // H-A.6 — cổng lỗi cuối: lỗi CHƯA BẮT ở handler → 500 {error:'internal'} (hình
  // dạng JSON nhất quán, KHÔNG lộ message/stack cho client). HTTPException (nếu code
  // nào chủ động ném) giữ nguyên status/response của nó. Log server-side ĐÃ MASK
  // (che token/mật khẩu/JWT trong chuỗi lỗi — security.md) để vẫn chẩn đoán được.
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error("[vat-api] unhandled", maskSensitive({ name: err.name, message: err.message }));
    return c.json({ error: "internal" }, 500);
  });

  return app;
}

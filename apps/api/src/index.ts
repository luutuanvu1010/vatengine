// Worker API — điểm vào tầng ứng dụng (stateless). ADR-0001.
// U0: chỉ dựng khung + health-check. Route nghiệp vụ thêm dần ở U6–U7.

import { Hono } from "hono";

export interface Env {
  // Binding sẽ thêm dần theo lộ trình (Hyperdrive, KV, R2, Queues, Durable Objects).
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Health-check: endpoint duy nhất được miễn xác thực (xem security.md).
app.get("/health", (c) =>
  c.json({ status: "ok", service: "vat-api", env: c.env.ENVIRONMENT ?? "dev" }),
);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;

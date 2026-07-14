import { defineConfig } from "vitest/config";

// U9: unit (logic thuần — lịch, phân loại job, rate-limit/circuit-breaker; offline)
// + integration (PGlite — Postgres WASM trong Node, đi qua sync() thật + recorder
// thật). Cả hai offline → vào `make test` (testing.md). KHÔNG dùng vitest-pool-workers:
// PGlite/pg không chạy trong workerd; logic được cô lập khỏi runtime binding qua
// tiêm phụ thuộc, nên Cron/Queue/DO chỉ là wiring mỏng (loại khỏi ngưỡng phủ).
export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Wiring runtime thuần (cần binding Cloudflare thật — kiểm chứng khi deploy,
      // giống apps/api/db.ts): index.ts (scheduled/queue handlers), deps.ts (dựng
      // deps production), tenantLimiter.ts (Durable Object), db.ts (Hyperdrive),
      // types.ts (chỉ kiểu). Logic nghiệp vụ (schedule/runJob/rateLimiter/recorder)
      // vẫn bị ngưỡng phủ ràng buộc.
      exclude: [
        "src/index.ts",
        "src/deps.ts",
        "src/tenantLimiter.ts",
        // GIÁM SÁT: DO health runtime (nạp/lưu state) — logic gộp verdict đã phủ ở
        // health.test.ts/egressProbe.test.ts; DO chỉ wiring mỏng, kiểm khi deploy.
        "src/egressHealth.ts",
        "src/db.ts",
        "src/types.ts",
      ],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

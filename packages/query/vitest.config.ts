import { defineConfig } from "vitest/config";

// U6: unit (Zod schema thuần, offline) + integration (PGlite — Postgres WASM trong
// Node, KHÔNG Docker/mạng). Cả hai vào `make test` vì đều offline (testing.md).
// KHÔNG dùng vitest-pool-workers: PGlite không chạy trong workerd.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts là wiring thuần (chỉ re-export) — loại khỏi ngưỡng phủ (testing.md).
      exclude: ["src/index.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

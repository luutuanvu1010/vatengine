import { defineConfig } from "vitest/config";

// U6: unit (Hono app.request + auth JWT, offline) + integration (PGlite — Postgres
// WASM trong Node, đi qua route thật với db tiêm). Cả hai offline → vào `make test`
// (testing.md). Chưa cần vitest-pool-workers: chưa chạm binding runtime thật.
export default defineConfig({
  test: {
    // CHỈ unit + integration (offline). KHÔNG gộp `test/contract/**` (gọi mạng thật
    // GDT) vào `make test` — nhóm contract chạy riêng qua `test:contract` (testing.md).
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Wiring/kiểu thuần — loại khỏi ngưỡng phủ (testing.md "trừ wiring thuần"):
      // index.ts (compose default), db.ts (pg/Hyperdrive prod, test tiêm PGlite),
      // types.ts (chỉ kiểu).
      exclude: ["src/index.ts", "src/db.ts", "src/types.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

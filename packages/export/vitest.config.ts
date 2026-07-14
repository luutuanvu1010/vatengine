import { defineConfig } from "vitest/config";

// U7: unit (encoder thuần: columns/csv/xlsx, offline) + integration (rows — PGlite,
// Postgres WASM trong Node). Cả hai offline → vào `make test` (testing.md). KHÔNG dùng
// vitest-pool-workers: PGlite không chạy trong workerd; xlsx dùng fflate thuần JS chạy
// được cả hai runtime (spike workerd riêng ở spikes/xlsx-workers — không mạng, không DB).
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

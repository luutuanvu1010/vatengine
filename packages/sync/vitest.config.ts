import { defineConfig } from "vitest/config";

// U5: unit (map thuần, offline, mock adapter) + integration (PGlite — Postgres WASM
// chạy trong Node, KHÔNG Docker/mạng). Cả hai vào `make test` vì đều offline
// (xem .claude/rules/testing.md). KHÔNG dùng vitest-pool-workers: PGlite/pg không
// chạy trong workerd.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts là wiring thuần (chỉ re-export) — loại khỏi ngưỡng phủ theo
      // .claude/rules/testing.md ("trừ wiring thuần").
      exclude: ["src/index.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

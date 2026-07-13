import { defineConfig } from "vitest/config";

// U4: unit (introspect lược đồ Drizzle, offline) + integration (PGlite — Postgres
// biên dịch WASM, chạy trong Node, KHÔNG cần Docker/mạng). Cả hai vào `make test`
// vì đều offline (xem .claude/rules/testing.md: make test = unit + integration).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts + schema/index.ts là wiring thuần (chỉ re-export) — loại khỏi
      // ngưỡng phủ theo .claude/rules/testing.md ("trừ wiring thuần").
      exclude: ["src/index.ts", "src/schema/index.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

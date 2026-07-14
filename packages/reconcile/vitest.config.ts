import { defineConfig } from "vitest/config";

// U10: unit (phân loại thuần, offline) + integration (PGlite — Postgres WASM trong Node,
// KHÔNG Docker/mạng) + contract (mềm, KHÔNG mạng). Tất cả offline → vào `make test`
// (testing.md). KHÔNG dùng vitest-pool-workers: PGlite không chạy trong workerd.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts (re-export) + types.ts (chỉ khai báo kiểu, biên dịch ra rỗng) — không có
      // mã chạy → loại khỏi ngưỡng phủ (testing.md).
      exclude: ["src/index.ts", "src/types.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

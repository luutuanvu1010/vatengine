import { defineConfig } from "vitest/config";

// U5: unit (map thuần, offline, mock adapter) + integration (PGlite — Postgres WASM
// chạy trong Node, KHÔNG Docker/mạng). Cả hai vào `make test` vì đều offline
// (xem .claude/rules/testing.md). KHÔNG dùng vitest-pool-workers: PGlite/pg không
// chạy trong workerd.
export default defineConfig({
  test: {
    // U17a — nới timeout cho test integration dùng PGlite. Lý do ĐO ĐƯỢC (2026-07-18):
    // các hook beforeEach áp TOÀN BỘ migration lên một PGlite mới cho mỗi test; sau khi
    // migration 0007 thêm 3 bảng + RLS + trigger + backfill + FK, lần áp đầu trong một
    // isolate lạnh tốn ~7,1s (biên dịch WASM + 8 migration). Trần mặc định 10s ⇒ đỏ
    // ngẫu nhiên ("Hook timed out in 10000ms"). Chi phí THẬT của việc áp migration thật,
    // không phải test hỏng. Nếu số này còn tăng, hãy tái dùng một DB đã migrate thay vì
    // nới tiếp.
    hookTimeout: 30_000,
    testTimeout: 30_000,
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

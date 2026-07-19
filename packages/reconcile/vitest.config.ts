import { defineConfig } from "vitest/config";

// U10: unit (phân loại thuần, offline) + integration (PGlite — Postgres WASM trong Node,
// KHÔNG Docker/mạng) + contract (mềm, KHÔNG mạng). Tất cả offline → vào `make test`
// (testing.md). KHÔNG dùng vitest-pool-workers: PGlite không chạy trong workerd.
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
      // index.ts (re-export) + types.ts (chỉ khai báo kiểu, biên dịch ra rỗng) — không có
      // mã chạy → loại khỏi ngưỡng phủ (testing.md).
      exclude: ["src/index.ts", "src/types.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

import { defineConfig } from "vitest/config";

// U6: unit (Hono app.request + auth JWT, offline) + integration (PGlite — Postgres
// WASM trong Node, đi qua route thật với db tiêm). Cả hai offline → vào `make test`
// (testing.md). Chưa cần vitest-pool-workers: chưa chạm binding runtime thật.
export default defineConfig({
  test: {
    // CHỈ unit + integration (offline). KHÔNG gộp `test/contract/**` (gọi mạng thật
    // GDT) vào `make test` — nhóm contract chạy riêng qua `test:contract` (testing.md).
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    // U17a — nới timeout hook/test cho nhóm integration. Lý do ĐO ĐƯỢC (2026-07-18):
    // `freshDb()` áp TOÀN BỘ migration lên một PGlite mới cho MỖI test, và sau khi
    // migration 0007 thêm 3 bảng + RLS + trigger + backfill + FK, lần gọi đầu trong một
    // isolate lạnh tốn ~7,1s (biên dịch WASM + 8 migration), các lần sau ~1,6-2,4s.
    // Mặc định vitest là 10s cho hook ⇒ chạm trần và ĐỎ NGẪU NHIÊN (quan sát:
    // me.route.test.ts "Hook timed out in 10000ms" khi chạy riêng lẻ, nhưng xanh khi
    // chạy cả suite). Đây là chi phí THẬT của việc áp migration thật, không phải test
    // hỏng — nới trần thay vì bỏ qua. Nếu con số này còn tăng, hãy tái dùng một DB đã
    // migrate thay vì nới tiếp.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Wiring/kiểu thuần — loại khỏi ngưỡng phủ (testing.md "trừ wiring thuần"):
      // index.ts (compose default), db.ts (pg/Hyperdrive prod, test tiêm PGlite),
      // storage.ts (R2 prod, test tiêm R2 giả), types.ts (chỉ kiểu). H-A.5b:
      // loginLimiterDO.ts (Durable Object runtime — cần workerd thật; logic THUẦN đã
      // phủ ở loginLimiter.test.ts, giống tenantLimiter ở sync-worker).
      exclude: [
        "src/index.ts",
        "src/db.ts",
        "src/storage.ts",
        "src/types.ts",
        "src/loginLimiterDO.ts",
        // U22 — DO wiring backfill (runtime workerd; logic thuần đã phủ ở
        // backfillTracker.test.ts, giống loginLimiterDO).
        "src/backfillTrackerDO.ts",
        // U17b — DO wiring signup (runtime workerd; logic thuần đã phủ ở
        // signupLimiter.test.ts, giống loginLimiterDO).
        "src/signupLimiterDO.ts",
      ],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

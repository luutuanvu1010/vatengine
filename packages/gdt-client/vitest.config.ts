import { defineConfig } from "vitest/config";

// Giống apps/api (U0): unit + contract chạy trên Node thuần, không cần workerd —
// gdt-client không dùng binding Workers, chỉ fetch() chuẩn. Xem .claude/rules/testing.md.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts là wiring thuần (chỉ re-export) — loại khỏi ngưỡng phủ theo
      // .claude/rules/testing.md ("trừ wiring thuần").
      exclude: ["src/index.ts"],
      // Ngưỡng tối thiểu tầng nghiệp vụ theo .claude/rules/testing.md.
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

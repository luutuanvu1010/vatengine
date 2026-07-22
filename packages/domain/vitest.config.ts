import { defineConfig } from "vitest/config";

// U-K1: Registry miền hoá đơn — TypeScript thuần, không phụ thuộc runtime. Offline.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Test component/unit offline (jsdom) — vào `make test` (testing.md). KHÔNG gọi mạng:
// adminApiClient được mock ở test.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/features/**/*.tsx", "src/features/**/*.ts"],
      exclude: ["src/main.tsx", "src/**/*.css", "src/vite-env.d.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

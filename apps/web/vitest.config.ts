import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Test component/unit offline (jsdom) — vào `make test` (testing.md). KHÔNG gọi mạng
// thật: apiClient được mock ở test. Ngưỡng phủ ≥80% cho tầng logic UI (format/mapping/
// guard); loại khung thuần (main.tsx, styles) khỏi ngưỡng.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/features/**/*.tsx",
        // U22 B7 — hook/logic thuần .ts dưới features/ (vd useRangeBackfill) cũng phải vào
        // ngưỡng phủ, không chỉ .tsx (nếu không cổng coverage MÙ với logic nghiệp vụ).
        "src/features/**/*.ts",
        "src/components/**/*.tsx",
      ],
      exclude: ["src/main.tsx", "src/**/*.css", "src/vite-env.d.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

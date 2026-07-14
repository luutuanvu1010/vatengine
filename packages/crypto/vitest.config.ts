import { defineConfig } from "vitest/config";

// U12: package thuần bảo mật (envelope encryption + masking). Chỉ WebCrypto
// (`crypto.subtle`) — chạy được trong Node lẫn workerd, KHÔNG cần PGlite/mạng →
// toàn bộ `unit`, vào `make test` (testing.md).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts chỉ re-export → không có mã chạy, loại khỏi ngưỡng phủ (testing.md).
      exclude: ["src/index.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});

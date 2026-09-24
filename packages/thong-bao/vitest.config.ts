import { defineConfig } from "vitest/config";

// U43: package thông báo cho NGƯỜI THẬT (Telegram). Chỉ fetch() chuẩn — chạy Node lẫn
// workerd, không cần mạng thật trong test (mock fetch) → toàn bộ `unit`, vào `make test`.
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

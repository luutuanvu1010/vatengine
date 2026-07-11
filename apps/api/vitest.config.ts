import { defineConfig } from "vitest/config";

// U0: unit test chạy trên Node thuần — Hono `app.request()` không cần workerd.
// Khi cần binding thật (D1/KV/Durable Objects/Hyperdrive) sẽ chuyển sang
// @cloudflare/vitest-pool-workers (Miniflare) với ma trận phiên bản đã ghim (U4+).
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
  },
});

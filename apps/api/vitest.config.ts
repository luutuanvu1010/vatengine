import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Chạy test bên trong runtime Workers (Miniflare) — xem testing.md.
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPA client-render → build tĩnh cho Cloudflare Workers Static Assets (ADR-0003).
// Base API đọc từ biến build `VITE_API_BASE` (mặc định same-origin "/").
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // H-A.6 — KHÔNG phát sourcemap production: Static Assets phục vụ mọi file trong
    // dist, nên .map công khai sẽ lộ toàn bộ mã nguồn. Dev vẫn debug được (dev server
    // dùng nguồn gốc, không phụ thuộc build.sourcemap).
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});

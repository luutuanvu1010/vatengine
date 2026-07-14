import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPA client-render → build tĩnh cho Cloudflare Workers Static Assets (ADR-0003).
// Base API đọc từ biến build `VITE_API_BASE` (mặc định same-origin "/").
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});

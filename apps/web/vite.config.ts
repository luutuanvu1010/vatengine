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
    // ADR-0003 Amendment #1 (C7) — dev PHẢI same-origin như production. Phiên đi bằng
    // cookie `SameSite=Strict`: nếu SPA ở :5173 gọi thẳng API ở :8787 thì đó là hai
    // origin khác nhau ⇒ trình duyệt KHÔNG gửi cookie ⇒ dev cục bộ hỏng trong khi
    // production vẫn chạy tốt (bẫy rất khó chẩn đoán). Proxy này tái hiện đúng vai trò
    // front-door `apps/web/worker.ts`: bóc tiền tố `/api` rồi chuyển cho vat-api.
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: false, // Giữ Origin gốc để lớp kiểm CSRF (C6) thấy đúng same-origin.
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

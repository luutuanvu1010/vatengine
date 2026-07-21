import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPA client-render → build tĩnh cho Cloudflare Workers Static Assets (ADR-0003).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // Không phát sourcemap production: Static Assets phục vụ MỌI file trong dist nên .map
    // sẽ công khai toàn bộ mã nguồn — với khu vực quản trị thì càng không.
    sourcemap: false,
  },
  server: {
    // Cổng khác apps/web (5173) để chạy song song hai SPA lúc dev.
    port: 5174,
    // ADR-0003 Amendment #1 (C7) — dev PHẢI same-origin như production. Phiên admin đi
    // bằng cookie `SameSite=Strict`: SPA ở :5174 gọi thẳng API ở :8787 là hai origin khác
    // nhau ⇒ trình duyệt KHÔNG gửi cookie ⇒ dev hỏng trong khi production vẫn chạy. Proxy
    // này tái hiện đúng vai trò front-door `worker.ts`.
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: false, // Giữ Origin gốc để lớp kiểm CSRF (C6) thấy đúng same-origin.
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

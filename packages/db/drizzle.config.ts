import { defineConfig } from "drizzle-kit";

// Cấu hình drizzle-kit: SINH (`generate`) + ÁP (`migrate`) migration cho Postgres.
// - `generate` đọc lược đồ ở ./src/schema, xuất SQL versioned vào ./migrations
//   (KHÔNG cần kết nối DB).
// - `migrate` áp migration lên DATABASE_URL (kết nối TRỰC TIẾP từ CLI/CI — máy dev,
//   KHÔNG qua Hyperdrive; binding Hyperdrive của Worker là U6).
// DATABASE_URL nạp từ .dev.vars (local, đã .gitignore) hoặc secret CI — tuyệt đối
// KHÔNG hard-code connection string (xem .claude/rules/security.md).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});

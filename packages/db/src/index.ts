// Package dữ liệu `@vat/db` — lược đồ Drizzle (Postgres/Hyperdrive, ADR-0001) +
// khóa tự nhiên + ngữ cảnh tenant cho RLS. U5 (upsert idempotent) và U6 (API tra
// cứu) dựng lên tầng này.
export * from "./naturalKey";
export * from "./schema";
export * from "./tenantContext";

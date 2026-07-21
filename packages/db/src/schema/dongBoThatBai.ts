import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// H-B.6 — Sổ bền job đồng bộ rơi vào dead-letter (vat-sync-dlq). Tenant-scoped (RLS)
// vì message DLQ luôn mang tenantId (multi-tenant.md). payload KHÔNG chứa bí mật
// (chỉ tenantId/period/direction/hoaDonId/bpAttempt — security.md OK). Phát lại THỦ
// CÔNG (endpoint sau Cloudflare Access) — con người giữ quyền quyết định (Hiến pháp).
export const TRANG_THAI_DA_DAU = "da_dau";
export const TRANG_THAI_DA_PHAT_LAI = "da_phat_lai";
export const TRANG_THAI_BO_QUA = "bo_qua";

export const dongBoThatBai = pgTable(
  "dong_bo_that_bai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    loai: text("loai").notNull(), // 'header' | 'detail'
    payload: jsonb("payload").notNull(),
    lyDo: text("ly_do").notNull(), // 'max_retries' | 'backpressure_cap' | 'unexpected'
    soLan: integer("so_lan"),
    trangThai: text("trang_thai").notNull().default(TRANG_THAI_DA_DAU),
    taoLuc: timestamp("tao_luc", { withTimezone: true }).notNull().defaultNow(),
    phatLaiLuc: timestamp("phat_lai_luc", { withTimezone: true }),
  },
  (t) => [tenantIsolationPolicy("dong_bo_that_bai", t.tenantId)],
);

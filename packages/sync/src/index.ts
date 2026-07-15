// Package đồng bộ `@vat/sync` (U5) — dịch vụ upsert idempotent hóa đơn: dựng trên
// adapter `@vat/gdt-client` (U2) + schema `@vat/db` (U4). U6 (API) và U9 (nền) gọi lại.
export { mapInvoiceRowToHoaDon } from "./mapInvoice";
export { sync, type InvoiceChange, type SyncOptions, type SyncResult } from "./sync";
// Contract job đồng bộ nền + lịch kỳ (dùng chung producer/consumer — U9 + "Đồng bộ ngay").
export {
  type SyncJobMessage,
  type PeriodWindow,
  currentPeriodWindow,
  buildSyncMessages,
} from "./syncJob";

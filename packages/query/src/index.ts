// Package tra cứu `@vat/query` (U6) — tra cứu + lọc + tổng hợp hóa đơn ĐÃ đồng bộ
// (đọc DB, KHÔNG gọi GDT). Dựng trên schema `@vat/db` (U4). apps/api nối thành REST.
export {
  INVOICE_DIRECTIONS,
  INVOICE_SOURCES,
  buildWhere,
  invoiceFilterSchema,
  pageSchema,
  type InvoiceFilter,
  type Page,
} from "./filters";
export { getInvoiceById, getInvoiceLines, type DongHangHoaRow } from "./getInvoice";
export { lineSummarySelect, type LineSummary } from "./lineSummary";
export {
  listInvoices,
  type HoaDonRow,
  type InvoiceListRow,
  type InvoiceListResult,
} from "./listInvoices";
export {
  summarizeInvoices,
  type ChieuSummary,
  type InvoiceSummary,
  type MoneyTotals,
} from "./summarize";

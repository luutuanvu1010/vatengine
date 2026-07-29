// Package tra cứu `@vat/query` (U6) — tra cứu + lọc + tổng hợp hóa đơn ĐÃ đồng bộ
// (đọc DB, KHÔNG gọi GDT). Dựng trên schema `@vat/db` (U4). apps/api nối thành REST.
export {
  INVOICE_DIRECTIONS,
  INVOICE_SOURCES,
  buildWhere,
  MAX_EXPORT_IDS,
  exportSelectionSchema,
  buildOrderBy,
  sortSchema,
  SORT_BY_VALUES,
  invoiceFilterSchema,
  pageSchema,
  type InvoiceSelection,
  type InvoiceSort,
  type SortBy,
  type InvoiceFilter,
  type Page,
} from "./filters";
export { getInvoiceById, getInvoiceLines, type DongHangHoaRow } from "./getInvoice";
// U37b — danh sách khách hàng để chọn khi tải hóa đơn gốc (chỉ chiều bán ra).
export {
  listKhachHang,
  type KhachHang,
  type KhachHangResult,
  type ListKhachHangOptions,
} from "./khachHang";
export {
  listInvoiceChanges,
  markInvoiceChangesRead,
  invoiceChangeFilterSchema,
  type InvoiceChangeFilter,
  type InvoiceChangeRow,
  type InvoiceChangeListResult,
} from "./invoiceChanges";
export { lineSummarySelect, type LineSummary, type HangHoaTomTat } from "./lineSummary";
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

// Package kết xuất `@vat/export` (U7) — hóa đơn ĐÃ đồng bộ → file xlsx/csv theo mẫu cột
// chuẩn (đọc DB qua @vat/query, KHÔNG gọi GDT). apps/api nối thành endpoint + ghi R2.
export {
  EXPORT_COLUMNS,
  cellFor,
  formatDate,
  type ColumnKind,
  type ExportCell,
  type ExportColumn,
} from "./columns";
export { type RenderColumn, nativeRenderColumns } from "./columns";
// U23-B — cột dòng hàng (nguồn duy nhất cho sheet/khối "Chi tiết dòng hàng").
export {
  LINE_DETAIL_SECTION,
  type LineDetailRow,
  congThapPhan,
  flatRenderColumns,
} from "./columns";
export {
  CSV_BOM,
  csvHeaderLine,
  csvRowLine,
  csvStream,
  csvStreamWithLines,
  guardCsvText,
  toCsv,
} from "./csv";
export { toXlsx, toXlsxFromBatches, toXlsxWithLinesFromBatches } from "./xlsx";
export { DEFAULT_PAGE_SIZE, iterateInvoices, type ExportRow } from "./rows";
export { EXPORT_FORMATS, isExportFormat, type ExportFormat } from "./formats";
// U22 — kết xuất đa định dạng xml.zip/html.zip: một hóa đơn = một file trong zip.
export {
  invoiceFileStem,
  invoiceToHtml,
  invoiceToXml,
  type InvoiceLineLike,
} from "./invoiceDoc";
export { fetchLinesForInvoices } from "./lineRows";
export { zipStreamFromBatches, type InvoiceRenderer, type FetchLines } from "./zipStream";
// U11 — ánh xạ/convert sang định dạng phần mềm kế toán theo profile.
export {
  accountingCsvStream,
  accountingXlsxFromBatches,
  profileRenderColumns,
  toAccountingFile,
} from "./accountingFile";
export { REFERENCE_PROFILE } from "./profiles/reference";
export {
  AVAILABLE_PROFILE_IDS,
  PENDING_PROFILES,
  type PendingProfile,
  getProfile,
  isProfileId,
} from "./profiles/registry";
export type { MappingColumn, MappingProfile } from "./profiles/types";

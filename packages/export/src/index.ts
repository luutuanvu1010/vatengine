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
export { CSV_BOM, csvHeaderLine, csvRowLine, csvStream, guardCsvText, toCsv } from "./csv";
export { toXlsx, toXlsxFromBatches } from "./xlsx";
export { DEFAULT_PAGE_SIZE, iterateInvoices, type ExportRow } from "./rows";
export { EXPORT_FORMATS, isExportFormat, type ExportFormat } from "./formats";
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

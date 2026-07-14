// Định dạng kết xuất hợp lệ (U7) — NGUỒN SỰ THẬT DUY NHẤT. Route apps/api validate qua
// `isExportFormat` (không hardcode lại danh sách). Thêm định dạng (xml.zip/pdf.zip…) chỉ
// sửa ở đây + renderer tương ứng.
export type ExportFormat = "xlsx" | "csv";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["xlsx", "csv"];

export function isExportFormat(v: unknown): v is ExportFormat {
  return typeof v === "string" && (EXPORT_FORMATS as readonly string[]).includes(v);
}

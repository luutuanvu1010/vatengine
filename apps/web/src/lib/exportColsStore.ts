// Nhớ lựa chọn CỘT XUẤT ở localStorage (như filterStore nhớ bộ lọc). KHÔNG chứa dữ liệu
// tenant (chỉ là key cột trình bày) → an toàn giữ qua phiên. Lọc key lạ khi đọc (dữ liệu cũ
// / người dùng chỉnh tay) — chỉ nhận key có trong catalog.
import { FLAT_EXPORT_DEFAULT_KEYS, FLAT_EXPORT_KEYS } from "@vat/domain";

const KEY = "vat.exportCols.v1";

export function loadExportCols(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...FLAT_EXPORT_DEFAULT_KEYS];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [...FLAT_EXPORT_DEFAULT_KEYS];
    const hople = arr.filter((k): k is string => typeof k === "string" && FLAT_EXPORT_KEYS.has(k));
    return hople.length > 0 ? hople : [...FLAT_EXPORT_DEFAULT_KEYS];
  } catch {
    return [...FLAT_EXPORT_DEFAULT_KEYS];
  }
}

export function saveExportCols(cols: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cols));
  } catch {
    /* localStorage đầy/không dùng được → bỏ qua, không chặn thao tác. */
  }
}

// Nhớ lựa chọn CỘT XUẤT ở localStorage (như filterStore nhớ bộ lọc). KHÔNG chứa dữ liệu
// tenant (chỉ là key cột trình bày) → an toàn giữ qua phiên. Lọc key lạ khi đọc (dữ liệu cũ
// / người dùng chỉnh tay) — chỉ nhận key có trong catalog.
import { FLAT_EXPORT_DEFAULT_KEYS, FLAT_EXPORT_KEYS } from "@vat/domain";

// U36 — bump v1 → v2. Lựa chọn cột đã lưu chỉ được LỌC key lạ, KHÔNG bao giờ được bổ sung
// key mới; giữ v1 thì người dùng từng bấm "Tùy chỉnh cột" sẽ KHÔNG BAO GIỜ thấy 3 cột trạng
// thái, tức QĐ-1 "bật mặc định" vô hiệu với đúng nhóm quan tâm nhất. Đổi khóa = họ về bộ mặc
// định mới một lần; đánh đổi có chủ đích (mất lựa chọn cũ) để không giấu thông tin sai lệch.
export const EXPORT_COLS_KEY = "vat.exportCols.v2";

export function loadExportCols(): string[] {
  try {
    const raw = localStorage.getItem(EXPORT_COLS_KEY);
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
    localStorage.setItem(EXPORT_COLS_KEY, JSON.stringify(cols));
  } catch {
    /* localStorage đầy/không dùng được → bỏ qua, không chặn thao tác. */
  }
}

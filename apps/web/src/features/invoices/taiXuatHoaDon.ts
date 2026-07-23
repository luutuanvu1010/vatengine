// U-K4 — luồng xuất + tải DÙNG CHUNG (một nguồn): createExport(format, filter) →
// downloadExport(id) → saveBlob. Nút "Xuất Excel/CSV" (InvoiceExportButtons) và bước tự-tải
// sau "Đồng bộ và tải xuống" (InvoicesPage) cùng gọi hàm này — không viết bộ xuất thứ hai.
import { api } from "../../lib/apiClient";
import { saveBlob } from "../../lib/download";
import type { ExportFormat, InvoiceFilter } from "../../types/api";
import { tenFileXuat } from "./exportFilename";

/** Xuất theo bộ lọc (server-side, toàn bộ kết quả) rồi tải file về. `ids` không rỗng ⇒ xuất
 * đúng các dòng đã chọn (server bỏ qua bộ lọc — U30). Ném lỗi để nơi gọi hiển thị/log. */
export async function taiXuatHoaDon(
  format: ExportFormat,
  filter: InvoiceFilter,
  ids?: string[],
  cols?: string[],
): Promise<void> {
  const res = await api.createExport(
    format,
    filter,
    ids && ids.length > 0 ? ids : undefined,
    cols && cols.length > 0 ? cols : undefined,
  );
  const blob = await api.downloadExport(res.id);
  saveBlob(blob, tenFileXuat(filter, format));
}

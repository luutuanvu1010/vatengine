// Tên file tải về (quyết định chủ dự án 2026-07-21): dễ nhận diện theo khoảng ngày đã lọc.
// KHÔNG dùng đuôi `.xls` như ví dụ ban đầu — file thật là OOXML (xlsx); đặt `.xls` khiến
// Excel cảnh báo "định dạng và phần mở rộng không khớp". Dùng đúng đuôi của định dạng.
import type { ExportFormat, InvoiceFilter } from "../../types/api";

/** "2026-06-01" (YYYY-MM-DD) → "01062026" (ddmmyyyy). Chuỗi ISO đã được server validate. */
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}${m}${y}`;
}

/** vatengine-export[-<tuNgay>[-<denNgay>]].<đuôi>. Không có ngày nào → bỏ hẳn phần ngày,
 * không chèn đuôi rác. */
export function tenFileXuat(
  filter: Pick<InvoiceFilter, "tuNgay" | "denNgay">,
  format: ExportFormat,
): string {
  const phanNgay = [filter.tuNgay, filter.denNgay]
    .filter((x): x is string => Boolean(x))
    .map(ddmmyyyy)
    .join("-");
  const goc = phanNgay ? `vatengine-export-${phanNgay}` : "vatengine-export";
  return `${goc}.${format}`;
}

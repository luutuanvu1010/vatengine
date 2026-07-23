// Nhớ bộ lọc gần nhất (brief §4). Bộ lọc KHÔNG phải bí mật (chieu/nguon/ngày/MST của
// chính tenant) → lưu localStorage được (khác token: token KHÔNG bao giờ localStorage —
// security.md/ADR-0003 #3). Chỉ giữ các khóa hợp lệ; parse hỏng → bộ lọc rỗng.
import type { InvoiceFilter } from "../types/api";

const KEY = "vat.invoiceFilter";
// U-K4 (yêu cầu 2) — KHÔNG nhớ `tuNgay`/`denNgay`: mở màn LUÔN mặc định tháng hiện tại
// (InvoicesPage ghi đè kỳ), nên nhớ kỳ cũ vừa thừa vừa gây lệch với ý "xem tháng này".
// Vẫn nhớ chiều/nguồn/MST + mã trạng thái như trước.
const ALLOWED: (keyof InvoiceFilter)[] = ["chieu", "nguon", "ttxly", "tthai", "nbmst", "nmmst"];

export function loadInvoiceFilter(): InvoiceFilter {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: InvoiceFilter = {};
    for (const k of ALLOWED) {
      const v = parsed[k];
      if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveInvoiceFilter(filter: InvoiceFilter): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(filter));
  } catch {
    /* localStorage không khả dụng (private mode) — bỏ qua, không chặn UI */
  }
}

// H-B.3 — xóa bộ lọc khi chuyển phiên (đăng xuất/401/đăng nhập). Bộ lọc chứa MST của
// chính tenant (nbmst/nmmst) + kỳ → máy dùng chung không được để người kế tiếp thừa hưởng.
export function clearInvoiceFilter(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* localStorage không khả dụng (private mode) — bỏ qua */
  }
}

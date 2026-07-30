// U41 — đọc bộ lọc hóa đơn từ tham số URL.
//
// VÌ SAO CẦN: `InvoicesPage` khởi tạo bộ lọc từ localStorage rồi LUÔN ghi đè kỳ = tháng hiện
// tại, và không đọc tham số URL. Không có hàm này thì mọi nút "Xem danh sách" ở khối "Cần xử
// lý" của Tổng quan sẽ đổ về danh sách KHÔNG lọc — cảnh báo biến thành ngõ cụt.
//
// PHẠM VI HẸP CÓ CHỦ ĐÍCH — chỉ bốn khoá mà Tổng quan thật sự phát sinh liên kết:
// `biSua`, `tuNgay`, `denNgay`, `chieu`. Mở rộng ra toàn bộ `InvoiceFilter` là dựng một mặt
// tiếp nhận đầu vào KHÔNG TIN CẬY mà chưa ai cần tới; thêm khoá nào thì thêm ca kiểm cho
// khoá đó.
//
// Giá trị lạ bị BỎ QUA tại đây (không ném): người dùng có thể gõ tay hoặc dán nhầm URL, và
// một tham số hỏng không đáng để cả trang thành màn lỗi. Server vẫn validate lại bằng Zod —
// đây chỉ là lớp lọc thiện chí ở client, KHÔNG phải biên tin cậy.
import type { InvoiceFilter } from "../types/api";

/** `YYYY-MM-DD` đúng dạng — khớp `invoiceFilterSchema` phía server. */
const NGAY = /^\d{4}-\d{2}-\d{2}$/;

// Neo vào chính kiểu của `InvoiceFilter` thay vì gõ lại `string`: nếu miền đổi tập chiều,
// dòng dưới không còn biên dịch được — hỏng lúc build tốt hơn lọt một giá trị lạ lên API.
type Chieu = NonNullable<InvoiceFilter["chieu"]>;
const CHIEU_HOP_LE: readonly Chieu[] = ["purchase", "sold"];

function laChieu(v: string): v is Chieu {
  return (CHIEU_HOP_LE as readonly string[]).includes(v);
}

/**
 * Ghép tham số URL lên trên bộ lọc mặc định. Trả bộ lọc MỚI — không đụng vào `macDinh`.
 *
 * Không tham số nào hợp lệ ⇒ trả đúng `macDinh`, tức hành vi cũ của `InvoicesPage` giữ
 * nguyên y hệt cho mọi lần mở trang bình thường.
 */
export function filterTuUrl(sp: URLSearchParams, macDinh: InvoiceFilter): InvoiceFilter {
  const kq: InvoiceFilter = { ...macDinh };

  if (sp.get("biSua") === "true") kq.biSua = true;

  const chieu = sp.get("chieu");
  if (chieu && laChieu(chieu)) kq.chieu = chieu;

  const tuNgay = sp.get("tuNgay");
  if (tuNgay && NGAY.test(tuNgay)) kq.tuNgay = tuNgay;

  const denNgay = sp.get("denNgay");
  if (denNgay && NGAY.test(denNgay)) kq.denNgay = denNgay;

  return kq;
}

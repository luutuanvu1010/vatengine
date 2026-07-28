// Cờ bật/tắt tính năng ở tầng trình bày. Cùng khuôn với SHOW_DONATION (lib/donation.ts):
// hằng số trong mã, KHÔNG dùng biến môi trường build — tránh dựng nguồn cấu hình thứ hai
// cho cùng một loại quyết định.

/** Hiện trang "Đối chiếu" (mục menu + route).
 *
 * 2026-07-22 TẮT — chủ dự án: "chức năng Lệch thuế chưa cần thiết".
 * 2026-07-29 BẬT LẠI — chủ dự án, sau khi ĐO trên production thay vì phỏng đoán:
 *   15/31.807 hóa đơn đang lệch thuế (0,047% — không nhiễu), trong đó 11 ca lệch > 100.000 đ.
 *   Cơ chế và test đã có sẵn từ U10; điều thiếu trước đây chỉ là bằng chứng nó đáng hiện.
 *   Số đo + lập luận: `docs/RA-SOAT-thong-bao-lech-hoa-don-2026-07-28.md` §2.
 *
 * ⚠️ Màn này CHƯA phủ hết: 2.138 hóa đơn bán hàng (mẫu số 2, 6,3% dữ liệu) không có thuế
 * GTGT nên `taxIntegrity` bỏ qua — đúng, nhưng nghĩa là chúng KHÔNG được kiểm gì cả. Đừng
 * đọc màn này thành "mọi hóa đơn đều sạch" (xem §3 của bản rà soát trên).
 *
 * Đổi cờ này phải sửa kèm `apps/web/test/features/reconcileHidden.test.tsx` — nó khoá cả hai
 * điểm nối dây (Sidebar + AppRouter) để việc bật/tắt luôn là thay đổi có chủ đích. */
export const SHOW_RECONCILE = true;

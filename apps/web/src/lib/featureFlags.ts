// Cờ bật/tắt tính năng ở tầng trình bày. Cùng khuôn với SHOW_DONATION (lib/donation.ts):
// hằng số trong mã, KHÔNG dùng biến môi trường build — tránh dựng nguồn cấu hình thứ hai
// cho cùng một loại quyết định.

/** Ẩn trang "Đối chiếu" khỏi bảng điều khiển — cả mục menu lẫn route (quyết định chủ dự án
 * 2026-07-22: chức năng "Lệch thuế" chưa cần thiết). Module giữ nguyên: `@vat/reconcile`,
 * `GET /reconcile`, và `features/reconcile/ReconcilePage.tsx` KHÔNG bị xóa. Đổi thành true
 * để bật lại — không cần sửa chỗ nào khác. Khi tắt, `/reconcile` rơi vào catch-all của
 * AppRouter và về Tổng quan, nên bookmark cũ không gãy. */
export const SHOW_RECONCILE = false;

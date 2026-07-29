// Cờ bật/tắt tính năng ở tầng trình bày. Cùng khuôn với SHOW_DONATION (lib/donation.ts):
// hằng số trong mã, KHÔNG dùng biến môi trường build — tránh dựng nguồn cấu hình thứ hai
// cho cùng một loại quyết định.

/** Hiện trang "Đối chiếu" (mục menu + route).
 *
 * LỊCH SỬ QUYẾT ĐỊNH — đọc theo thứ tự, mỗi lần đổi cờ ghi thêm một dòng, KHÔNG xoá dòng cũ:
 *
 * - 2026-07-22 TẮT — chủ dự án: "chức năng Lệch thuế chưa cần thiết".
 * - 2026-07-29 BẬT — sau khi ĐO trên production thay vì phỏng đoán: 15/31.807 hóa đơn đang
 *   lệch thuế (0,047% — không nhiễu), 11 ca lệch > 100.000 đ.
 *   Số đo: `docs/RA-SOAT-thong-bao-lech-hoa-don-2026-07-28.md` §2.
 * - 2026-07-29 TẮT LẠI (**TẠM**, cùng ngày) — chủ dự án: tạm ẩn khỏi trang người dùng để
 *   nghiên cứu thêm trước khi phơi ra cho khách. **Số đo ở trên KHÔNG bị bác bỏ** — việc tắt
 *   là hoãn phát hành, không phải kết luận màn này sai. Câu hỏi còn treo + điều kiện bật lại:
 *   `docs/BACKLOG-y-tuong-va-de-xuat.md` mục "Đối chiếu — tạm ẩn 2026-07-29".
 *
 * ⚠️ Điểm mù cần nhớ khi nghiên cứu tiếp: 2.138 hóa đơn bán hàng (mẫu số 2, 6,3% dữ liệu)
 * không có thuế GTGT nên `taxIntegrity` bỏ qua — đúng về mặt nghiệp vụ, nhưng nghĩa là chúng
 * KHÔNG được kiểm gì cả. Đừng đọc màn này thành "mọi hóa đơn đều sạch" (bản rà soát trên §3).
 *
 * Đổi cờ này phải sửa kèm `apps/web/test/features/reconcileHidden.test.tsx` — nó khoá cả hai
 * điểm nối dây (Sidebar + AppRouter) để việc bật/tắt luôn là thay đổi có chủ đích. */
export const SHOW_RECONCILE = false;

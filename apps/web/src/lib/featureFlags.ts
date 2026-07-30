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

/** Hiện trang "Kết xuất & Convert" (mục menu + route + lối tắt ở Tổng quan).
 *
 * LỊCH SỬ QUYẾT ĐỊNH — đọc theo thứ tự, mỗi lần đổi cờ ghi thêm một dòng, KHÔNG xoá dòng cũ:
 *
 * - 2026-07-30 TẮT — chủ dự án ẩn khỏi giao diện người dùng, giữ nguyên mã.
 *
 * ⚠️ Điều bị ẩn theo mà dễ quên: trang này là lối vào DUY NHẤT của "chuyển sang file kế toán
 * theo profile" (`POST /exports/convert`). Ẩn trang ⇒ khách mất luôn tính năng đó, không chỉ
 * mất một nơi chọn định dạng. Route `POST /exports/convert` phía API vẫn sống nguyên.
 * Đề xuất chuyển tính năng này sang màn Tra cứu: `docs/BACKLOG-y-tuong-va-de-xuat.md`.
 *
 * Sau khi tắt cờ này, lối vào xuất dữ liệu duy nhất của khách là nút trong màn Tra cứu hóa đơn
 * (`features/invoices/InvoiceExportButtons.tsx`) — xem thêm [[SHOW_CSV_EXPORT]] bên dưới.
 *
 * Đổi cờ này phải sửa kèm `apps/web/test/features/exportsHidden.test.tsx` — nó khoá cả BA
 * điểm nối dây (Sidebar + AppRouter + lối tắt Tổng quan) để bật/tắt luôn là thay đổi có chủ
 * đích; đỏ vì sửa một chỗ mà quên chỗ khác là hành vi đúng, không phải hồi quy. */
export const SHOW_EXPORTS = false;

/** Hiện nút "Xuất CSV" trong màn Tra cứu hóa đơn (cạnh nút "Xuất Excel").
 *
 * LỊCH SỬ QUYẾT ĐỊNH — đọc theo thứ tự, mỗi lần đổi cờ ghi thêm một dòng, KHÔNG xoá dòng cũ:
 *
 * - 2026-07-30 TẮT — chủ dự án bỏ CSV khỏi trải nghiệm khách; chỉ còn Excel. Nghiên cứu đầy
 *   đủ (bản đồ điểm chạm + 3 phương án + chi phí): `docs/NGHIEN-CUU-bo-xuat-csv-2026-07-30.md`.
 *
 * TẠI SAO ẨN CHỨ KHÔNG XOÁ MÃ — lý do đã đo, đừng "dọn cho gọn" mà phá:
 * lõi `packages/export/src/csv.ts` đang là **hạ tầng kiểm thử** của tầng API. 38 lượt
 * `?format=csv` trong `apps/api/test` phần lớn KHÔNG kiểm CSV — chúng kiểm cách ly tenant,
 * RBAC, mask audit log, chọn hóa đơn theo `ids` — và chọn CSV vì CSV là văn bản đọc được
 * từng dòng (`csvLines`/`csvOf`), còn XLSX là nhị phân. Xoá `"csv"` khỏi `ExportFormat` ⇒
 * phải viết lại ~50 ca test đó sang nhị phân, rủi ro làm YẾU chính bộ test bảo vệ ranh giới
 * tenant. Bỏ ở lối vào là đủ để khách không thấy CSV nữa.
 *
 * Phạm vi: cờ này CHỈ điều khiển giao diện. `POST /exports?format=csv` phía API vẫn nhận —
 * đây là API nội bộ, không phải lỗ hổng.
 *
 * Đổi cờ này phải sửa kèm `apps/web/test/features/csvHidden.test.tsx`. */
export const SHOW_CSV_EXPORT = false;

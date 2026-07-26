// Lịch sử cập nhật phần mềm — file tĩnh, ngôn ngữ người dùng cuối (không thuật ngữ kỹ
// thuật). Nội dung ĐÃ CHỐT trong docs/plans/U16b-noi-dung-faq-va-changelog.md §B.
// Mới nhất đứng đầu mảng.
export type ChangelogKind = "feature" | "improvement" | "fix";

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  changes: string[];
  kind: ChangelogKind;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.8",
    date: "2026-07-26",
    title: "Đồng bộ thông minh — tự tìm và bù hóa đơn còn thiếu",
    changes: [
      'Nút "Đồng bộ từ Thuế" nay tự KIỂM TRA từng tháng trong kỳ đã chọn so với máy chủ Thuế: tháng nào đủ thì bỏ qua, tháng nào thiếu mới kéo bổ sung — nhanh hơn và không lặp lại việc đã làm.',
      "Kéo dữ liệu theo từng phần nhỏ nối tiếp nhau, tự nối lại đúng chỗ khi máy chủ Thuế giới hạn tốc độ — hết cảnh đồng bộ nửa chừng rồi mất trắng.",
      "Hằng ngày hệ thống tự rà lại tháng liền trước để bù hóa đơn người bán đẩy lên trễ.",
      'Màn hóa đơn gộp thành một khung "Tra cứu hóa đơn": bộ lọc, nút Đồng bộ và nút Xuất Excel/CSV đứng cạnh nhau, kèm dấu ⓘ giải thích khi di chuột.',
      "Phần Kết quả hiển thị đủ 4 con số: Số hóa đơn, Tiền chưa thuế, Tiền thuế, Tổng thanh toán cho đúng kỳ đang lọc.",
      "Bỏ tự tải file sau đồng bộ — tải file chỉ qua nút Xuất, tránh tải trùng ngoài ý muốn.",
    ],
    kind: "feature",
  },
  {
    version: "v1.7",
    date: "2026-07-25",
    title: "Sửa ngày trên file xuất",
    changes: [
      "Ngày trên file Excel/CSV xuất ra nay hiển thị đúng theo ngày Việt Nam (dd/mm/yyyy), không còn lệch lùi 1 ngày với hóa đơn lập vào đầu ngày.",
    ],
    kind: "fix",
  },
  {
    version: "v1.6",
    date: "2026-07-23",
    title: "Chọn kỳ nhanh hơn & thao tác rõ ràng hơn",
    changes: [
      "Chọn kỳ xem bằng danh sách Tháng/Quý/Năm — chọn được cả kỳ đã qua, bấm gọn trên điện thoại.",
      "Mở màn hóa đơn mặc định xem tháng hiện tại.",
      'Đổi tên nút cho rõ nghĩa: "Lọc dữ liệu" để xem dữ liệu đã có; "Đồng bộ và tải xuống" để lấy mới từ Tổng cục Thuế và tự tải file khi xong.',
    ],
    kind: "improvement",
  },
  {
    version: "v1.5",
    date: "2026-07-21",
    title: "Lọc & xuất linh hoạt hơn",
    changes: [
      "Thêm nút Xuất Excel/CSV ngay trong danh sách hóa đơn.",
      "Lọc theo chiều mua vào/bán ra gọn hơn, mặc định xem dữ liệu hôm qua.",
      "Trang Giới thiệu & Hỗ trợ mới: hướng dẫn, câu hỏi thường gặp và lịch sử cập nhật.",
    ],
    kind: "feature",
  },
  {
    version: "v1.4",
    date: "2026-07-16",
    title: "Chi tiết dòng hàng & đồng bộ theo khoảng",
    changes: [
      "Hiển thị tên hàng hóa/dịch vụ và số lượng ngay trong danh sách hóa đơn.",
      'Nút "Đồng bộ khoảng này" để lấy dữ liệu theo khoảng thời gian tùy chọn.',
      "Lấy chi tiết từng dòng hàng của hóa đơn nhanh và ổn định hơn.",
    ],
    kind: "improvement",
  },
  {
    version: "v1.3",
    date: "2026-07-16",
    title: "Tự động lấy dữ liệu kỳ quá khứ",
    changes: [
      "Khi xem một kỳ chưa có dữ liệu, phần mềm tự động lấy bổ sung và hiển thị thanh tiến độ theo từng tháng.",
      "Đồng bộ ổn định hơn khi hệ thống thuế bận (tự động chờ và thử lại đúng nhịp, tránh bị chặn).",
    ],
    kind: "improvement",
  },
  {
    version: "v1.2",
    date: "2026-07-16",
    title: "Hồ sơ doanh nghiệp & tài khoản thuế",
    changes: [
      "Sửa được tên hiển thị và ghi chú của hồ sơ doanh nghiệp.",
      "Quản lý kết nối tài khoản thuế: thêm, xem trạng thái, ngắt kết nối khi cần.",
      "Bảo vệ đăng nhập tốt hơn (khóa tạm khi thử sai nhiều lần, ghi nhật ký thao tác nhạy cảm).",
    ],
    kind: "feature",
  },
  {
    version: "v1.1",
    date: "2026-07-15",
    title: "Giao diện web & trải nghiệm di động",
    changes: [
      "Ra mắt giao diện web đầy đủ: tổng quan, danh sách hóa đơn, đối chiếu, kết xuất.",
      "Tối ưu hiển thị trên điện thoại (menu dạng ngăn kéo, đăng nhập một cột).",
      'Nút "Đồng bộ ngay" để lấy hóa đơn mới nhất chỉ với một cú nhấp.',
    ],
    kind: "feature",
  },
  {
    version: "v1.0",
    date: "2026-07-14",
    title: "Phiên bản đầu tiên",
    changes: [
      "Đăng nhập bằng tài khoản thuế của doanh nghiệp và đồng bộ hóa đơn mua vào/bán ra.",
      "Lưu trữ đầy đủ dữ liệu hóa đơn, hỗ trợ đối chiếu và kết xuất Excel/CSV.",
      "Mã hóa thông tin phiên đăng nhập, tách biệt dữ liệu giữa các doanh nghiệp.",
    ],
    kind: "feature",
  },
];

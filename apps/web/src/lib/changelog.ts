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

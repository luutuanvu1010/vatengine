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
    version: "v2.1",
    date: "2026-07-29",
    title: "Chữ to hơn, dễ đọc hơn trên mọi màn hình",
    changes: [
      "Cỡ chữ thân bài tăng từ 13–16px lên 18px trên toàn bộ phần mềm. Trước đây nhiều đoạn mô tả và ghi chú bị thu nhỏ xuống 13px cho gọn, khiến người dùng phải căng mắt — nay mọi câu văn hoàn chỉnh đều dùng chung một cỡ chữ đủ lớn để đọc lâu không mỏi.",
      "Các tiêu đề được phóng to tương ứng theo cỡ chữ thân bài, nên thứ bậc trang vẫn rõ ràng: tiêu đề trang, tiêu đề mục và tiêu đề thẻ tách bậc dứt khoát thay vì gần bằng nhau.",
      "Con số lớn ở phần Kết quả và Tổng quan (Tiền chưa thuế, Tiền thuế, Tổng thanh toán) cũng to hơn để liếc là thấy.",
      "Nhãn phụ và chú thích nhỏ giữ cỡ nhỏ hơn thân bài — có chủ đích, để mắt phân biệt được đâu là nội dung chính, đâu là ghi chú.",
    ],
    kind: "improvement",
  },
  {
    version: "v2.0",
    date: "2026-07-28",
    title: "Hóa đơn bị thay thế không còn được cộng vào tổng",
    changes: [
      "Từ 28/07/2026, hóa đơn ĐÃ BỊ THAY THẾ bằng một hóa đơn khác không còn được cộng vào Tiền chưa thuế, Tiền thuế và Tổng thanh toán. Trước đây phần mềm cộng cả bản gốc lẫn bản thay thế nên số liệu bị tính dư. Số thuế phải nộp THẬT của doanh nghiệp không thay đổi — chỉ là con số trên màn hình trước đây tính dư.",
      "Vì vậy tổng của các kỳ đã xem trước đây có thể khác con số cũ. Màn Danh sách hóa đơn nay hiện rõ có bao nhiêu hóa đơn bị loại, loại đi bao nhiêu tiền thuế và bao nhiêu tổng thanh toán, tách riêng theo Mua vào / Bán ra.",
      "Số đếm 'hóa đơn khớp bộ lọc' vẫn đếm đủ mọi hóa đơn, kể cả hóa đơn bị thay thế — chỉ phần TIỀN là không cộng chúng.",
      'File Excel/CSV tải về có thêm 3 cột: "Trạng thái HĐ (mã)", "Trạng thái" (Gốc / Thay thế / Điều chỉnh / Bị thay thế / Bị điều chỉnh) và "Tính vào tổng" (Có/Không). Hóa đơn bị thay thế VẪN có trong file, chỉ được đánh dấu là không tính vào tổng.',
      "Nếu Tổng cục Thuế trả về một mã trạng thái phần mềm chưa biết, màn hình sẽ cảnh báo để bạn kiểm tra thay vì lặng lẽ bỏ qua.",
      "Nhãn trạng thái hóa đơn nay hiện bằng tiếng Việt thay vì mã số khó đọc.",
    ],
    kind: "improvement",
  },
  {
    version: "v1.10",
    date: "2026-07-28",
    title: "Sửa đăng ký hộ kinh doanh + đồng bộ không còn treo",
    changes: [
      "Đăng ký tài khoản và đổi mã số thuế nay nhận đủ mã số thuế 12 chữ số (số định danh cá nhân dùng cho hộ kinh doanh/cá nhân) — trước đây bị từ chối nhầm dù nhập đúng.",
      'Sửa lỗi khiến một số tài khoản bấm "Đồng bộ" bị kẹt ở trạng thái đang chạy nền không bao giờ xong — đồng bộ nay chạy và hoàn tất bình thường trở lại.',
    ],
    kind: "fix",
  },
  {
    version: "v1.9",
    date: "2026-07-27",
    title: "Cảnh báo khi hóa đơn đổi trạng thái + sửa hiển thị thuế suất",
    changes: [
      'Màn Tra cứu hóa đơn có thêm nút "Hóa đơn vừa thay đổi" — báo ngay khi có hóa đơn đổi trạng thái (ví dụ bị hủy, thay thế, điều chỉnh), kèm số lượng chưa xem; bấm vào xem chi tiết từng hóa đơn (trạng thái cũ → mới, thời điểm phát hiện) và đánh dấu đã đọc.',
      'Cột "Thuế suất" trong file xuất Excel/CSV nay hiển thị đúng dạng phần trăm (ví dụ 8%) thay vì số thập phân (0.08); hóa đơn không chịu thuế/không kê khai khấu trừ hiện đúng là ô trống, không còn nhầm thành 0%.',
      'Cột "Tiền thuế" và "Tổng tiền (sau thuế)" trong file xuất nay tự tính đủ số ngay cả khi dữ liệu gốc từ Tổng cục Thuế bị thiếu tiền thuế.',
    ],
    kind: "feature",
  },
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

// Câu hỏi thường gặp — file tĩnh. Nội dung ĐÃ CHỐT trong
// docs/plans/U16b-noi-dung-faq-va-changelog.md §A. Câu 4 (chính sách xóa dữ liệu) còn
// treo chờ chủ dự án bổ sung chi tiết — xem ghi chú trong `a`.
export type FaqItem = { q: string; a: string; group: string };

const BAO_MAT = "Bảo mật thông tin";
const PHAP_LUAT = "Tuân thủ pháp luật";
const TINH_NANG = "Tính năng phần mềm";

export const FAQ: FaqItem[] = [
  {
    group: BAO_MAT,
    q: "Phần mềm có lưu mật khẩu tài khoản thuế của tôi không?",
    a: "Không lưu ở dạng đọc được. Để đồng bộ hóa đơn thay bạn giữa các phiên, hệ thống lưu token phiên do Tổng cục Thuế cấp ở dạng đã mã hóa, không lưu mật khẩu thô. Khi token hết hạn, bạn được yêu cầu đăng nhập lại — phần mềm không thể tự đăng nhập lại bằng mật khẩu đã ghi nhớ.",
  },
  {
    group: BAO_MAT,
    q: "Dữ liệu hóa đơn của doanh nghiệp tôi có bị lẫn hoặc chia sẻ với doanh nghiệp khác không?",
    a: 'Không. Mỗi doanh nghiệp là một "khoang" dữ liệu riêng (multi-tenant). Mọi truy vấn đều gắn định danh doanh nghiệp và có lớp phòng thủ ở tầng cơ sở dữ liệu (Row-Level Security) để ngăn dữ liệu rò sang tenant khác. Phần mềm chỉ truy xuất hóa đơn thuộc thẩm quyền tài khoản bạn đăng nhập.',
  },
  {
    group: BAO_MAT,
    q: "Phần mềm có tự động vượt captcha của cơ quan thuế không?",
    a: "Không. Captcha do bạn tự nhập. Phần mềm tôn trọng cơ chế bảo vệ của hệ thống thuế, không phá captcha bằng máy.",
  },
  {
    group: BAO_MAT,
    q: "Khi tôi ngừng dùng, dữ liệu và kết nối của tôi xử lý ra sao?",
    a: "Bạn có thể ngắt kết nối tài khoản thuế bất cứ lúc nào; khi đó token phiên bị vô hiệu. (Chính sách lưu trữ/xóa dữ liệu chi tiết — chủ dự án bổ sung theo thực tế vận hành.)",
  },
  {
    group: PHAP_LUAT,
    q: "Việc phần mềm lấy hóa đơn thay tôi có hợp pháp không?",
    a: "Có, trong phạm vi: phần mềm đăng nhập bằng chính tài khoản MST hợp pháp của doanh nghiệp bạn và chỉ truy xuất hóa đơn thuộc thẩm quyền tài khoản đó. Đây là dữ liệu của chính bạn trên Hệ thống Hóa đơn điện tử của Tổng cục Thuế.",
  },
  {
    group: PHAP_LUAT,
    q: "Phần mềm tuân thủ những quy định nào về hóa đơn và dữ liệu?",
    a: "Bám các quy định về hóa đơn điện tử — Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC — cho việc truy xuất, lưu trữ và kết xuất hóa đơn; và Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân trong xử lý dữ liệu người dùng.",
  },
  {
    group: PHAP_LUAT,
    q: "Dữ liệu hóa đơn trích xuất có dùng để kê khai thuế được không?",
    a: "Phần mềm giữ đầy đủ trường dữ liệu gốc của hóa đơn (lưu cả bản JSON gốc) và cho kết xuất Excel, phục vụ đối chiếu và chuẩn bị kê khai. Việc kê khai chính thức vẫn do bạn/kế toán thực hiện trên hệ thống của cơ quan thuế.",
  },
  {
    group: TINH_NANG,
    q: "Phần mềm lấy được những loại hóa đơn nào?",
    a: "Cả hóa đơn mua vào (đầu vào) và bán ra (đầu ra), gồm cả hóa đơn thường và hóa đơn từ máy tính tiền, với đầy đủ trường dữ liệu và chi tiết từng dòng hàng (tên hàng, số lượng).",
  },
  {
    group: TINH_NANG,
    q: "Đồng bộ lại nhiều lần có làm trùng hóa đơn không?",
    a: "Không. Cơ chế đồng bộ là idempotent: chạy lại cùng một kỳ không nhân đôi bản ghi; hóa đơn đổi trạng thái sẽ được cập nhật đúng thay vì thêm mới. Bạn cũng có thể đồng bộ theo khoảng thời gian và theo dõi tiến độ theo từng tháng.",
  },
  {
    group: TINH_NANG,
    q: "Tôi lấy được dữ liệu của các kỳ đã qua không?",
    a: "Có. Khi bạn lọc một kỳ quá khứ chưa đồng bộ, phần mềm tự động lấy bổ sung (backfill) dữ liệu kỳ đó và hiển thị tiến độ theo tháng, nên bạn không phải thao tác thủ công từng kỳ.",
  },
];

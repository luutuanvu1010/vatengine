# U16b — Nội dung FAQ + Lịch sử cập nhật (nháp chờ duyệt)

> Soạn 2026-07-21. FAQ: 10 câu (bảo mật · pháp lý · tính năng). Changelog: dựng từ lịch sử git + các đơn vị U đã hiện thực, viết lại bằng ngôn ngữ người dùng cuối. Chủ dự án duyệt trước khi đưa vào `lib/faq.ts` / `lib/changelog.ts`.

---

## A. FAQ — 10 câu hỏi thường gặp

### Nhóm 1 — Bảo mật thông tin

**1. Phần mềm có lưu mật khẩu tài khoản thuế của tôi không?**
Không lưu ở dạng đọc được. Để đồng bộ hóa đơn thay bạn giữa các phiên, hệ thống lưu **token phiên do Tổng cục Thuế cấp** ở dạng **đã mã hóa**, không lưu mật khẩu thô. Khi token hết hạn, bạn được yêu cầu đăng nhập lại — phần mềm không thể tự đăng nhập lại bằng mật khẩu đã ghi nhớ.

**2. Dữ liệu hóa đơn của doanh nghiệp tôi có bị lẫn hoặc chia sẻ với doanh nghiệp khác không?**
Không. Mỗi doanh nghiệp là một "khoang" dữ liệu riêng (multi-tenant). Mọi truy vấn đều gắn định danh doanh nghiệp và có lớp phòng thủ ở tầng cơ sở dữ liệu (Row-Level Security) để ngăn dữ liệu rò sang tenant khác. Phần mềm **chỉ** truy xuất hóa đơn thuộc thẩm quyền tài khoản bạn đăng nhập.

**3. Phần mềm có tự động vượt captcha của cơ quan thuế không?**
Không. Captcha **do bạn tự nhập**. Phần mềm tôn trọng cơ chế bảo vệ của hệ thống thuế, không phá captcha bằng máy.

**4. Khi tôi ngừng dùng, dữ liệu và kết nối của tôi xử lý ra sao?**
Bạn có thể **ngắt kết nối tài khoản thuế** bất cứ lúc nào; khi đó token phiên bị vô hiệu. (Chính sách lưu trữ/xóa dữ liệu chi tiết — chủ dự án bổ sung theo thực tế vận hành.)

### Nhóm 2 — Tuân thủ pháp luật

**5. Việc phần mềm lấy hóa đơn thay tôi có hợp pháp không?**
Có, trong phạm vi: phần mềm đăng nhập bằng **chính tài khoản MST hợp pháp của doanh nghiệp bạn** và chỉ truy xuất hóa đơn thuộc thẩm quyền tài khoản đó. Đây là dữ liệu của chính bạn trên Hệ thống Hóa đơn điện tử của Tổng cục Thuế.

**6. Phần mềm tuân thủ những quy định nào về hóa đơn và dữ liệu?**
Bám các quy định về hóa đơn điện tử — **Nghị định 123/2020/NĐ-CP** và **Thông tư 78/2021/TT-BTC** — cho việc truy xuất, lưu trữ và kết xuất hóa đơn; và **Nghị định 13/2023/NĐ-CP** về bảo vệ dữ liệu cá nhân trong xử lý dữ liệu người dùng.

**7. Dữ liệu hóa đơn trích xuất có dùng để kê khai thuế được không?**
Phần mềm giữ **đầy đủ trường dữ liệu gốc** của hóa đơn (lưu cả bản JSON gốc) và cho kết xuất Excel/CSV, phục vụ đối chiếu và chuẩn bị kê khai. Việc kê khai chính thức vẫn do bạn/kế toán thực hiện trên hệ thống của cơ quan thuế.

### Nhóm 3 — Tính năng phần mềm

**8. Phần mềm lấy được những loại hóa đơn nào?**
Cả hóa đơn **mua vào (đầu vào)** và **bán ra (đầu ra)**, gồm cả hóa đơn thường và **hóa đơn từ máy tính tiền**, với đầy đủ trường dữ liệu và **chi tiết từng dòng hàng** (tên hàng, số lượng).

**9. Đồng bộ lại nhiều lần có làm trùng hóa đơn không?**
Không. Cơ chế đồng bộ là **idempotent**: chạy lại cùng một kỳ không nhân đôi bản ghi; hóa đơn đổi trạng thái sẽ được cập nhật đúng thay vì thêm mới. Bạn cũng có thể **đồng bộ theo khoảng thời gian** và theo dõi tiến độ theo từng tháng.

**10. Tôi lấy được dữ liệu của các kỳ đã qua không?**
Có. Khi bạn lọc một kỳ quá khứ chưa đồng bộ, phần mềm **tự động lấy bổ sung (backfill)** dữ liệu kỳ đó và hiển thị tiến độ theo tháng, nên bạn không phải thao tác thủ công từng kỳ.

> Câu hỏi liên hệ/hỗ trợ chuyển sang khối "Kênh liên hệ hỗ trợ" (giờ hỗ trợ 08:00–17:00).

---

## B. Lịch sử cập nhật (changelog) — nháp từ lịch sử phát triển

> Nguyên tắc viết: **ngôn ngữ người dùng cuối**, mỗi mục 1 dòng dễ hiểu, không thuật ngữ kỹ thuật. Số phiên bản là **đề xuất** (chủ dự án chốt lại theo cách đánh số thật). Ngày lấy từ mốc git tương ứng.

### v1.5 — 2026-07-21 · Lọc & xuất linh hoạt hơn
- ✨ Thêm nút **Xuất Excel/CSV** ngay trong danh sách hóa đơn.
- ⚙️ Lọc theo chiều mua vào/bán ra gọn hơn, mặc định xem dữ liệu hôm qua.
- ✨ Trang **Giới thiệu & Hỗ trợ** mới: hướng dẫn, câu hỏi thường gặp và lịch sử cập nhật.

### v1.4 — 2026-07-16 · Chi tiết dòng hàng & đồng bộ theo khoảng
- ✨ Hiển thị **tên hàng hóa/dịch vụ và số lượng** ngay trong danh sách hóa đơn.
- ✨ Nút **"Đồng bộ khoảng này"** để lấy dữ liệu theo khoảng thời gian tùy chọn.
- ⚡ Lấy chi tiết từng dòng hàng của hóa đơn nhanh và ổn định hơn.

### v1.3 — 2026-07-16 · Tự động lấy dữ liệu kỳ quá khứ
- ✨ Khi xem một kỳ chưa có dữ liệu, phần mềm **tự động lấy bổ sung** và hiển thị **thanh tiến độ theo từng tháng**.
- 🛡️ Đồng bộ ổn định hơn khi hệ thống thuế bận (tự động chờ và thử lại đúng nhịp, tránh bị chặn).

### v1.2 — 2026-07-16 · Hồ sơ doanh nghiệp & tài khoản thuế
- ✨ Sửa được **tên hiển thị và ghi chú** của hồ sơ doanh nghiệp.
- ✨ Quản lý **kết nối tài khoản thuế**: thêm, xem trạng thái, **ngắt kết nối** khi cần.
- 🛡️ Bảo vệ đăng nhập tốt hơn (khóa tạm khi thử sai nhiều lần, ghi nhật ký thao tác nhạy cảm).

### v1.1 — 2026-07-15 · Giao diện web & trải nghiệm di động
- ✨ Ra mắt **giao diện web** đầy đủ: tổng quan, danh sách hóa đơn, đối chiếu, kết xuất.
- 📱 Tối ưu **hiển thị trên điện thoại** (menu dạng ngăn kéo, đăng nhập một cột).
- ✨ Nút **"Đồng bộ ngay"** để lấy hóa đơn mới nhất chỉ với một cú nhấp.

### v1.0 — 2026-07-14 · Phiên bản đầu tiên
- 🚀 Đăng nhập bằng tài khoản thuế của doanh nghiệp và **đồng bộ hóa đơn mua vào/bán ra**.
- 🚀 Lưu trữ đầy đủ dữ liệu hóa đơn, hỗ trợ đối chiếu và **kết xuất Excel/CSV**.
- 🔒 Mã hóa thông tin phiên đăng nhập, tách biệt dữ liệu giữa các doanh nghiệp.

> Nhãn loại: ✨ tính năng mới · ⚡/⚙️ cải tiến · 🛡️/🔒 bảo mật · 🚀 ra mắt. Trong `lib/changelog.ts` map sang `kind: "feature" | "improvement" | "fix"`.

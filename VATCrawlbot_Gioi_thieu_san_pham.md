# VATCrawlbot

**Nền tảng tra cứu & quản trị hóa đơn điện tử kết nối trực tiếp Tổng cục Thuế**

| | |
|---|---|
| **Chủ phần mềm** | Lưu Tuấn Vũ |
| **Đơn vị** | Khánh Hòa Travel |
| **Điện thoại / Zalo** | 0989 929 373 |

---

> **VATCrawlbot** là phần mềm **SaaS** giúp doanh nghiệp Việt Nam tra cứu, đồng bộ và quản lý toàn bộ **hóa đơn điện tử đầu vào (mua vào)** và **đầu ra (bán ra)** — lấy trực tiếp từ Hệ thống Hóa đơn điện tử của Tổng cục Thuế bằng chính tài khoản Mã số thuế hợp pháp của doanh nghiệp. Sản phẩm được thiết kế đạt chuẩn phần mềm doanh nghiệp (Enterprise), phục vụ tới **100.000 khách hàng**, thay thế thao tác tra cứu thủ công từng tháng bằng một nền tảng lưu trữ, đối chiếu và tích hợp kế toán tự động.

---

## 1. Sản phẩm giải quyết vấn đề gì?

Cổng tra cứu chính thức của cơ quan thuế chỉ cho xem thủ công theo từng tháng, hiển thị thiếu trường dữ liệu, khó đối chiếu và khó đưa vào phần mềm kế toán. VATCrawlbot kết nối trực tiếp tới nguồn dữ liệu gốc, lấy về **đầy đủ mọi trường** của hóa đơn (cả cấp hóa đơn lẫn từng dòng hàng hóa), chuẩn hóa và lưu trữ có hệ thống — để kế toán tra cứu bất kỳ lúc nào, đối chiếu chính xác và kê khai thuế GTGT nhanh gọn.

## 2. Tính năng & công dụng chính

- **Đồng bộ 2 chiều đầy đủ:** hóa đơn mua vào & bán ra, gồm cả hóa đơn máy tính tiền, không sót.
- **Chi tiết từng dòng hàng:** tên hàng, số lượng, đơn giá, thuế suất và tiền thuế từng dòng.
- **Lưu trữ bền vững:** tra cứu lịch sử nhiều kỳ mà không phải gọi lại máy chủ thuế; đồng bộ lặp không nhân đôi dữ liệu.
- **Lọc linh hoạt:** theo kỳ, ngày, trạng thái, người bán/mua, số hóa đơn.
- **Xuất Excel/CSV & tích hợp:** đối chiếu, kê khai và đẩy sang phần mềm kế toán (MISA, FAST…).
- **Đối chiếu thông minh:** phát hiện hóa đơn thiếu, lệch tiền thuế, hóa đơn bị hủy/thay thế.

Ngoài ra: đồng bộ tự động theo lịch · nhật ký đồng bộ · kiểm tra rủi ro người bán · đa người dùng và phân quyền · cảnh báo & báo cáo.

## 3. Hạ tầng & khả năng phục vụ số lượng lớn doanh nghiệp

Hệ thống chạy trên hạ tầng điện toán đám mây **Cloudflare** (Workers, Queues, Durable Objects, cơ sở dữ liệu PostgreSQL) — kiến trúc **đa khách hàng (multi-tenant)** ngay từ nền tảng, cho phép mở rộng ngang để phục vụ số lượng lớn doanh nghiệp cùng lúc. Việc đồng bộ nặng được đưa xuống nền qua hàng đợi, không làm chậm thao tác của người dùng. Hệ thống hành xử "lịch sự" với máy chủ thuế bằng cơ chế **giới hạn tốc độ, thử lại có kiểm soát và ngắt mạch (circuit breaker)** theo từng doanh nghiệp, tránh gọi dồn dập.

| Chỉ số | Mục tiêu |
|---|---|
| Doanh nghiệp phục vụ | **100.000** |
| Độ sẵn sàng dịch vụ (uptime) | **≥ 99,5%** |
| Đồng bộ 1 tháng dữ liệu (DN vừa) | **< 60 giây** |
| Khôi phục sau sự cố (RTO) | **< 4 giờ** |

## 4. Bảo mật & an toàn thông tin

- **Không lưu mật khẩu thuế:** mật khẩu chỉ dùng một lần lúc đăng nhập, không lưu ở máy chủ.
- **Mã hóa bí mật:** token do cơ quan thuế cấp được mã hóa khi lưu (AES-256), khóa xoay định kỳ, vòng đời ngắn.
- **Không phá vỡ captcha:** captcha do người dùng nhập — tôn trọng cơ chế bảo vệ của cơ quan thuế.
- **Cách ly dữ liệu tuyệt đối:** mỗi doanh nghiệp chỉ thấy dữ liệu của mình (Row-Level Security).
- **Nhật ký kiểm toán bất biến:** mọi hành động nhạy cảm được ghi lại, không thể sửa/xóa.
- **Mã hóa toàn tuyến:** HTTPS/TLS khi truyền và mã hóa dữ liệu khi lưu; che thông tin nhạy cảm trong log.

## 5. Tuân thủ pháp lý

VATCrawlbot chỉ truy xuất dữ liệu **thuộc thẩm quyền của chính doanh nghiệp** bằng tài khoản MST hợp pháp — không thu thập dữ liệu của bên thứ ba. Với khách hàng SaaS, việc truy cập tài khoản thuế phải có **ủy quyền rõ ràng** kèm hợp đồng xử lý dữ liệu (DPA). Nền tảng tuân thủ:

- **Nghị định 13/2023/NĐ-CP** về bảo vệ dữ liệu cá nhân.
- **Nghị định 123/2020/NĐ-CP** và **Thông tư 78/2021/TT-BTC** về hóa đơn điện tử.
- Lưu trữ chứng từ dài hạn theo quy định kế toán (tối thiểu 10 năm), sao lưu tự động và khôi phục dữ liệu.

## 6. Đối tượng khách hàng & gói dịch vụ

Sản phẩm phù hợp với doanh nghiệp mọi quy mô, và đặc biệt giá trị với **đại lý thuế và công ty dịch vụ kế toán** quản lý nhiều mã số thuế cùng lúc — nhờ kiến trúc đa khách hàng và xử lý hàng loạt. Mô hình thuê bao phân tầng gợi ý:

| Gói | Nội dung | Đối tượng |
|---|---|---|
| **Cơ bản** | Tra cứu & xuất Excel, một mã số thuế, đồng bộ thủ công. | Hộ kinh doanh, doanh nghiệp siêu nhỏ |
| **Chuyên nghiệp** | Đồng bộ tự động, đối chiếu thuế, nhiều người dùng, lưu trữ lịch sử. | Doanh nghiệp vừa và nhỏ |
| **Doanh nghiệp** | Tích hợp phần mềm kế toán, nhiều chi nhánh/MST, API, hỗ trợ ưu tiên, cam kết SLA. | DN lớn & đại lý thuế |

## 7. Vì sao chọn VATCrawlbot?

Khác biệt của sản phẩm không nằm ở việc "tải được hóa đơn" — mà ở **độ tin cậy đồng bộ, chất lượng đối chiếu thuế, chiều sâu tích hợp kế toán, và uy tín về tuân thủ – bảo mật**. Đây là nền tảng "sạch", kết nối trực tiếp nguồn dữ liệu chính thức, giúp doanh nghiệp tiết kiệm thời gian kê khai, giảm sai sót thuế và chủ động kiểm soát rủi ro hóa đơn đầu vào.

---

**Liên hệ:** Lưu Tuấn Vũ — Khánh Hòa Travel · Điện thoại/Zalo: 0989 929 373.
*Tài liệu giới thiệu tóm tắt; nội dung chi tiết về kiến trúc, lộ trình và tính năng có trong hồ sơ kỹ thuật của dự án.*

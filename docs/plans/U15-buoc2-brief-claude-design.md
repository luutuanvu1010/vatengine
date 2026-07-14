# VATEngine — Brief thiết kế cho Claude Design (U15 Bước 2)

> **Cách dùng:** dán trọn tài liệu này vào Claude Design làm đầu vào. Đây là **brief tinh gọn**: nêu bối cảnh, mô hình dữ liệu bắt buộc và nguyên tắc cốt lõi. **Ngoài các ràng buộc "BẮT BUỘC", Claude Design được tự do sáng tạo bố cục, thành phần, chi tiết thị giác** — miễn khớp mô hình dữ liệu và nguyên tắc dưới đây.
>
> Nguồn chân lý dữ liệu: `docs/06-BINDING_MAP.md` (đọc từ mã, không suy đoán). Ngăn xếp: React + Vite SPA (ADR-0003).

---

## 1. Sản phẩm (một đoạn)

**VATEngine** — SaaS đa khách hàng giúp doanh nghiệp Việt Nam **tra cứu, kết xuất, đối chiếu hóa đơn điện tử** (mua vào + bán ra) kéo trực tiếp từ Tổng cục Thuế bằng chính tài khoản MST của họ; và **tự kết nối tài khoản thuế** (đăng nhập + tự nhập captcha) để đồng bộ. Đối tượng: kế toán doanh nghiệp — ưu tiên chính xác, tin cậy, gọn.

## 2. Người dùng & phân quyền (3 vai)

`ke_toan` < `ke_toan_truong` < `quan_tri`. UI **phải phản chiếu** quyền bằng ẩn/khoá hành động (không chỉ dựa server chặn):

| Hành động | ke_toan | ke_toan_truong | quan_tri |
|---|:--:|:--:|:--:|
| Xem danh sách / chi tiết / tổng hợp / đối chiếu | ✅ | ✅ | ✅ |
| Kết xuất · Convert · Tải file | ❌ | ✅ | ✅ |
| Kết nối tài khoản thuế | ❌ | ✅ | ✅ |

Cùng một tenant — **không bao giờ** thấy dữ liệu tenant khác.

## 3. Các màn hình (7 bề mặt)

| # | Màn | Làm gì |
|---|---|---|
| S0 | **Đăng nhập nội bộ** | email + mật khẩu SaaS. Tối giản, tin cậy. |
| **D** | **Dashboard tổng quan** | màn đầu sau đăng nhập: thẻ số liệu (đếm + tổng tiền theo chiều mua/bán), lối tắt tới các màn. |
| S1 | **Danh sách hóa đơn** | trung tâm sản phẩm: bảng + bộ lọc kỳ/chiều/nguồn/MST + phân trang + thẻ tổng hợp. |
| S2 | **Chi tiết hóa đơn** | chỉ phần header; nêu rõ "dòng hàng chưa khả dụng". |
| S3 | **Kết xuất & Convert** | chọn định dạng (xlsx/csv) / profile kế toán → tạo → tải link. *(chỉ ke_toan_truong + quan_tri)* |
| S4 | **Đối chiếu** | thẻ tóm tắt 4 con số + 4 nhóm phát hiện; mỗi phát hiện dẫn tới hóa đơn liên quan. |
| S5 | **Kết nối tài khoản thuế** | luồng 4 bước: đăng ký MST → ủy quyền → hiển thị captcha (SVG) cho người tự gõ → đăng nhập, hiện hạn token. *(chỉ ke_toan_truong + quan_tri)* |

**Luồng xương sống (dùng hằng ngày):** Đăng nhập → Dashboard → Danh sách (lọc kỳ) → Chi tiết / Kết xuất / Đối chiếu. Tối ưu tốc độ + rõ ràng.

## 4. Mô hình dữ liệu & quy tắc hiển thị (BẮT BUỘC — khớp đúng, sai là lỗi nghiêm trọng)

**Cột bảng hóa đơn** (không thêm/bịa cột): Ngày lập · Ký hiệu mẫu số · Ký hiệu HĐ · Số HĐ · MST người bán · Tên người bán · MST người mua · Tên người mua · Tiền chưa thuế · Tiền thuế · Tổng thanh toán · Tiền tệ · Trạng thái xử lý · Trạng thái HĐ · Chiều · Nguồn.

- **Tiền:** là chuỗi numeric, **có thể lớn hơn 2^53** → phân nhóm nghìn bằng thao tác chuỗi/BigInt, **không ép float**. **Căn phải.** `null` → để trống. *(Hiển thị rút gọn cho khách quét nhanh, vd "1,23 tỷ" — nhưng chi tiết luôn xem được giá trị đầy đủ; không được làm sai số.)*
- **Ngày** (`tdlap`): là thời khắc UTC → hiển thị **giờ VN (UTC+7)**, `dd/MM/yyyy`; không lệch ngày.
- **Mã trạng thái** (`ttxly`/`tthai`): chỉ gắn nhãn cho **mã đã kiểm chứng**; mã lạ → hiển thị **số + "(chưa rõ)"**. **Không đoán nhãn.**
- **Enum:** Chiều: `purchase`→"Mua vào", `sold`→"Bán ra". Nguồn: `normal`→"HĐĐT thường", `sco`→"Máy tính tiền".
- **Bộ lọc chung** (mọi màn danh sách/summary/đối chiếu/kết xuất): chiều · nguồn · từ ngày/đến ngày · MST bán · MST mua · phân trang. UX: nút nhanh **Tháng / Quý / Năm / Khoảng ngày**; **nhớ bộ lọc gần nhất**.
- **Đối chiếu:** 4 loại phát hiện — `lech_thue` (lệch số học, cảnh báo trực quan) · `thieu_so_dau_ra` (nhãn "**nghi thiếu**", không khẳng định) · `huy` · `thay_the`. Tóm tắt 4 con số.
- **Convert kế toán:** hiện chỉ profile `reference` khả dụng; `misa/fast/smartktsc` = "sắp có", **không cho chọn**.

## 5. Nguyên tắc thiết kế cốt lõi (định hướng — phần còn lại Claude Design tự sáng tạo)

- **Triết lý:** phong cách **Google / Material** — sạch, có chủ đích, quen thuộc. Cảm giác mong muốn: **tin cậy · nhẹ nhàng · quen thuộc** (như dùng Google/Apple). Tối giản kiểu SaaS phương Tây.
- **Màu:** **đỏ** là màu thương hiệu + hành động chính; **xanh dương** phụ trợ/thông tin. **Quan trọng:** tách bạch **đỏ-thương-hiệu** với **đỏ-cảnh-báo** (lệch thuế) bằng sắc độ/ngữ cảnh khác nhau, không để lẫn nghĩa.
- **Chế độ:** chỉ **light mode** (chưa cần dark mode).
- **Bố cục:** **sidebar trái cố định** (điều hướng) + header (tenant/vai/đăng xuất) + vùng nội dung. **Mật độ thoáng, ít dòng, dễ quét mắt** (không kiểu bảng Excel dày đặc).
- **Nhất quán (yêu cầu hàng đầu):** một hệ thống thiết kế thống nhất phủ đều mọi màn — cùng bộ token, cùng dạng thẻ/nút/bảng, cùng nhận diện. Các trang khác nhau về thành phần nhưng cùng một ngôn ngữ thị giác.
- **4 trạng thái mỗi màn:** loading (skeleton) · rỗng (có hướng dẫn) · lỗi (thông báo + thử lại) · dữ liệu. Không "màn trắng".
- **Cảnh báo lệch thuế:** **banner đỏ** rõ ràng.
- **Typography:** font tiếng Việt đầy đủ dấu, **nét dày/đậm để dễ đọc**; chữ số tiền căn cột đều (tabular).
- **Ngôn ngữ:** **tiếng Việt trước** (`lang="vi"`), thuật ngữ kế toán/thuế chuẩn; chừa sẵn chỗ chuyển sang tiếng Anh (làm sau).
- **Nhận diện:** wordmark **VATEngine** đơn giản (đỏ), chưa có logo — Claude Design đề xuất. Tên doanh nghiệp (*Công ty TNHH Tour Đảo*) hiển thị ở khu **Cài đặt chung**.
- **Khả truy cập:** WCAG AA — tương phản, điều hướng bàn phím, ARIA cho bảng/trạng thái.
- **Thiết bị:** **desktop trước**, có **responsive** (thu gọn sidebar khi hẹp).

## 6. Ràng buộc bảo mật (BẮT BUỘC)

- **Không bí mật ở client:** không nhúng MST/mật khẩu thuế trong mã; không log token; JWT nội bộ giữ in-memory.
- **Captcha do người tự nhập:** chỉ hiển thị ảnh SVG + ô nhập; **không** có UI tự giải captcha.
- **Mật khẩu thuế** chỉ đi thẳng lên bước đăng nhập GDT, không lưu ở client, không hiển thị lại.
- **Cách ly tenant:** `tenant_id` luôn từ token; UI không gửi/không tin `tenant_id` từ client.

## 7. NGOÀI phạm vi (ĐỪNG thiết kế — chưa có backend)

Cổng Admin (quản lý tenant/người dùng/gói) · nút "Đồng bộ ngay" · màn lịch sử đồng bộ · **dòng hàng chi tiết hóa đơn** (chỉ có header) · webhook/pull kế toán · gọi GDT trực tiếp từ client.

---

## 8. Tự do sáng tạo (nói rõ với Claude Design)

Ngoài Mục 4 (dữ liệu), Mục 6 (bảo mật) và Mục 7 (ngoài phạm vi) là **bất biến**, còn lại — cách sắp xếp bố cục, chọn thành phần, nhịp khoảng trắng, vi tương tác, cách kể chuyện Dashboard, hình thức thẻ/biểu đồ — **Claude Design toàn quyền đề xuất** sao cho đẹp, nhất quán và đúng tinh thần Mục 5. Ưu tiên: đồng bộ · đơn giản · tinh tế · dễ nhìn.

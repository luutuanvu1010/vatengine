# Bản khảo sát tính năng NIBOT (Năng Động Invoice Bot) — bản chốt

*Khảo sát dạng hộp đen: đăng nhập bằng tài khoản hợp lệ của chính doanh nghiệp (MST 4201969169), duyệt toàn bộ giao diện để liệt kê năng lực. Không phân tích mã nguồn, không mổ lưu lượng mạng, không dịch ngược hệ thống của NIBOT. Mục đích: làm mốc đối chiếu tính năng (feature parity) cho phần mềm tự xây.*

Ngày khảo sát: 11/07/2026 · Miền: portal.nangdong.online → `nibot2.com:7979` · Sản phẩm: **NIBOT – Năng Động Invoice Bot**

---

## 1. Bức tranh tổng thể

NIBOT không chỉ là công cụ tải hóa đơn — nó là một **nền tảng dữ liệu kế toán** bao quanh hai hệ thống của cơ quan thuế (hóa đơn điện tử và thuế điện tử/dịch vụ công), mở rộng thêm các nghiệp vụ hạch toán. Một tài khoản quản lý **nhiều doanh nghiệp** (theo MST); mỗi doanh nghiệp là một hồ sơ làm việc với 9 nhóm nghiệp vụ.

Cấu trúc điều hướng: thanh trên cùng (TIỆN ÍCH, HƯỚNG DẪN, HỖ TRỢ, BẢN TIN NIBOT) + chọn doanh nghiệp + 9 tab nghiệp vụ trong mỗi hồ sơ.

---

## 2. Trọng tâm: kéo dữ liệu VAT đầu vào — mức độ & phạm vi

**Độ phủ:** kéo toàn bộ lịch sử hóa đơn mua vào (hồ sơ khảo sát: 20.822 HĐ toàn thời gian; riêng 01–11/07/2026 là 1.836 HĐ / 92 trang). Tổng hợp tự động: chưa thuế ~6,01 tỷ, thuế ~479,8 triệu, thanh toán ~6,49 tỷ.

**Hai luồng hóa đơn:** "Mua Vào" và "Mua Vào – HĐĐV"; đồng thời bao gồm cả hóa đơn thường và **hóa đơn có mã từ máy tính tiền**.

**Trường cấp hóa đơn (danh sách):** MST + tên người bán, ngày, ký hiệu, số HĐ, tiền chưa thuế, tiền thuế, chiết khấu TM, tiền phí, tiền thanh toán, trạng thái HĐ, kết quả kiểm tra, duyệt nội bộ, ghi chú.

**Trường cấp chi tiết (mở từng hóa đơn):** tái dựng đầy đủ hóa đơn GTGT — mẫu số, ký hiệu, số, ngày, **MCCQT (mã cơ quan thuế)**, QR; người bán/người mua (MST, địa chỉ, điện thoại, số tài khoản); hình thức thanh toán, đơn vị tiền tệ, số/ngày bảng kê; **bảng dòng hàng hóa/dịch vụ**: STT, tính chất, tên hàng, ĐVT, số lượng, đơn giá, chiết khấu, **thuế suất theo từng dòng**, thành tiền; bảng tổng hợp theo thuế suất; chữ ký số người mua/người bán; kiểm tra tình trạng người bán **real-time** ("Nibot đang kiểm tra…").

**Phạm vi thời gian có thể kéo/lọc:** Hôm nay, Tháng này, từng Tháng 1→12, Quý 1→4, Năm nay, Năm trước, và khoảng ngày tùy chỉnh → truy xuất lùi nhiều năm.

**Bộ lọc:** ký hiệu HĐ, số HĐ, MST/tên DN/ghi chú, khoảng ngày, "Lọc file", "Duyệt nội bộ", "Trạng thái HĐ", "Kết quả kiểm tra", cùng bộ lọc theo từng cột.

**Tải bản gốc:** mỗi hóa đơn có nút tải **XML** và **PDF**; với PDF gốc có logo/màu, NIBOT chào dịch vụ **DOLAGO** để tải từ nhà cung cấp.

**Đồng bộ:** nút "Đồng bộ" kéo dữ liệu mới từ Tổng cục Thuế; dashboard lưu lịch sử đồng bộ theo phiên bản + thời điểm.

---

## 3. Kết xuất & công cụ trên danh sách hóa đơn

**Kết xuất (5 định dạng):** `EXCEL.XLSX`, `XML.ZIP`, `HTML.ZIP`, `PDF.ZIP`, `AIO.PDF` (gộp tất cả vào một PDF).

**Menu "Công cụ" (7 mục):** (1) Tải bảng kê từ Tổng cục Thuế; (2) Đối chiếu chéo hóa đơn; (3) Kiểm tra thông tin HĐ; (4.1) Kiểm tra tình trạng DN; (4.2) Kiểm tra DN rủi ro (có công văn); (5) Convert Nhật ký chung sang SmartKTSC; và Tải HĐ gốc hàng loạt.

**Thao tác khác:** Đồng bộ, Đánh dấu hàng loạt, Cấu hình, và quy trình **duyệt nội bộ** (Chờ duyệt / Đã duyệt / Không hợp lệ) — đặc trưng của phần mềm kế toán, không chỉ tra cứu.

---

## 4. Chín nhóm nghiệp vụ (tab trong mỗi doanh nghiệp)

1. **HÓA ĐƠN** — danh sách + chi tiết hóa đơn đầu vào/đầu ra (mục 2, 3).
2. **HÀNG HÓA** — danh mục hàng hóa trích từ hóa đơn: gán mã hàng, **gán mã tài khoản (mã TK)**, gom mặt hàng giống nhau theo độ tương đồng %, tạo mã hàng tự động, thêm ĐVT, Export Excel, đồng bộ hàng hóa.
3. **QUY ĐỔI ĐVT** — quy đổi đơn vị tính từ ĐVT hóa đơn sang ĐVT đích (mã hàng, ĐVT gốc, ĐVT đích, số lượng quy đổi), Import/Export Excel.
4. **ĐT P.NHÂN** — quản lý đối tượng/đối tác (theo MST), đánh dấu lại hóa đơn hàng loạt, đồng bộ, Import/Export Excel.
5. **TR.CỨU MST** — tra cứu MST doanh nghiệp/cá nhân → tên DN, địa chỉ, cơ quan thuế quản lý, công văn rủi ro, tình trạng hoạt động; xuất Excel; danh sách công văn rủi ro tham khảo.
6. **SAO KÊ NGÂN HÀNG** — upload Excel sao kê hoặc **đọc sao kê PDF (doSake/OCR)**; hạch toán vào TK Nợ/Có kèm mã đối tượng (định khoản kép); kết xuất.
7. **TỜ KHAI HẢI QUAN** — upload tờ khai hải quan (Excel); cập nhật tỷ giá từ ngân hàng; hạch toán TK Nợ/Có; kết xuất.
8. **LƯƠNG DN** — module lương doanh nghiệp (hiện chưa có dữ liệu ở hồ sơ khảo sát).
9. **THUẾ ĐIỆN TỬ – DỊCH VỤ CÔNG** — Tra cứu tờ khai; Tra cứu giấy nộp tiền (kết nối cổng thuế điện tử).

---

## 5. Tiện ích cấp tài khoản & công cụ PRO

**Menu TIỆN ÍCH:** Đọc nội dung hóa đơn XML; **Tra cứu mặt hàng giảm thuế – NĐ 44**; **Tra cứu mặt hàng không giảm thuế – NĐ 174** (hỗ trợ xác định thuế suất 8% vs 10%); Nối file PDF.

**Công cụ PRO (dashboard):** **DOLAGO** (tải hóa đơn PDF gốc siêu nhanh từ nhà cung cấp); **DOSAKE** (đọc sao kê ngân hàng PDF điện tử/hình ảnh); **PDFGURU** (trích xuất tùy ý PDF → Word/Excel).

**Khác trên dashboard:** Xử lý hàng loạt (nhiều DN/HĐ); Tra cứu DN rủi ro (có công văn); Kiểm tra tình trạng MST doanh nghiệp; Thống kê tình trạng sử dụng HĐ; ô "làm việc nhanh" theo MST/tên DN; đa doanh nghiệp trong một tài khoản.

---

## 6. Đối chiếu với VATCrawlbot (feature parity)

**Đã nằm trong kế hoạch của ta (ngang tầm, khả thi):** đăng nhập tài khoản MST; kéo hóa đơn đầu vào/đầu ra đầy đủ trường (gồm hóa đơn máy tính tiền); chi tiết dòng hàng + thuế suất từng dòng; lọc theo kỳ linh hoạt; tải XML/PDF gốc; xuất Excel; đa khách hàng (multi-tenant); đối chiếu; cảnh báo rủi ro nhà cung cấp.

**NIBOT làm thêm — cân nhắc đưa vào lộ trình nếu muốn cạnh tranh trực diện:**

- Kết xuất đa định dạng (xlsx, xml.zip, html.zip, pdf.zip, AIO.pdf gộp) thay vì chỉ Excel.
- Quy trình **duyệt nội bộ** + đánh dấu/đồng bộ hàng loạt.
- **Danh mục hàng hóa** với gán mã hàng, **gán mã tài khoản kế toán**, gom mặt hàng theo độ tương đồng, quy đổi ĐVT.
- **Định khoản kép** từ sao kê ngân hàng (OCR PDF) và tờ khai hải quan; cập nhật tỷ giá.
- Tra cứu MST kèm **công văn rủi ro** và tình trạng hoạt động; kiểm tra người bán real-time.
- Tra cứu mặt hàng **giảm/không giảm thuế theo NĐ 44 / NĐ 174**.
- **Convert sang phần mềm kế toán** (ví dụ SmartKTSC) và các tiện ích PDF (DOLAGO/DOSAKE/PDFGURU).
- Kết nối cổng **thuế điện tử – dịch vụ công** (tra cứu tờ khai, giấy nộp tiền).

**Định vị khác biệt của ta:** phần "kéo hóa đơn" họ đã làm tốt và phổ biến; lợi thế bền vững nên đặt ở **độ tin cậy đồng bộ, chất lượng đối chiếu/cảnh báo rủi ro, chiều sâu tích hợp kế toán, và uy tín tuân thủ – bảo mật** — đúng như KIEN_TRUC_VA_KE_HOACH.md đã vạch. Việc NIBOT phủ rộng nhiều nghiệp vụ cũng gợi ý một chiến lược: ta có thể chọn **đi sâu và chắc ở lõi hóa đơn + đối chiếu thuế** trước, rồi mở rộng có chọn lọc, thay vì dàn trải ngay từ đầu.

---

## 7. Ghi chú phương pháp & phạm vi

Toàn bộ quan sát lấy từ giao diện người dùng khi đăng nhập bằng tài khoản hợp lệ của chính doanh nghiệp; chỉ đọc những gì phần mềm hiển thị cho người dùng. Không thu thập dữ liệu của bên thứ ba, không phân tích lưu lượng mạng nội bộ, không dịch ngược mã nguồn NIBOT. Về bản chất, NIBOT bọc quanh **hệ thống hóa đơn điện tử và thuế điện tử của Tổng cục Thuế** — cũng chính là các hệ thống mà VATCrawlbot kết nối trực tiếp theo kênh chính thức. Bản khảo sát này là danh sách năng lực ở mức "người dùng nhìn thấy gì", đủ để làm mốc tính năng cho sản phẩm tự xây, không phải bản hướng dẫn sao chép hệ thống của NIBOT.

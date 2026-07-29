# U37 — Kịch bản nghiệm thu thật bằng tay

> Gộp phần còn treo của **U37b** (tiêu chí 7) và **U37c** (tiêu chí 11). Làm một lượt là
> đóng được cả hai.
>
> **Vì sao phải là người làm:** không ca test tự động nào chứng minh được `invoice.html` do
> Tổng cục Thuế phát ra **mở lên và đọc được bằng mắt**. Máy chỉ kiểm được tệp có mặt trong
> ZIP, đúng số lượng, đúng tên. Đó là điểm mù duy nhất còn lại của cả U37.
>
> Ngày làm: ……/……/2026 · Người làm: ………………

---

## Phần A — Phát hành (3 phút)

- [ ] **A1.** Mở <https://vatengine.tourdao.vn> → *Danh sách hóa đơn*
- [ ] **A2.** Chọn chiều **Bán ra**, chọn kỳ (ví dụ tháng 7/2026)
- [ ] **A3.** Gõ tên một khách hàng doanh nghiệp vào ô tìm → chọn từ danh sách gợi ý
- [ ] **A4.** Bấm **Lọc dữ liệu**, xác nhận có hóa đơn hiện ra
- [ ] **A5.** Ở thẻ **"Tải hóa đơn gốc gửi khách hàng"** (thẻ riêng, nằm giữa thẻ tra cứu và
      bảng kết quả) → bấm **Tải hóa đơn gốc**

  > 👉 *Điểm cần để mắt:* thẻ này có **chật chội** không? Chữ có **đủ lớn để đọc** không?
  > Đây là chỗ vừa thiết kế lại, và cỡ chữ vừa đổi theo QĐ-9b.

- [ ] **A6.** Đọc khối cảnh báo → tích ô xác nhận → bấm **Tạo đường dẫn chia sẻ**
- [ ] **A7.** Chờ dòng tiến độ chạy hết (thường vài giây; nhiều nhất khoảng 30 giây)

## Phần B — Bốn nút hành động (2 phút)

- [ ] **B1.** Thấy **"Liên kết tải hóa đơn"** — KHÔNG phải một chuỗi URL dài
- [ ] **B2.** Bấm **Sao chép liên kết** → nhãn đổi thành **"Đã sao chép"**, rồi tự trả về sau
      ~2 giây
- [ ] **B3.** Dán thử vào đâu đó (ô tìm kiếm, ghi chú) → đúng là đường dẫn `…/tai/…`
- [ ] **B4.** Bấm **Gửi Email** → ứng dụng thư mở ra, **tiêu đề + nội dung + liên kết đã điền
      sẵn**, ô người nhận **để trống** (đúng thiết kế — hóa đơn không mang email người mua)

  > 👉 *Điểm cần để mắt:* nội dung thư có bị **cụt giữa chừng** không? Có **dấu cộng `+` lạ**
  > thay cho khoảng trắng không? Hai lỗi này đã có test canh, nhưng mắt người là kiểm chứng cuối.

- [ ] **B5.** Nếu mở trên **điện thoại**: có nút **Chia sẻ** → bấm thấy khay chia sẻ của máy,
      trong đó có Zalo. *(Trên máy tính nút này **ẩn hẳn** — đó là đúng, không phải lỗi.)*

## Phần C — Điểm mù duy nhất: mở tệp ra xem (5 phút) ⭐

- [ ] **C1.** Mở liên kết trong **cửa sổ ẩn danh** (Ctrl/Cmd + Shift + N) — **không đăng nhập**
- [ ] **C2.** Tệp ZIP tải về được
- [ ] **C3.** Giải nén
- [ ] **C4.** ⭐ **Mở một tệp `.html` bằng trình duyệt** → **thấy đúng một tờ hóa đơn**, đọc được

  > 👉 **Đây là bước quan trọng nhất của cả buổi nghiệm thu.** Nếu tờ hóa đơn hiện ra vỡ
  > khung, mất chữ, hay trắng trang, hãy chụp màn hình lại — nghĩa là bộ tệp tĩnh dùng chung
  > trong ZIP chưa đủ.

- [ ] **C5.** Đối chiếu với bảng trên web: **số hóa đơn**, **mã số thuế**, **tổng tiền** khớp
- [ ] **C6.** Mở `bao-cao.txt` → số hóa đơn trong báo cáo khớp số tệp thực có

## Phần D — Thu hồi phải ăn NGAY (2 phút) ⭐

> Đây là lỗi bạn đã phát hiện: trước bản sửa, thu hồi xong link **vẫn mở được tới 4 giờ**.

- [ ] **D1.** Quay lại trang web, bấm **Thu hồi**
- [ ] **D2.** ⭐ **Ngay lập tức** (không đợi phút nào) tải lại tab ẩn danh đang mở liên kết đó
- [ ] **D3.** ⭐ Phải thấy **"Không tìm thấy tệp…"** — nếu vẫn tải được thì **DỪNG và báo tôi ngay**
- [ ] **D4.** Thử dán một liên kết bịa (đổi vài ký tự cuối) → cũng ra **đúng câu đó**, không
      phân biệt được với ca vừa thu hồi

## Phần E — Trang quản lý (2 phút)

- [ ] **E1.** Vào mục **Liên kết chia sẻ** ở thanh bên trái
- [ ] **E2.** Thấy gói vừa tạo, đúng **tên khách hàng** (không phải mã số thuế trần)
- [ ] **E3.** Trạng thái đúng là **"Đã thu hồi"**, và **số lượt tải** khớp số lần bạn đã tải
- [ ] **E4.** Gói đã thu hồi **không còn** nút chia sẻ hay liên kết nào

---

## Nếu có bước nào KHÔNG đạt

Ghi lại **số hiệu bước** (ví dụ `C4`), kèm ảnh chụp màn hình nếu là lỗi hiển thị, rồi báo
lại. Đừng tự sửa — biết chính xác bước nào hỏng thì tìm nguyên nhân nhanh hơn nhiều.

**Đặc biệt với `D3`:** nếu liên kết vẫn tải được sau khi thu hồi, đó là lỗ hổng bảo mật lặp
lại, cần dừng mọi việc khác để xử lý trước.

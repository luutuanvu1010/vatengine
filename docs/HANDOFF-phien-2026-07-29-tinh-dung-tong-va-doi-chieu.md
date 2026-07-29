# BÀN GIAO — Phiên 28–29/07/2026: tính đúng tổng tiền + phát hiện hóa đơn thay đổi

> Đọc file này là đủ để nối tiếp. Chi tiết kỹ thuật ở `docs/plans/U36-tien-do.md` và
> `docs/RA-SOAT-thong-bao-lech-hoa-don-2026-07-28.md`.

## 1. Mục tiêu phiên và mức đạt

| Mục tiêu | Đạt |
|---|---|
| Phát hiện hóa đơn đã thay đổi / bị thay thế | ✅ **Xong** |
| Tính ĐÚNG tổng: tiền trước thuế · tiền thuế · tổng sau thuế | ✅ **Xong, đã nghiệm thu trên dữ liệu thật** |
| Thông báo **số lượng** hóa đơn lệch ra màn hình | ✅ **Xong** |
| Hiện **chi tiết** hóa đơn lệch ra màn hình | ✅ **Xong** (U39/U40, cuối phiên) |

## 2. Vấn đề đã sửa — nói bằng tiếng người

Trước phiên này, khi một hóa đơn bị **thay thế** bằng hóa đơn khác, phần mềm cộng **cả hai**
vào tổng. Hệ quả đo được trên dữ liệu thật:

- Doanh thu bán ra bị thổi lên **274.535.000 ₫**
- Thuế đầu ra bị thổi lên **20.335.925 ₫**

Nay hóa đơn bị thay thế **không còn được cộng vào tiền**, nhưng **vẫn nằm trong danh sách và
trong file Excel** (đánh dấu "Tính vào tổng = Không") để không mất dấu vết.

⚠️ **Số thuế phải nộp THẬT của doanh nghiệp không hề thay đổi** — chỉ là trước đây phần mềm
tính dư. Tổng của các kỳ đã xem trước đây sẽ khác con số cũ — thông báo trên màn hình nêu rõ
bao nhiêu hóa đơn bị loại và loại đi bao nhiêu tiền; lý do đổi cách tính ghi ở
`changelog.ts` v2.0 → trang "Lịch sử cập nhật" (xem §4 vì sao không ghim vào màn nghiệp vụ).

**Kiểm chứng thật** (kỳ 07/2026, chiều Bán ra, MST 4201969169): 3 hóa đơn bị thay thế, thuế
giảm đúng **1.711.111 ₫**, tổng thanh toán giảm **23.100.000 ₫**. Đối chiếu bằng máy với file
Excel người dùng tải về — khớp **từng đồng**, 3.589 hóa đơn / 7.923 dòng, không sót dòng nào.

## 3. Người dùng thấy gì mới

1. **Trang Danh sách hóa đơn** — thông báo tách theo Mua vào / Bán ra: bao nhiêu hóa đơn bị
   loại, loại đi bao nhiêu tiền thuế và tổng thanh toán, cộng dòng *"Thuế phải nộp trên báo
   cáo giảm X ₫"*.
2. **Cảnh báo vàng** khi hóa đơn của kỳ đang xem bị sửa bởi hóa đơn **kỳ khác** — nguy cơ phải
   khai bổ sung.
3. **File Excel** thêm 3 cột: `Trạng thái HĐ (mã)` · `Trạng thái` (Gốc / Thay thế / Điều chỉnh
   / Bị thay thế / Bị điều chỉnh) · `Tính vào tổng` (Có/Không). Mặc định 19 cột.
4. **Chấm đỏ** đếm số, kiểu ứng dụng di động — nay gắn trên nút "Hóa đơn bị sửa ở kỳ khác"
   (xem §4; nút cũ "Hóa đơn vừa thay đổi" đã bỏ).
5. **Trang Đối chiếu** bật lại trong menu — hiện danh sách chi tiết hóa đơn lệch thuế / nghi
   thiếu số / bị thay thế.
6. **Đủ BỘ BA số tiền** trong thông báo (trước thuế · thuế · tổng sau thuế), tách hai nhóm:
   mã 4 *"đã loại khỏi tổng"* và mã 5 *"VẪN tính vào tổng"* — không gộp, vì gộp sẽ khiến kế
   toán trừ nhầm phần mã 5 ra khỏi sổ.
7. **Nút "Xem danh sách N hóa đơn"** bung tại chỗ, liệt kê từng hóa đơn bị sửa của kỳ.
8. **Nút "Hóa đơn bị sửa ở kỳ khác"** thay cho "Hóa đơn vừa thay đổi" — xem §4.

## 4. Nút cảnh báo đã ĐỔI RUỘT — đọc kỹ nếu bạn từng dùng nút cũ

Nút **"Hóa đơn vừa thay đổi"** không còn. Thay bằng **"Hóa đơn bị sửa ở kỳ khác"**.

Nút cũ sai ba chỗ (đo trên production 29/07):
- **Thiếu** — nó đọc bảng lịch sử do trigger `AFTER UPDATE` ghi, nên chỉ thấy hóa đơn đổi
  trạng thái TRONG LÚC hệ thống theo dõi. **16/17 hóa đơn mã 4 đã là mã 4 ngay lần đồng bộ
  đầu** ⇒ nút báo "1" trong khi thực có 17.
- **Dư** — hóa đơn của kỳ đang xem đã được thẻ Kết quả liệt kê đủ ngay bên dưới.
- **Cảnh báo tự tắt khi bấm xem** — nhìn một cái là mất vĩnh viễn, không có đường quay lại.

Mô hình mới (chủ dự án chốt): **cảnh báo luôn hiển thị, hết hiệu lực khi hóa đơn không còn
thuộc kỳ đang truy vấn**. KHÔNG còn trạng thái "đã đọc" — con số là hàm thuần của
*dữ liệu × bộ lọc*: `tổng bị sửa (bỏ ngày) − số bị sửa trong kỳ`. Không thể lệch, không thể
lỡ tay tắt mất. Cùng triết lý `packages/reconcile` (tính on-read, không lưu).

Hai chỗ nay chia việc rạch ròi, không chồng lấn:

| | Trả lời câu hỏi | Phạm vi |
|---|---|---|
| Thẻ **Kết quả** | *"Kỳ này có bao nhiêu hóa đơn lệch, tiền bao nhiêu, là những hóa đơn nào?"* | Kỳ đang lọc |
| Nút **"bị sửa ở kỳ khác"** | *"Ngoài kỳ này còn gì?"* — bấm vào nhảy thẳng sang kỳ đó | Ngoài kỳ đang lọc |

**Áp dụng CẢ HAI CHIỀU.** Số thật 29/07: bán ra 17 mã 4 + 1 mã 5; **mua vào 2 mã 5**. Mã 4 ở
chiều mua vào chưa từng thấy ca nào, nhưng biên bản §6.5 đã **rút** kết luận "GDT không trả
bản gốc cho bên mua" (cỡ mẫu = 1) ⇒ mã và test cố ý xử lý hai chiều như nhau.

**Đã gỡ có chủ đích, đừng thêm lại:**
- `apiClient.getInvoiceChanges` / `markInvoiceChangesRead`. Endpoint server và bảng
  `lich_su_thay_doi_hoa_don` **giữ nguyên** làm dấu vết kiểm toán.
- Dòng *"Từ 28/07/2026, hóa đơn bị thay thế không còn được cộng vào tổng"* — `U36-plan.md`
  §7.2 ghi "bắt buộc" nhưng đã GỠ: là thông báo **di trú**, chỉ có nghĩa với người đã thấy số
  cũ, mà ghim vĩnh viễn và thừa. Nội dung nằm ở `changelog.ts` v2.0 → trang Lịch sử cập nhật.

## 5. Đang kẹt — cần bàn thêm

**Vấn đề:** 2.138 hóa đơn **bán hàng** (mẫu số 2, chiếm 6,3%) hiện **không được kiểm gì cả**.

Vì sao: loại hóa đơn này không tách thuế GTGT nên Tổng cục Thuế chỉ trả tổng thanh toán, không
trả tiền-trước-thuế và tiền-thuế. Phép kiểm hiện có cần đủ ba số nên bỏ qua chúng — **đúng
về nguyên tắc**, nhưng nghĩa là chúng chưa từng được hỏi tới. (Đã probe: **không phải lỗi phần
mềm**, mapper khớp dữ liệu gốc 33.945/33.945.)

**Đã thử phép kiểm thay thế và DỪNG.** So `tổng các dòng hàng` với `tổng thanh toán`: 2.098
hóa đơn khớp tuyệt đối, **28 hóa đơn lệch**. Nhưng tỉ lệ chênh rơi vào các mức lặp lại —
`1.0020` xuất hiện đúng **13 lần**, rồi 3%, 5,9%, 16,8%. Một tỉ lệ trùng khít 13 lần là **quy
tắc nghiệp vụ (nhiều khả năng là chiết khấu %)**, không phải 13 lỗi.

Chiết khấu có trong dữ liệu gốc (`stckhau`, `tlckhau` ở mức dòng hàng) nhưng **chưa được lưu
ra cột**. Trừ thử thì lại **tệ hơn** (25 → 28 ca lệch) ⇒ chưa hiểu đúng cách nó được ghi.

**Vì sao dừng:** đối chiếu là công cụ *kết tội*. Bắn 28 cảnh báo chưa hiểu nổi sẽ khiến kế
toán mất niềm tin, và khi đó **15 ca lệch thuế thật cũng chìm theo**.

**Đường ra, rẻ nhất trước:** soi tay 2–3 hóa đơn có tỉ lệ `1.0020`, đọc thẳng dữ liệu gốc xem
chiết khấu được ghi kiểu gì → nếu vẫn mơ hồ thì mở hóa đơn đó trên cổng thuế → có kết luận rồi
mới lưu `stckhau`/`tlckhau` ra cột và chốt công thức. **Không code trước khi giải thích được
cả 28 ca.**

## 6. Đã deploy gì

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| `vat-api` | `354ff45c` | Tính tổng loại hóa đơn bị thay thế + cờ lọc `biSua` |
| `vat-web` | `5a8db0af` | Mới nhất — gồm trang Đối chiếu + U39/U40 |
| Migration | `0018` + **`0019` đã áp** | Hậu kiểm bằng truy vấn thật: bảng `tep_hoa_don_goc` tồn tại, `vat_app` đủ quyền |
| `vat-sync-worker` | không đụng | Không phụ thuộc phần đã sửa |

⚠️ **Vẫn giữ kỷ luật `make migrate` trước mỗi lần deploy `vat-api`/`sync-worker`** — phiên U37
còn đang làm và có thể thêm migration mới. Ghi nhận: `sync-worker e7a641fc` được deploy
28/07 21:49 **trước khi** `0019` được áp (29/07) — thứ tự ngược `deploy.md`; nay đã nhất quán,
nhưng phiên U37 nên soi log khoảng giữa đó.

## 7. Nợ kỹ thuật đáng chú ý

| Nợ | Mức |
|---|---|
| 2.138 hóa đơn bán hàng chưa được kiểm (§5) | cao |
| Cảnh báo vắt kỳ đầy đủ — cần ghép cặp gốc↔mới qua `shdgoc` | trung bình (**U37** đang làm) |
| Màn Đối chiếu chưa phân biệt "điều chỉnh" với "thay thế" (`FindingKind`) | trung bình |
| Số học chuỗi thập phân đang có **hai nơi** | thấp |
| `audit_log` cấp thừa quyền UPDATE/DELETE, trái `security.md` | thấp |

Chi tiết đầy đủ: `docs/BACKLOG-y-tuong-va-de-xuat.md`.

## 8. Ba việc cần quyết

1. ~~Bung danh sách hóa đơn lệch~~ **✅ XONG** (U39/U40).
2. Có làm tiếp phép kiểm cho hóa đơn bán hàng không, và ai soi tay 2–3 hóa đơn mẫu? (§5)
3. Mã **"hủy"** thật vẫn CHƯA có bằng chứng — cả 33.945 hóa đơn chưa có ca nào. Giữ nguyên
   trạng thái "chưa biết", hay chủ động tạo một ca hủy thử trên cổng thuế để lấy bằng chứng?

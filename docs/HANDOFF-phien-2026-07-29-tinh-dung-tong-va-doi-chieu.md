# BÀN GIAO — Phiên 28–29/07/2026: tính đúng tổng tiền + phát hiện hóa đơn thay đổi

> Đọc file này là đủ để nối tiếp. Chi tiết kỹ thuật ở `docs/plans/U36-tien-do.md` và
> `docs/RA-SOAT-thong-bao-lech-hoa-don-2026-07-28.md`.

## 1. Mục tiêu phiên và mức đạt

| Mục tiêu | Đạt |
|---|---|
| Phát hiện hóa đơn đã thay đổi / bị thay thế | ✅ **Xong** |
| Tính ĐÚNG tổng: tiền trước thuế · tiền thuế · tổng sau thuế | ✅ **Xong, đã nghiệm thu trên dữ liệu thật** |
| Thông báo **số lượng** hóa đơn lệch ra màn hình | ✅ **Xong** |
| Hiện **chi tiết** hóa đơn lệch ra màn hình | ⚠️ **Một phần** — xem §4 |

## 2. Vấn đề đã sửa — nói bằng tiếng người

Trước phiên này, khi một hóa đơn bị **thay thế** bằng hóa đơn khác, phần mềm cộng **cả hai**
vào tổng. Hệ quả đo được trên dữ liệu thật:

- Doanh thu bán ra bị thổi lên **274.535.000 ₫**
- Thuế đầu ra bị thổi lên **20.335.925 ₫**

Nay hóa đơn bị thay thế **không còn được cộng vào tiền**, nhưng **vẫn nằm trong danh sách và
trong file Excel** (đánh dấu "Tính vào tổng = Không") để không mất dấu vết.

⚠️ **Số thuế phải nộp THẬT của doanh nghiệp không hề thay đổi** — chỉ là trước đây phần mềm
tính dư. Tổng của các kỳ đã xem trước đây sẽ khác con số cũ; màn hình có dòng giải thích và
`changelog.ts` đã ghi (v2.0).

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
4. **Chấm đỏ** số chưa đọc trên nút "Hóa đơn vừa thay đổi" (kiểu ứng dụng di động).
5. **Trang Đối chiếu** bật lại trong menu — hiện danh sách chi tiết hóa đơn lệch thuế / nghi
   thiếu số / bị thay thế.

## 4. ⚠️ Chưa xong — "chi tiết hóa đơn lệch" mới có một nửa

| Nơi | Có gì |
|---|---|
| Trang **Đối chiếu** | ✅ Liệt kê **chi tiết từng hóa đơn** lệch thuế / nghi thiếu / bị thay thế |
| Nút **"Hóa đơn vừa thay đổi"** | ✅ Liệt kê chi tiết từng hóa đơn đổi trạng thái |
| Trang **Danh sách hóa đơn** | ❌ Chỉ hiện **số lượng + số tiền**, KHÔNG liệt kê hóa đơn nào |

Muốn xem *"3 hóa đơn bị thay thế đó là hóa đơn nào"* thì hiện phải sang trang Đối chiếu hoặc
mở file Excel lọc cột "Tính vào tổng = Không". **Cần bàn:** có nên cho bấm vào con số trên
trang Danh sách để bung ra danh sách hóa đơn không?

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
| `vat-api` | `53dd450f` | Tính tổng loại hóa đơn bị thay thế |
| `vat-web` | `5fd9bcad` | Mới nhất — gồm cả trang Đối chiếu |
| Migration | `0018` đã áp | ⚠️ **`0019` (U37) CHƯA áp** |
| `vat-sync-worker` | không đụng | Không phụ thuộc phần đã sửa |

⚠️ **Ai deploy `vat-api` hoặc `sync-worker` lần tới PHẢI chạy `make migrate` TRƯỚC** — phiên
U37 đã thêm migration `0019` (bảng `tep_hoa_don_goc`) chưa có trên production.

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

1. Có cho bấm vào số trên trang Danh sách để **bung danh sách hóa đơn lệch** không? (§4)
2. Có làm tiếp phép kiểm cho hóa đơn bán hàng không, và ai soi tay 2–3 hóa đơn mẫu? (§5)
3. Mã **"hủy"** thật vẫn CHƯA có bằng chứng — cả 33.945 hóa đơn chưa có ca nào. Giữ nguyên
   trạng thái "chưa biết", hay chủ động tạo một ca hủy thử trên cổng thuế để lấy bằng chứng?

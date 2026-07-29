# Đối chiếu NIBOT vs VATengine — Mua vào, MST 4201969169, tháng 07/2026

Ngày đối chiếu: 29/07/2026
Nguồn:
- `MUA_VAO_4201969169 by nibot.xlsx` (NIBOT) — 6 sheet, cấp hóa đơn
- `vatengine-export-01072026-31072026 by VATengine.xlsx` (ta) — 1 sheet, cấp dòng hàng

## 1. Phạm vi dữ liệu

| | NIBOT | VATengine |
|---|---|---|
| Khoảng ngày thực có | 01/07 – **26/07**/2026 | 01/07 – **28/07**/2026 |
| Số hóa đơn | 6.734 | **7.235** |
| Số dòng | 6.734 (1 dòng = 1 HĐ) | 15.211 (1 dòng = 1 mặt hàng) |

- **Không có hóa đơn nào NIBOT có mà VATengine thiếu** (0 trường hợp).
- VATengine có thêm **501 hóa đơn** của ngày 27/07 (236) và 28/07 (265) — do file NIBOT được kết xuất sớm hơn, không phải lỗi dữ liệu.

→ **Độ phủ hóa đơn: khớp 100%, VATengine là tập cha.**

## 2. Khác biệt về định dạng ký hiệu

- NIBOT ghi ký hiệu **kèm mẫu số**: `1C26MHE`, `2C26MTP`.
- VATengine ghi **không kèm mẫu số**: `C26MHE`, `C26MTP`.

Phải bỏ ký tự số đầu mới ghép khóa được. Cần thống nhất (khuyến nghị: xuất thêm cột `Mẫu số` riêng, hoặc theo chuẩn NIBOT để kế toán quen mắt).

## 3. Khác biệt về số tiền (trên 6.734 HĐ trùng nhau)

| | Chưa thuế | Tiền thuế | Tổng thanh toán |
|---|---|---|---|
| NIBOT | 22.543.184.412 | 1.801.712.400 | 24.344.896.812 |
| VATengine | 22.543.200.371 | 1.801.712.625 | 24.329.123.163 |
| Lệch | +15.959 | +225 | **−15.773.648** |

24 hóa đơn lệch, chia làm 2 nhóm:

**a) Lệch làm tròn — 12 HĐ, mỗi HĐ ±2đ.**
Do VATengine cộng dồn từ dòng hàng, NIBOT lấy tổng ở đầu hóa đơn. Không nghiêm trọng nhưng gây sai lệch khi kê khai. **Khuyến nghị: xuất thêm cột tổng ở cấp hóa đơn lấy thẳng từ GDT, không tự cộng.**

**b) Lệch thật — 12 HĐ, cột "Tổng tiền (sau thuế)" ở dòng hàng bằng 0.** ← Đây là lỗi cần sửa.
- 11 HĐ của MST `4200240380` ký hiệu `K26TPK` (dầu Điêzen, Petrolimex) — trước thuế có số, tổng sau thuế = 0.
- 1 HĐ `056098004516 / C26MTP / 194` — trước thuế lệch 15.960đ (2.660.000 vs 2.644.040).

Tổng phần hụt ≈ 15,77 triệu, chính là nguyên nhân của con số −15.773.648 ở trên.

## 4. Khác biệt về trường dữ liệu

**NIBOT có, VATengine chưa có:**
Địa chỉ người bán, Địa chỉ người mua, Hình thức thanh toán (HTTT), Kết quả kiểm tra (mã CQT: "HĐ có mã từ máy tính tiền" / "TCT k nhận mã" / "Đã cấp MST"), Tiền chiết khấu thương mại, Tiền phí, Duyệt nội bộ, cột Bảng kê.

**VATengine có, NIBOT (sheet tổng quát) không có:**
Chi tiết dòng hàng: Tên hàng hóa, Số lượng, Đơn giá, Thuế suất từng dòng. (NIBOT để riêng ở sheet `Smart_KTSC_OK`.)

**Cấu trúc file:**
NIBOT xuất 6 sheet phục vụ nghiệp vụ sẵn — Tổng quát, Bảng kê mua vào, Bảng kê KCT/HĐBH, Bảng kê không kê khai khấu trừ, Bảng kê hoàn thuế, và file nhập cho phần mềm kế toán (`Smart_KTSC_OK`, 46 cột). VATengine mới có 1 sheet phẳng.

## 5. Việc cần làm

| Ưu tiên | Việc |
|---|---|
| Cao | Sửa 12 HĐ có `Tổng tiền (sau thuế)` = 0 ở cấp dòng (dầu Điêzen K26TPK) |
| Cao | Bổ sung tổng tiền cấp hóa đơn lấy trực tiếp từ GDT, tránh lệch làm tròn |
| Trung bình | Thống nhất định dạng ký hiệu (mẫu số + ký hiệu) |
| Trung bình | Bổ sung trường: địa chỉ, HTTT, kết quả kiểm tra CQT, chiết khấu, phí |
| Thấp | 5 dòng trống tên hàng hóa cần rà lại |
| Thấp | Cân nhắc xuất đa sheet (bảng kê, file nhập kế toán) như NIBOT |

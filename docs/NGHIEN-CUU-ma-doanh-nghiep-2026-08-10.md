# Nghiên cứu — Các loại mã số thuế/mã doanh nghiệp tại Việt Nam và phạm vi chấp nhận khi đăng ký

Ngày: 2026-08-10. Bối cảnh: mã đơn vị phụ thuộc dạng `0305097236-005` bị cổng đăng ký từ chối
(`mst_khong_hop_le`) vì `MST_RE` cũ chỉ nhận chuỗi thuần chữ số 10/12/13 ký tự.

## Các dạng mã hợp lệ (cơ sở pháp lý)

| Dạng | Cấu trúc | Đối tượng | Nguồn |
|---|---|---|---|
| 10 chữ số | `N1…N10` | Doanh nghiệp, tổ chức, đơn vị độc lập | TT 105/2020/TT-BTC, Điều 5 |
| 13 ký tự có gạch ngang | `N1…N10-N11N12N13` | Đơn vị phụ thuộc (chi nhánh, VPĐD, địa điểm kinh doanh) — **dấu gạch ngang là một phần của cách viết chính thức** | TT 105/2020/TT-BTC, Điều 5 khoản 1: "Mã số thuế 13 chữ số và dấu gạch ngang (-)" |
| 13 chữ số liền | `N1…N13` | Biến thể bỏ gạch của cùng mã trên (nhiều hệ thống lưu không gạch) | Quan sát thực tế; giữ để tương thích |
| 12 chữ số | Số định danh cá nhân (CCCD) | Cá nhân, hộ kinh doanh — dùng thay MST từ 01/07/2025 | TT 86/2024/TT-BTC |

Ghi chú thêm: theo Luật Doanh nghiệp 2020 + NĐ 01/2021/NĐ-CP, **mã số doanh nghiệp đồng thời
là mã số thuế** — không tồn tại loại mã đăng ký kinh doanh riêng cần xử lý khác.

## Quyết định

- `MST_RE = /^\d{10}(-\d{3})?$|^\d{12}$|^\d{13}$/` — thêm nhánh `10 số-3 số`, giữ nguyên
  các dạng cũ. Áp dụng đồng bộ ở 4 nơi: `apps/api/src/routes/dangKy.ts`,
  `apps/api/src/routes/admin/tenants.ts`, `apps/admin/.../DoiMstDialog.tsx`,
  `apps/web/.../DangKyPage.tsx`.
- **Giữ giá trị verbatim, KHÔNG chuẩn hóa** `0305097236-005` ⇄ `0305097236005`: hệ thống
  Tổng cục Thuế dùng dạng có gạch làm username đăng nhập; tự đổi dạng có thể làm lệch với
  tài khoản thuế của khách. Hệ quả chấp nhận được: hai cách viết của cùng một mã là hai giá
  trị khác nhau đối với ràng buộc UNIQUE — nếu thành vấn đề thực tế, cân nhắc chuẩn hóa khi
  so trùng (CHƯA KIỂM CHỨNG là có xảy ra).
- Ô nhập MST ở trang đăng ký bỏ `inputMode="numeric"`: bàn phím số trên di động thiếu phím
  `-`, chi nhánh sẽ không gõ được mã của chính mình.

## Đã kiểm chứng / chưa kiểm chứng

- Đã kiểm chứng bằng test tự động: các dạng trên được nhận/từ chối đúng ở cổng đăng ký,
  cổng đổi MST admin, và validate client (web + admin).
- CHƯA KIỂM CHỨNG: hành vi đăng nhập hoadondientu.gdt.gov.vn với username dạng 13 số liền
  (không gạch) — khi làm tính năng kết nối thuế cho chi nhánh, cần contract test riêng.

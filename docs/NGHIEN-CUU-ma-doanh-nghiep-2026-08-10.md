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
- **Chuẩn hóa lúc GHI** (cập nhật cùng ngày, thay quyết định "verbatim" ban đầu): toàn hệ
  thống vatengine dùng chuỗi thuần chữ số cho MST (username tài khoản thuế tự gán =
  `tenants.mst`, ràng buộc UNIQUE, đối chiếu `nbmst` hóa đơn), nên dạng có gạch được nhận
  ở ô nhập rồi chuẩn hóa về 13 số liền trước khi lưu — `chuanHoaMst` trong
  `apps/api/src/lib/mst.ts` (một nguồn cho cả cổng đăng ký lẫn cổng đổi MST admin). Nhờ đó
  `0305097236-005` và `0305097236005` là MỘT mã, không thành hai tenant.
- Ô nhập MST ở trang đăng ký bỏ `inputMode="numeric"`: bàn phím số trên di động thiếu phím
  `-`, chi nhánh sẽ không gõ được mã của chính mình.

## Đã kiểm chứng / chưa kiểm chứng

- Đã kiểm chứng bằng test tự động: các dạng trên được nhận/từ chối đúng ở cổng đăng ký,
  cổng đổi MST admin, và validate client (web + admin).
- CHƯA KIỂM CHỨNG: hành vi đăng nhập hoadondientu.gdt.gov.vn với username dạng 13 số liền
  (không gạch) — khi làm tính năng kết nối thuế cho chi nhánh, cần contract test riêng.
  Nếu Tổng cục Thuế chỉ nhận dạng CÓ gạch, tầng kết nối thuế phải trình bày lại dạng gạch
  từ 13 số liền (phép đổi hai chiều là 1-1 nên không mất thông tin).

# U37b — Nhật ký tiến độ

Một dòng mỗi gói: `[gói] — DONE/BLOCKED — commit — ghi chú`.
Đặc tả: `docs/plans/U37b-plan.md`.

| Gói | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| Gói 0 — endpoint danh sách khách hàng | ✅ DONE | `b5f8e35` | ⚠️ Làm TRƯỚC khi có `U37b-plan.md` — bỏ qua cổng QA1, sai quy trình `/plan-unit → /write-prompt → /start-unit`. Không cuộn lại vì nằm đúng phạm vi §8 đã duyệt và có 12 test canh. Kèm đính chính: bộ lọc `nmmst` vốn ĐÃ có sẵn trên FilterBar |
| Gói 1 — ô tìm live chọn khách hàng | ✅ DONE | `9cfa5cf` | Primitive `ComboBox` + `boDau/khopTim` + `ChonKhachHang` + đấu vào FilterBar. 24 test mới. GOLDEN ĐỔI CÓ CHỦ ĐÍCH: `filterBarDirection.test.tsx` — nhãn ô bên mua đổi "MST người mua" → "Khách hàng", và FilterBar từ nay CẦN QueryClientProvider |
| Gói 2 — bảng `goi_chia_se` + migration | ✅ DONE | `3bd87f4` | 8 test xanh. Bẫy `_journal.json` NỔ đúng dự đoán: 0020.when sinh ra là 29/07 < 0019 (02/08) ⇒ đã đặt lại `0019.when + 60000`. **Cổng dừng 1 ĐÃ QUA**: migration áp production 2026-07-29, hậu kiểm `hau-kiem-bang.mjs goi_chia_se` → **8/8 ĐẠT** (bảng, RLS ENABLE+FORCE, policy, vat_app S/I/U và KHÔNG DELETE; UNIQUE khoa_r2 + 2 FK + 3 index đều có thật) |
| Gói 3 — hạ tầng bucket công khai | ✅ DONE (hạ tầng đã dựng) | `20cee3f` | Bucket `vat-chia-se` + `docs.tourdao.vn` (min-TLS 1.2) + lifecycle 30 ngày prefix `goi-hoa-don/` + `r2.dev` **disabled** — hậu kiểm 4/4 đạt. ✅ Phần treo đã kiểm chứng: `ssl_status` active; gốc bucket và khóa không tồn tại đều trả **404** ⇒ không liệt kê được nội dung, giả định "khóa là thứ duy nhất bảo vệ file" đứng vững |
| Gói 4a — tầng truy vấn phát hành gói | ✅ DONE | `d82802e` | `listHoaDonChoGoi` (NGUỒN DUY NHẤT sinh `ref` — ràng buộc bảo mật) + `demTienDoGoi` (đếm từ `tep_hoa_don_goc`, QĐ-B8). 11 test xanh |
| Gói 4b — endpoint tạo gói | ✅ DONE | `af4a181` | `POST /goi-chia-se`. 14 test xanh. Test bắt 2 lỗi THẬT: token chỉ có 100 bit (không phải 128 — ánh xạ 1 byte→1 ký tự vứt 3 bit), và `nguoi_tao` vỡ FK khi token còn hạn mà người dùng đã bị xóa |
| Gói 4c-1 — hàm thuần `dungGoiZip` | ✅ DONE | `5c98f1d` | Đặt ở `packages/export` (đã có fflate + @vat/domain) chứ không phải apps/api. `boDau` chuyển sang @vat/domain dùng chung. 14 test |
| Gói 4c-2/4c-3 — GET tiến độ + POST đóng gói | ✅ DONE | `ed7ee67` | GET thuần đọc; POST bầu người đóng bằng UPDATE có điều kiện; hết hạn 7 ngày đặt lúc PHÁT HÀNH |
| Gói 5 — thu hồi + danh sách + audit | ✅ DONE | `ed7ee67` | Thu hồi mở MỌI VAI, xóa R2 trước đổi trạng thái sau, idempotent; audit cả phát hành lẫn thu hồi, chiTiet không chứa khóa |
| Gói 6 — giao diện | ✅ DONE | `<pending>` | `TaiHoaDonGoc`: ba vế mở nút mỗi vế một lý do riêng, cảnh báo inline + checkbox (QĐ-B11), poll tiến độ, link + thu hồi. 13 test |
| Gói 7 — tài liệu | ⏸ | — | |

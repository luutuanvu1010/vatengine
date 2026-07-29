# U37b — Nhật ký tiến độ

Một dòng mỗi gói: `[gói] — DONE/BLOCKED — commit — ghi chú`.
Đặc tả: `docs/plans/U37b-plan.md`.

| Gói | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| Gói 0 — endpoint danh sách khách hàng | ✅ DONE | `b5f8e35` | ⚠️ Làm TRƯỚC khi có `U37b-plan.md` — bỏ qua cổng QA1, sai quy trình `/plan-unit → /write-prompt → /start-unit`. Không cuộn lại vì nằm đúng phạm vi §8 đã duyệt và có 12 test canh. Kèm đính chính: bộ lọc `nmmst` vốn ĐÃ có sẵn trên FilterBar |
| Gói 1 — ô tìm live chọn khách hàng | ✅ DONE | `9cfa5cf` | Primitive `ComboBox` + `boDau/khopTim` + `ChonKhachHang` + đấu vào FilterBar. 24 test mới. GOLDEN ĐỔI CÓ CHỦ ĐÍCH: `filterBarDirection.test.tsx` — nhãn ô bên mua đổi "MST người mua" → "Khách hàng", và FilterBar từ nay CẦN QueryClientProvider |
| Gói 2 — bảng `goi_chia_se` + migration | ⏸ | — | |
| Gói 3 — hạ tầng bucket công khai | ⏸ | — | Cần chủ dự án thao tác |
| Gói 4 — phát hành gói | ⏸ | — | |
| Gói 5 — thu hồi + audit | ⏸ | — | |
| Gói 6 — giao diện | ⏸ | — | |
| Gói 7 — tài liệu | ⏸ | — | |

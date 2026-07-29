# U37b — Nhật ký tiến độ

Một dòng mỗi gói: `[gói] — DONE/BLOCKED — commit — ghi chú`.
Đặc tả: `docs/plans/U37b-plan.md`.

| Gói | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| Gói 0 — endpoint danh sách khách hàng | ✅ DONE | `b5f8e35` | ⚠️ Làm TRƯỚC khi có `U37b-plan.md` — bỏ qua cổng QA1, sai quy trình `/plan-unit → /write-prompt → /start-unit`. Không cuộn lại vì nằm đúng phạm vi §8 đã duyệt và có 12 test canh. Kèm đính chính: bộ lọc `nmmst` vốn ĐÃ có sẵn trên FilterBar |
| Gói 1 — ô tìm live chọn khách hàng | ✅ DONE | `9cfa5cf` | Primitive `ComboBox` + `boDau/khopTim` + `ChonKhachHang` + đấu vào FilterBar. 24 test mới. GOLDEN ĐỔI CÓ CHỦ ĐÍCH: `filterBarDirection.test.tsx` — nhãn ô bên mua đổi "MST người mua" → "Khách hàng", và FilterBar từ nay CẦN QueryClientProvider |
| Gói 2 — bảng `goi_chia_se` + migration | ✅ DONE | `3bd87f4` | 8 test xanh. Bẫy `_journal.json` NỔ đúng dự đoán: 0020.when sinh ra là 29/07 < 0019 (02/08) ⇒ đã đặt lại `0019.when + 60000`. **Cổng dừng 1 ĐÃ QUA**: migration áp production 2026-07-29, hậu kiểm `hau-kiem-bang.mjs goi_chia_se` → **8/8 ĐẠT** (bảng, RLS ENABLE+FORCE, policy, vat_app S/I/U và KHÔNG DELETE; UNIQUE khoa_r2 + 2 FK + 3 index đều có thật) |
| Gói 3 — hạ tầng bucket công khai | ⏸ **CỔNG DỪNG 2** — Claude xong phần mã, chờ chủ dự án dựng hạ tầng | `<pending>` | Binding `CHIA_SE` + `Env` + dummy test. Lệnh + checklist ở `U37b-goi3-ha-tang-bucket.md` (cú pháp lấy từ wrangler 4.110 đang cài, không chép trí nhớ). Cần **Zone ID** của tourdao.vn. ⚠️ Bước dễ sót nhất: xác nhận `r2.dev` ĐANG TẮT |
| Gói 4 — phát hành gói | ⏸ | — | |
| Gói 5 — thu hồi + audit | ⏸ | — | |
| Gói 6 — giao diện | ⏸ | — | |
| Gói 7 — tài liệu | ⏸ | — | |

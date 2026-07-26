# Prompt giao Code: nút "Buộc đồng bộ lại kỳ này" (frontend)

> Ngày tạo: 2026-07-25. Mục đích: biến thao tác gọi API force-backfill bằng Console
> (quá khó cho người dùng cuối) thành một nút bấm trong app. Backend `force` đã LIVE
> (vat-api commit 97285f1, version 09383387) — nhiệm vụ này CHỈ frontend.
> Bối cảnh gốc rễ: `docs/CHAN-DOAN-thieu-hoa-don-thang.md`.

---

NHIỆM VỤ (vai Code — dự án vatengine): Thêm nút "Buộc đồng bộ lại kỳ này" ở
frontend để quản trị viên re-sync một kỳ ĐÃ đồng bộ chỉ bằng một click, thay cho
thao tác gọi API bằng Console (quá khó cho người dùng cuối).

── BỐI CẢNH (đã xác minh, đừng điều tra lại) ──
- Lỗi: hóa đơn tháng bị THIẾU (vd MST 4201969169 tháng 6: DB 6802 vs thực ~7000).
  Gốc rễ: production kéo thiếu do GDT rate-limit (429/"Too many subrequests") làm
  phiên fail, + backfill BỎ QUA tháng đã có phiên completed → không đường lấy lại.
  Chi tiết: docs/CHAN-DOAN-thieu-hoa-don-thang.md.
- ĐÃ LÀM (backend): thêm cờ `force` vào POST /tax-accounts/:id/backfill. Khi
  force=true → bỏ coverage, enqueue MỌI tháng trong khoảng; upsert idempotent hợp
  thêm phần thiếu. Commit 97285f1, đã deploy vat-api (version 09383387). LIVE.
- CÒN LẠI (việc của bạn): chỉ FRONTEND. TUYỆT ĐỐI KHÔNG sửa backend/gdt-client/sync.

── HỢP ĐỒNG API (đã live, không đổi) ──
POST /api/tax-accounts/:id/backfill
  body: { tuNgay: "YYYY-MM-DD", denNgay: "YYYY-MM-DD", force?: boolean }
  force:true → re-sync mọi tháng trong khoảng, kể cả kỳ đã phủ.
  trả 202 { backfillId, thangCanLay, tongSoThang } (như cũ).

── MỤC TIÊU UX ──
Trong bảng điều khiển đồng bộ khoảng đã lọc, thêm một lựa chọn "Buộc lấy lại (kể cả
kỳ đã đồng bộ)" — khi bật rồi bấm đồng bộ, gọi backfill với force:true. Mặc định TẮT
(hành vi hiện tại giữ nguyên). Chỉ hiện cho vai quản trị (ke_toan không thấy — theo
đúng gate auto-backfill hiện có).

── FILE LIÊN QUAN (đọc trước khi sửa) ──
- apps/web/src/features/invoices/RangeSyncPanel.tsx   (UI "Đồng bộ khoảng")
- apps/web/src/features/invoices/useRangeBackfill.ts  (hook gọi backfill)
- apps/web/src/lib/apiClient.ts:303 backfillTaxAccount (thêm tham số force)
- apps/web/src/types/api.ts (nếu cần mở rộng kiểu range)

── RÀNG BUỘC BẮT BUỘC (Hiến pháp + luật) ──
1. Đọc CLAUDE.md, .claude/rules/ui.md, .claude/rules/testing.md, .claude/rules/
   multi-tenant.md TRƯỚC khi code.
2. TDD: viết test TRƯỚC (đỏ → xanh). Test hook truyền đúng force xuống apiClient;
   test panel bật/tắt tùy chọn + gate theo vai.
3. ui.md: chỉ dùng primitive chung (components/ui/primitives.tsx) + token (--…);
   KHÔNG hardcode hex/px; nhãn một-nguồn; đủ 4 trạng thái (rảnh/tải/rỗng/lỗi).
   Nếu thiếu primitive (vd Checkbox) → THÊM vào thư viện, không tô nội tuyến.
4. An toàn đa-tenant client (multi-tenant.md H-B.3): không rò dữ liệu qua phiên.
5. Phạm vi HẸP: chỉ thêm tùy chọn force. Không đổi luồng backfill khác, không
   refactor ngoài phạm vi.

── TIÊU CHÍ NGHIỆM THU ──
- Bật "Buộc lấy lại" + đồng bộ → request body có force:true; tắt → không có (hoặc
  false). Kiểm bằng test.
- Vai ke_toan không thấy/không dùng được tùy chọn này.
- make lint sạch (biome + tsc); make test xanh; không giảm độ phủ.

── CỔNG DỪNG ──
- Nếu vị trí/kiểu nút (checkbox cạnh nút, hay nút phụ, hay xác nhận cảnh báo) chưa
  rõ về thẩm mỹ → DỪNG, đề xuất 1–2 phương án kèm mockup, hỏi chủ dự án duyệt bề
  mặt (đây là quyết định Design theo CLAUDE.md), rồi mới hiện thực.
  (Muốn bỏ bước hỏi: chủ dự án ghi "Tự chọn checkbox cạnh nút đồng bộ, không cần
   duyệt bề mặt.")

── KIỂM CHỨNG & GIAO NỘP ──
1. make lint && make test (dán kết quả).
2. Build vat-web (npm run -w apps/web build); grep dist/assets/*.js xác nhận có
   "force" trong đường backfill TRƯỚC khi deploy (bài học: luôn grep bundle).
3. cd apps/web && npx wrangler deploy. Ghi lại Version ID.
4. Hướng dẫn chủ dự án: đăng nhập vatengine.tourdao.vn (tài khoản quản trị MST
   4201969169) → lọc Mua vào 01/06–30/06 → bật "Buộc lấy lại" → đồng bộ. Chờ
   ~5–15 phút, kiểm số Mua vào tháng 6.
   • Tăng 6802 → ~7000: phục hồi thành công.
   • Không tăng: phiên re-sync vẫn fail do GDT 429 → BÁO LẠI, cần Slice 2 (chống
     429 + chia lô subrequest trong luồng đồng bộ — việc backend riêng, KHÔNG làm
     trong nhiệm vụ này).

── OUTPUT (theo hợp đồng Code của CLAUDE.md) ──
Phạm vi thay đổi · file ảnh hưởng · điểm còn mơ hồ · kết quả đối chiếu spec/lint/test.
Commit nhỏ, thông điệp rõ. Không trộn nhiều đơn vị.

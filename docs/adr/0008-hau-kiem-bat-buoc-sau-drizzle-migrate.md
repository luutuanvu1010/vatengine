# ADR-0008 — Hậu kiểm DB trực tiếp bắt buộc sau mọi `drizzle-kit migrate` thật (sự cố bỏ qua âm thầm do lệch mốc thời gian journal)

- **Trạng thái:** ✅ CHỐT 2026-07-27 (phát hiện + vá + xác minh cùng một lượt deploy). Đơn vị: U35 (`docs/plans/U35-tien-do.md`).
- **Người quyết định:** Claude (Code), ghi lại để ép thi hành cho mọi phiên sau — không cần chủ dự án duyệt vì đây là quy trình vận hành nội bộ, không đổi kiến trúc/chi phí/rủi ro pháp lý.
- **Liên quan:** `.claude/rules/deploy.md` (luật trình tự deploy hiện có — ADR này bổ sung một lớp bằng chứng, không thay thế); `docs/plans/production-deploy.md` mục "Nhật ký deploy U35b + U35 — 2026-07-27"; memory dài hạn `drizzle-migrate-silent-skip-clock-drift`.

## Bối cảnh — sự cố xảy ra như thế nào

Trong lượt deploy U35 lên Neon production, `packages/db/migrations/0017_u35_lich_su_thay_doi_hoa_don.sql` đã bị **xoá và tạo lại** giữa phiên (vá lỗi ngưỡng coverage của `packages/db` — xem `U35-tien-do.md`). `drizzle-kit generate` đóng dấu `when` cho mục journal mới bằng `Date.now()` tại thời điểm generate. Đồng hồ hệ thống của môi trường sandbox chạy Claude **không nhất thiết khớp** ngày được nêu trong ngữ cảnh phiên — lần tạo lại này cho ra `when` **nhỏ hơn** `when` của migration 0016 liền trước đã có sẵn trong `_journal.json`.

Chạy `DATABASE_URL=<production> npx drizzle-kit migrate`: lệnh in `[✓] migrations applied successfully!`, không có bất kỳ dấu hiệu lỗi hay cảnh báo nào. Một script hậu kiểm độc lập (Node + `pg`, không đi qua Drizzle) truy vấn trực tiếp `information_schema` và `pg_trigger` cho thấy **không một bảng/cột/trigger mới nào tồn tại** — migration coi như chưa từng chạy.

## Nguyên nhân (xác nhận bằng thực nghiệm, không suy đoán)

Đối chiếu `drizzle.__drizzle_migrations` trên production: hàng mới nhất vẫn là migration 0016 (`id=17`), khớp đúng `when` của 0016 trong journal — **không có hàng nào cho 0017**. `drizzle-kit migrate` xác định tập migration "đang chờ áp" một phần dựa trên **thứ tự `when`**, không chỉ dựa trên việc hash/tên đã có trong bảng theo dõi hay chưa. Một `when` không tăng đơn điệu so với migration liền trước khiến nó bị xử lý như đã-áp/không-hợp-lệ-để-áp, và bị **bỏ qua trong im lặng** — trong khi thông điệp thành công vẫn được in ra **vô điều kiện**, không phản ánh việc có statement DDL nào thực sự chạy hay không.

Đã xác nhận nhân quả bằng thực nghiệm: sửa `when` của mục idx:17 thành `when(0016) + 60000` (khớp nhịp cách quãng ~60 giây vốn đã dùng giữa các migration cùng ngày khác trong journal) rồi chạy lại `migrate` — lần này lệnh **tốn thời gian rõ rệt hơn hẳn** (nhiều khung xoay hơn, dấu hiệu DDL thật đang thực thi), và hậu kiểm trực tiếp DB xác nhận đầy đủ: 2 bảng mới, 1 cột mới, RLS enable+force trên cả hai bảng mới, trigger `hoa_don_ghi_lich_su_thay_doi_trigger`, `drizzle.__drizzle_migrations` mới nhất `id=18`.

## Quyết định

**Từ nay, mọi lần chạy `drizzle-kit migrate` nhắm vào một database thật (không phải PGlite trong test) đều bắt buộc hai bước bổ sung, không có ngoại lệ:**

1. **Trước khi migrate:** nếu migration mới nhất từng bị xoá-tạo-lại trong phiên hiện tại (không phải lần `generate` đầu tiên và duy nhất cho migration đó), kiểm tra tường minh `when` của nó trong `_journal.json` **lớn hơn** `when` của migration liền trước. Không giả định `drizzle-kit generate` luôn cho ra giá trị tăng dần.
2. **Sau khi migrate:** không bao giờ coi thông điệp `[✓] migrations applied successfully!` là bằng chứng đủ. Luôn chạy một truy vấn hậu kiểm trực tiếp (không qua Drizzle) xác nhận đúng các đối tượng schema mà migration đó **phải** tạo ra (bảng/cột/index/trigger/constraint cụ thể), và đối chiếu `drizzle.__drizzle_migrations` đã có hàng mới nhất đúng migration vừa chạy.
3. **Tín hiệu nghi ngờ rẻ tiền:** so thời lượng thực thi giữa một lần áp thật và một lần chạy lại khi đã áp rồi (no-op) — nếu một migration multi-statement DDL đáng lẽ tốn thời gian lại hoàn tất nhanh bất thường, dừng lại và hậu kiểm trước khi đi tiếp, đừng coi đó là dấu hiệu tốt.

Quyết định này cụ thể hoá nguyên tắc bằng chứng của `CLAUDE.md` ("đã kiểm chứng" phải có bằng chứng tái lập được, không phải lời khẳng định của công cụ) cho đúng một điểm mù cụ thể của `drizzle-kit`.

## Đánh đổi đã chấp nhận (consequences)

- Mỗi lần migrate thật tốn thêm một bước hậu kiểm thủ công/script — chi phí thời gian nhỏ, đổi lấy việc loại một lớp lỗi có thể khiến production chạy code phụ thuộc schema **chưa hề tồn tại**, gây 500 hàng loạt ở đúng những request chạm bảng/cột mới (đúng lớp sự cố mà `.claude/rules/deploy.md` đã ghi nhận cho trường hợp "migrate sau deploy", nhưng đây là biến thể mới: **migrate tưởng đã chạy nhưng thực ra không chạy**, dù thứ tự thao tác đúng).
- Không sửa hành vi của `drizzle-kit` (ngoài tầm kiểm soát dự án) — chỉ thêm lớp kiểm chứng độc lập ở phía vận hành. Nếu một phiên bản `drizzle-kit` tương lai đổi cách xác định migration đang chờ, ADR này vẫn đúng vì hậu kiểm trực tiếp DB không phụ thuộc vào cơ chế nội bộ của công cụ.
- Rủi ro tái diễn cao nhất ở đúng kịch bản đã xảy ra: xoá-tạo-lại một migration đã generate trước đó giữa phiên làm việc (ví dụ để sửa lỗi coverage hoặc thứ tự statement). Bước 1 của quyết định nhắm thẳng vào kịch bản này.

## Bằng chứng

- Lệnh + kết quả gốc không còn giữ nguyên văn trong phiên (không lưu log thô), nhưng trình tự nguyên nhân — kết quả đã được tái lập hai lần trong cùng phiên (chạy hỏng → sửa `when` → chạy lại thành công, hậu kiểm cả hai lần bằng cùng một script) và mô tả đầy đủ ở trên.
- Commit vá: `097281f` (sửa `when` trong `packages/db/migrations/meta/_journal.json`).
- Nhật ký deploy đầy đủ: `docs/plans/production-deploy.md`, mục "Nhật ký deploy U35b + U35 — 2026-07-27".
- Memory dài hạn (áp dụng cho mọi phiên Claude sau này trên dự án): `drizzle-migrate-silent-skip-clock-drift`.

# Thẻ vận hành 1 trang — VATCrawlbot (cho người không lập trình)

## Mở phiên làm việc
Trong app **Claude Desktop** → bấm tab **Code** → mở thư mục `VATCrawlbot`.
(Claude tự nạp `CLAUDE.md` + `.claude/` — luật, skill, hook, sub-agent. Không phải cài gì thêm nếu app đã có tab Code.)

## Vòng lặp một mốc (tất cả trong tab Code)
```
1. /plan-unit U#      → Claude trình KẾ HOẠCH bằng lời (không code). Bạn ĐỌC & DUYỆT.
2. /start-unit U#     → Claude viết test → code → chạy make lint & test.
3. /verify            → đối chiếu tiêu chí Definition of Done.
4. /qa-unit           → sub-agent soi đầu ra, trả kết quả ngay trong phiên.
5. Bạn DUYỆT commit → tick mốc trong docs/CHECKLIST-NGHIEM-THU.md → sang mốc sau.
       (chưa đạt → Claude tự vòng lại bước 2)
```

## 3 cổng CON NGƯỜI gác (không cần đọc code)
1. **Duyệt kế hoạch** — sau `/plan-unit`, đọc plan, đồng ý hoặc sửa.
2. **Duyệt hành động** — khi Claude xin ghi file / commit, bấm đồng ý.
3. **Đọc bằng chứng** — test xanh/đỏ + báo cáo `/qa-unit` + ô checklist. Đủ mới cho qua.

## Lệnh bỏ túi
- `Shift+Tab` — đổi chế độ (có **Plan Mode** = chỉ đọc, an toàn để xem kế hoạch).
- `/plan-unit` · `/write-prompt` · `/start-unit` · `/verify` · `/qa-unit` — vòng đời một mốc.
- `Esc` — dừng Claude giữa chừng. `/rewind` — quay lại điểm trước. `/clear` — xoá ngữ cảnh giữa 2 việc rời.
- `/permissions` — cho phép sẵn `make lint`, `make test` để đỡ bị hỏi vặt.
- `/code-review` — nhờ một sub-agent mới soi lại thay đổi (soát chéo).

## Nếu nút "Đồng bộ ngay" báo "Hệ thống đang quá tải…"
Đây là thông báo **có kiểm soát** (không phải hỏng): hàng đợi đồng bộ đang bận vì nhiều
doanh nghiệp gửi yêu cầu cùng lúc (giới hạn 5.000 tin/giây/hàng đợi của Cloudflare). Chờ
**~10 phút rồi bấm lại** — dữ liệu không mất, không cần thao tác gì thêm. (Chi tiết kỹ
thuật + cách chẩn đoán hàng đợi: xem nhật ký sự cố 2026-07-17 trong bộ nhớ dự án.)

## Khi gặp mơ hồ
Nếu Claude định **đoán cấu trúc API thuế** hay yêu cầu chưa rõ → theo Hiến pháp, nó phải **DỪNG và hỏi**. Bạn trả lời hoặc bảo nó đề xuất phương án + viết contract test.

## Prompt khởi động (dán vào tab Code lần đầu mỗi phiên)
```
Đọc docs/00-BAT-DAU-TAI-DAY.md và docs/CHECKLIST-NGHIEM-THU.md, cho tôi biết mốc kế tiếp
và việc còn treo. Chỉ báo cáo, chưa làm gì thêm.
```

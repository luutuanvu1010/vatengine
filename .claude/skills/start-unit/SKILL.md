---
name: start-unit
description: Bắt đầu một đơn vị công việc (U0–U12) theo vòng lặp Prompt + Loop Engineering của VATCrawlbot — đọc spec, lập kế hoạch, TDD, tự kiểm chứng, review chéo.
disable-model-invocation: true
---

Thực hiện đơn vị công việc: **$ARGUMENTS**

Đây là quy trình bắt buộc theo Hiến pháp dự án (`CLAUDE.md`, mục "Quy trình làm việc") và `TRIEN_KHAI_BANG_CLAUDE_CODE.md`. Chỉ làm **một đơn vị** trong lần chạy này — không gộp nhiều U lại với nhau.

1. **Đọc bối cảnh.** Đọc mục tương ứng của đơn vị `$ARGUMENTS` trong `TRIEN_KHAI_BANG_CLAUDE_CODE.md` (mục 3) và phần liên quan trong `KIEN_TRUC_VA_KE_HOACH.md` (kiến trúc mục 7, lộ trình mục 12, checklist parity mục 12b). Đọc mọi `.claude/rules/*.md` áp dụng cho các file sẽ sửa.
2. **Kế hoạch ngắn.** Liệt kê: file sẽ sửa/tạo, test sẽ viết trước, tiêu chí nghiệm thu. Nếu có bất kỳ điểm nào phải **đoán cấu trúc phản hồi API thuế** hoặc yêu cầu chưa rõ — DỪNG và hỏi người dùng kèm phương án đề xuất, theo mục "Khi gặp mơ hồ" của Hiến pháp. Không tự giả định thầm rồi code tiếp.
3. **Viết test trước (TDD).** Test phải đỏ trước khi có code hiện thực. Tuân `.claude/rules/testing.md` (đánh dấu `unit`/`contract`/`integration` phù hợp, mock mọi gọi mạng thật trong test `unit`).
4. **Hiện thực tối thiểu** để test xanh — không làm dư phạm vi đơn vị.
5. **Tự kiểm chứng:** chạy `make lint && make test`. Nếu sửa `backend/gdt_client.py`, chạy thêm `make test-contract`. Đỏ thì tự sửa và lặp lại bước 4–5.
6. **Review chéo.** Khi lint/test đã xanh, dùng subagent độc lập trước khi coi là xong:
   - Nếu đơn vị đụng tới `gdt_client.py` hoặc endpoint thuế: dùng subagent `contract-guardian`.
   - Nếu đơn vị đụng tới xác thực, token, dữ liệu nhạy cảm, hoặc truy vấn đa tenant: dùng subagent `security-reviewer`.
   - Yêu cầu subagent chỉ báo cáo lỗ hổng/vi phạm thực sự (đúng/sai theo tiêu chí nghiệm thu), không phải sở thích văn phong.
7. **Đóng gói.** Cập nhật tài liệu liên quan nếu hành vi thay đổi. Commit nhỏ, thông điệp rõ (không trộn nhiều đơn vị công việc).

Definition of Done cho `$ARGUMENTS`: test tự động phủ đúng tiêu chí nghiệm thu và toàn bộ xanh; `make lint` sạch; không giảm coverage dưới ngưỡng 80%; không lộ bí mật; tài liệu liên quan đã cập nhật; commit nhỏ, rõ. Stop hook (`.claude/hooks/gate-dod.sh`) sẽ tự chặn nếu `make lint && make test` chưa xanh khi có thay đổi trong `backend/`.

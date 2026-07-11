---
name: plan-unit
description: Lập kế hoạch cho một đơn vị công việc (U0–U12) TRƯỚC KHI code — đọc spec, xác định file/test/tiêu chí nghiệm thu, nêu rủi ro và điểm mơ hồ cần hỏi. Không viết code hiện thực.
disable-model-invocation: true
---

Lập kế hoạch cho đơn vị công việc: **$ARGUMENTS**

Đây là bước "kế hoạch ngắn" tách riêng để rà soát trước khi thực thi. **Không viết code hiện thực** trong lần chạy này — chỉ sản xuất kế hoạch dạng văn bản. Chỉ một đơn vị.

1. **Đọc bối cảnh.** Đọc mục tương ứng của `$ARGUMENTS` trong `TRIEN_KHAI_BANG_CLAUDE_CODE.md` (mục 3) và phần liên quan trong `KIEN_TRUC_VA_KE_HOACH.md` (kiến trúc mục 7, lộ trình mục 12, checklist parity mục 12b). Đọc `docs/adr/` nếu đơn vị đụng quyết định kiến trúc. Đọc mọi `.claude/rules/*.md` áp dụng cho các file dự kiến sửa.
2. **Xuất kế hoạch** gồm đúng các mục sau:
   - **Phạm vi:** một câu mô tả đơn vị làm gì; nêu rõ cái gì NGOÀI phạm vi.
   - **File sẽ tạo/sửa:** danh sách đường dẫn (theo cấu trúc `apps/` + `packages/`, xem ADR-0001).
   - **Test viết trước (TDD):** liệt kê từng test + nhóm (`unit`/`contract`/`integration`) theo `.claude/rules/testing.md`.
   - **Tiêu chí nghiệm thu:** điều kiện đo được để coi đơn vị là xong.
   - **Ràng buộc bắt buộc chạm tới:** cô lập adapter (`packages/gdt-client` + `GdtTransport`), khóa tự nhiên + idempotent, `tenant_id`/RLS, xử lý 401, không phá captcha, không lưu mật khẩu thô — nêu cái nào áp dụng.
   - **Rủi ro & phụ thuộc:** ví dụ egress GDT, giới hạn Workers (CPU 5', wall 15'), binding chưa tạo.
3. **Điểm mơ hồ — DỪNG và hỏi.** Nếu có bất kỳ chỗ nào phải **đoán cấu trúc phản hồi API thuế** hoặc yêu cầu chưa rõ, liệt kê thành câu hỏi kèm phương án đề xuất và một contract test để kiểm chứng — theo mục "Khi gặp mơ hồ" của Hiến pháp. Không tự giả định thầm.

Kết thúc: bàn giao. Gợi ý bước kế tiếp: `/write-prompt $ARGUMENTS` (sinh prompt thực thi) hoặc `/start-unit $ARGUMENTS` (thực thi trực tiếp).

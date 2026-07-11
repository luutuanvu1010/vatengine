---
name: write-prompt
description: Sinh một prompt thực thi chuẩn theo Prompt + Loop Engineering cho một đơn vị công việc (U0–U12), tự nhét ràng buộc Hiến pháp và Luật liên quan. Xuất prompt sẵn để dán, không tự thực thi.
disable-model-invocation: true
---

Sinh prompt thực thi cho đơn vị công việc: **$ARGUMENTS**

Mục tiêu: tạo một prompt **đầy đủ, tự chứa**, đúng phương pháp trong `TRIEN_KHAI_BANG_CLAUDE_CODE.md`, để một phiên làm việc (hoặc người dùng) dán vào và chạy. **Không tự thực thi đơn vị** trong lần chạy này.

1. **Đọc nguồn.** Mục của `$ARGUMENTS` trong `TRIEN_KHAI_BANG_CLAUDE_CODE.md` (mục 3, kèm mẫu prompt + Definition of Done), phần liên quan trong `KIEN_TRUC_VA_KE_HOACH.md`, và `.claude/rules/*.md` áp dụng. Nếu đã có kết quả `/plan-unit`, dùng lại kế hoạch đó.
2. **Xuất prompt** theo khung sau (điền cụ thể, không để placeholder trống):
   - **Bối cảnh & mục tiêu đơn vị:** trích tiêu chí nghiệm thu từ tài liệu nguồn.
   - **Tài liệu phải đọc trước:** đường dẫn cụ thể + mục.
   - **Ràng buộc bắt buộc (trích từ Hiến pháp/Luật liên quan):** cô lập `packages/gdt-client` qua `GdtTransport`; khóa tự nhiên `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` + idempotent; `tenant_id` + RLS; xử lý 401 dừng + báo; không phá captcha; không lưu mật khẩu thô; timeout + retry backoff. Chỉ đưa vào cái áp dụng cho đơn vị.
   - **Yêu cầu TDD:** viết test trước (nhóm đúng theo `testing.md`), đỏ → xanh.
   - **Lệnh tự kiểm chứng:** `make lint && make test` (+ `make test-contract` nếu đụng `packages/gdt-client`).
   - **Cổng review chéo:** nêu agent cần dùng (`contract-guardian` nếu đụng adapter GDT; `security-reviewer` nếu đụng xác thực/token/tenant; `dod-auditor` luôn) — hoặc gọi `/qa-unit`.
   - **Definition of Done:** liệt kê điều kiện đóng đơn vị.
   - **Khi gặp mơ hồ:** yêu cầu DỪNG và hỏi thay vì đoán.
3. Trình bày prompt trong một khối mã để dễ sao chép.

Kết thúc: bàn giao prompt. Bước kế tiếp thường là `/start-unit $ARGUMENTS`.

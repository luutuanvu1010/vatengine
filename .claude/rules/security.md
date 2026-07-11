---
paths:
  - "apps/**/*.ts"
  - "packages/**/*.ts"
  - "**/wrangler.jsonc"
  - ".dev.vars*"
  - "**/*secret*"
---

# Luật: Bảo mật & bí mật

Cụ thể hoá nguyên tắc "không hard-code bí mật, không lưu mật khẩu thuế thô" trong Hiến pháp. Runtime: Cloudflare Workers (xem ADR-0001).

## Bắt buộc

- Không commit mật khẩu, token, connection string, API key vào code, `wrangler.jsonc` hay `.dev.vars` đã track git. Dùng **Workers Secrets / Secrets Store** (`wrangler secret put`); `.dev.vars` chỉ dùng local và phải nằm trong `.gitignore`.
- Mật khẩu tài khoản thuế của khách hàng: **không lưu trữ**. Chỉ giữ token JWT do Tổng cục Thuế cấp, mã hoá tại nghỉ (envelope encryption), vòng đời ngắn, gắn `token_het_han`.
- Không log token, mật khẩu, hoặc `raw_json` chứa dữ liệu nhạy cảm ở mức log INFO trở lên (Workers Logs/Logpush). Nếu cần log để debug, che (mask) trước khi ghi.
- Mọi endpoint nhận request từ bên ngoài phải xác thực (JWT nội bộ của SaaS, không phải token thuế; khu vực quản trị dùng Cloudflare Access) trước khi xử lý, trừ endpoint health-check.
- Ghi audit log cho: đăng nhập thuế (thành công/thất bại), đồng bộ hóa đơn, xuất dữ liệu, đổi cấu hình tenant. Audit log không được ghi đè, chỉ append.

## Cấm tuyệt đối

- Không viết code bẻ/vượt captcha tự động.
- Không thu thập dữ liệu hóa đơn ngoài phạm vi MST đã đăng nhập.

## Khi gặp mơ hồ

Nếu một tính năng đòi hỏi lưu thêm dữ liệu nhạy cảm chưa có trong mô hình hiện tại (ví dụ lưu mật khẩu để "đăng nhập lại tự động"), dừng và hỏi — đây luôn là vi phạm ranh giới pháp lý của Hiến pháp, không có ngoại lệ kỹ thuật nào hợp lý hoá được.

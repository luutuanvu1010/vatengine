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

## Relay VN (egress GDT)

Theo Amendment ADR-0001 (2026-07-12), biên Cloudflare **không** tới được API GDT `:30000`; mọi gọi API đi qua **relay đặt tại Việt Nam** (`GdtTransport = vn-relay`). Relay nằm trên đường đi của **credential thuế + token + `raw_json`** nên là **thành phần trọng yếu về bảo mật**, ràng buộc bắt buộc:

- **Xác thực hai chiều:** Worker ↔ relay dùng **mTLS + shared-secret**. Relay **chỉ** chấp nhận request từ Worker của dự án; từ chối mọi nguồn khác. Secret/chứng chỉ nạp qua Workers Secrets / Secrets Store, **không** hard-code, **không** commit.
- **Stateless, chỉ forward:** relay **chỉ** chuyển tiếp request tới GDT rồi trả nguyên response. **Không lưu** (đĩa/DB/cache) và **không log** body, credential, token, hay `raw_json` — kể cả khi debug. Chỉ được log metadata không nhạy cảm (thời điểm, mã trạng thái, độ trễ) sau khi che (mask).
- **Tối thiểu bề mặt:** relay không có endpoint nào khác ngoài đường forward; không lưu lịch sử; vòng đời tiến trình không giữ dữ liệu tenant giữa các request.
- **Bí mật của relay** (khóa mTLS, shared-secret, cấu hình origin) tuân thủ đúng mục "Bắt buộc" ở trên: không commit, xoay vòng được, gắn vòng đời.
- **Không** đặt relay thành nơi lưu trữ/nhật ký dự phòng "cho tiện" — mọi nhu cầu lưu vết nằm ở tầng Worker/DB có kiểm soát tenant, không ở relay.

## Cấm tuyệt đối

- Không viết code bẻ/vượt captcha tự động.
- Không thu thập dữ liệu hóa đơn ngoài phạm vi MST đã đăng nhập.

## Khi gặp mơ hồ

Nếu một tính năng đòi hỏi lưu thêm dữ liệu nhạy cảm chưa có trong mô hình hiện tại (ví dụ lưu mật khẩu để "đăng nhập lại tự động"), dừng và hỏi — đây luôn là vi phạm ranh giới pháp lý của Hiến pháp, không có ngoại lệ kỹ thuật nào hợp lý hoá được.

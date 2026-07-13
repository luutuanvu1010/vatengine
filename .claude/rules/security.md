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

## Relay VN (egress GDT) — TREO (dự phòng, CHƯA dùng)

> ⚠️ **Trạng thái (cập nhật 2026-07-13):** phần này **không còn là đường ra hiện hành**. Tiền đề cũ — "biên Cloudflare không tới được API GDT `:30000` nên mọi gọi API phải qua relay VN" (Amendment ADR-0001 **2026-07-12**) — **đã bị bác bỏ**: `:30000` là cổng chết (Amendment **#2**), và T0 (thuần Cloudflare, `GdtTransport = direct-cf`) **đã kiểm chứng tới được API thật** cho cả `GET /api/captcha` (Amendment **#3**) lẫn `POST /api/security-taxpayer/authenticate` (Amendment **#4**, egress SG, `200 + {token}`).
>
> **Đường ra hiện hành = T0 (`direct-cf`).** Relay VN / T1 / mốc `U1a` **TREO — không dựng**, chỉ hồi sinh nếu probe egress định kỳ phát hiện `GEO_BLOCKED` **thật** (xem `.claude/rules/gdt-adapter.md` mục "Đường ra (egress) & fallback"). Không xoá đặc tả dưới đây — giữ làm **spec sẵn sàng**: *nếu* tương lai buộc bật T1, relay phải tuân đúng ngay từ đầu; sự tồn tại của mục này **không** phải bằng chứng T1 đang chạy.

**Nếu (và chỉ nếu) bật relay VN**, relay nằm trên đường đi của **credential thuế + token + `raw_json`** nên là **thành phần trọng yếu về bảo mật**, ràng buộc bắt buộc:

- **Ẩn + xác thực ở biên (mô hình Cloudflare Tunnel):** relay đặt sau **Cloudflare Tunnel (`cloudflared`)** — VPS **không mở cổng vào công cộng**, chỉ kết nối RA. Hostname `vatengine.khanhhoatravel.com.vn` được bảo vệ bằng **Cloudflare Access service token** (tùy chọn kèm **mTLS** qua Access): **chỉ** Worker của dự án (giữ service token) mới gọi được; mọi nguồn khác bị chặn ngay ở biên. Egress tới GDT là cuộc gọi RA cục bộ từ IP VN của VPS (giữ IP VN). Service token/secret/tunnel credential nạp qua Workers Secrets / Secrets Store, **không** hard-code, **không** commit.
- **Stateless, chỉ forward:** relay **chỉ** chuyển tiếp request tới GDT rồi trả nguyên response. **Không lưu** (đĩa/DB/cache) và **không log** body, credential, token, hay `raw_json` — kể cả khi debug. Chỉ được log metadata không nhạy cảm (thời điểm, mã trạng thái, độ trễ) sau khi che (mask).
- **Tối thiểu bề mặt:** relay không có endpoint nào khác ngoài đường forward; không lưu lịch sử; vòng đời tiến trình không giữ dữ liệu tenant giữa các request.
- **Bí mật của relay** (khóa mTLS, shared-secret, cấu hình origin) tuân thủ đúng mục "Bắt buộc" ở trên: không commit, xoay vòng được, gắn vòng đời.
- **Không** đặt relay thành nơi lưu trữ/nhật ký dự phòng "cho tiện" — mọi nhu cầu lưu vết nằm ở tầng Worker/DB có kiểm soát tenant, không ở relay.

## Cấm tuyệt đối

- Không viết code bẻ/vượt captcha tự động.
- Không thu thập dữ liệu hóa đơn ngoài phạm vi MST đã đăng nhập.

## Khi gặp mơ hồ

Nếu một tính năng đòi hỏi lưu thêm dữ liệu nhạy cảm chưa có trong mô hình hiện tại (ví dụ lưu mật khẩu để "đăng nhập lại tự động"), dừng và hỏi — đây luôn là vi phạm ranh giới pháp lý của Hiến pháp, không có ngoại lệ kỹ thuật nào hợp lý hoá được.

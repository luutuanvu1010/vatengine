# Runbook — GDT chặn hoặc đổi phương thức lối vào (U43)

## Dấu hiệu
- Telegram: "🚫 GDT đang CHẶN đăng nhập từ hệ thống (WAF)" (canary mỗi giờ) hoặc "⚠️ GDT đổi cách phản hồi đăng nhập" (DRIFT), hoặc "🚫 Probe egress GDT xấu N tick".
- `audit_log`: nhiều `dang_nhap_thue_that_bai` cùng lý do (`waf_blocked` hoặc thông điệp lạ), 0 `dang_nhap_thue_thanh_cong`.
- Màn Kết nối tài khoản thuế báo "Tổng cục Thuế đang chặn yêu cầu từ hệ thống".
- Log Workers: `gdt_waf_blocked_login` (mức CRITICAL, từ `apps/api`) — lượt đăng nhập của một tenant bị WAF chặn. **Đây có thể là vết DUY NHẤT** nếu WAF bắt theo **nội dung request của tenant** (vd ký tự lạ trong mật khẩu thuế): canary gửi payload cố định nên vẫn `OK` và không ai được báo.
- Mỗi tick canary để lại `gdt_canary_tick` (INFO) — **không thấy dòng này** nghĩa là cron canary không chạy, phải xử lý như một sự cố riêng.

### Ca đặc biệt: WAF phủ CẢ `/api/captcha`
Khi đó canary **không** báo `chan`: bước lấy captcha hỏng trước, nên verdict chỉ là `ERROR`
và phải đủ **3 tick liên tiếp (≈ 3 giờ)** mới có tin `lỗi liên tiếp`. Nhãn `WAF_BLOCKED` khi ấy
đến từ tin **Probe egress** (15 phút × 3 tick = **45 phút**), và đồng bộ đã bị chặn enqueue
(`isEgressBlocked`). **Đừng ngồi chờ tin "GDT đang CHẶN"** — thấy "Probe egress GDT xấu N tick"
kèm nhãn `WAF_BLOCKED` thì vào runbook này ngay.

## Nguyên tắc
Khách hàng hợp pháp, trung thành với portal: gửi đúng những gì portal gửi. KHÔNG xoay IP, KHÔNG giả lập trình duyệt, KHÔNG giải captcha, KHÔNG thử dồn (leo thang thành chặn IP).

## Các bước (≈ 30 phút, đã làm đúng thế này ngày 2026-09-24)
1. Tái lập từ máy dev: `cd packages/gdt-client && npx vitest run test/contract/authenticate.contract.test.ts` → đọc `CANARY_VERDICT`/`STATUS`/`MESSAGE`. `OK` ở máy dev nhưng chặn ở biên ⇒ WAF phân biệt theo nguồn (**CHƯA KIỂM CHỨNG** — chưa quan sát lần nào, cũng chưa biết tần suất); khác ⇒ đi tiếp.
2. Tải portal: `curl -s https://hoadondientu.gdt.gov.vn/ | grep -o 'src="[^"]*\.js"'` → tải các chunk, tìm chunk chứa `security-taxpayer/authenticate` và interceptor axios (`interceptors.request.use`). Ngày 24/09 đó là `_app-*.js`, module 81466: gắn `request-id` (uuid), `Action`, `End-Point`.
3. So với `withRequestId()` trong `packages/gdt-client/src/http.ts`. Thiếu header nào thì curl thử với header đó (MST giả `0000000000`, captcha thật lấy từ `/api/captcha`, cvalue sai): mong 401 "Mã captcha không đúng."
4. Sửa `withRequestId()` (thêm header) + chú thích "KIỂM CHỨNG <ngày>" + cập nhật `.claude/rules/gdt-adapter.md`. Nếu là DRIFT (dạng phản hồi mới): cập nhật `canary.ts`/`auth.ts` với bằng chứng, không đoán.
5. `make lint && make test && make test-contract`.
6. Deploy `vat-sync-worker` → `vat-api` → `vat-web`. Ghi Version ID vào backlog.
7. Xác nhận: tin Telegram "✅ GDT đã thông lại" ở tick canary kế tiếp; `audit_log` có `dang_nhap_thue_thanh_cong` sau khi một người dùng đăng nhập lại.

## Nếu chữ ký WAF đổi chữ ngữ
403 sẽ rơi về `GEO_BLOCKED` (vẫn báo, chỉ sai nhãn). Cập nhật `WAF_BLOCK_SIGNATURE` trong `packages/gdt-client/src/errors.ts` kèm ngày kiểm chứng.

Lưu ý cùng họ: thân phản hồi 403 được đọc hết rồi **cắt 1024 ký tự đầu** để phân loại. Chữ ký nằm sau mốc đó cũng rơi về `GEO_BLOCKED` — hành vi có chủ đích (trang chặn quan sát 24/09 là JSON nhỏ), có test chốt trong `packages/gdt-client/test/unit/directTransport.test.ts`.

## Secret Telegram đặt sau khi deploy — KHÔNG còn làm mất tin

Từ bản vá "cảnh báo phải giao được mới tính" (commit sau `dc1d936`): nếu deploy worker
trước khi đặt `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, cảnh báo **không** bị nuốt nữa —
sink báo "chưa giao" nên máy trạng thái không ghi `alerted`, và **tick sau báo lại**. Hậu
quả duy nhất là mỗi giờ lại có một lượt gửi hỏng (log `[canhBao] Telegram TẮT — thiếu: …`)
cho tới khi đặt xong secret; đặt xong thì tin tới ngay ở tick kế tiếp. Vẫn nên đặt secret
trước cho gọn, nhưng **không** còn là điểm mất chuông.

## Khi trạng thái giám sát kẹt

Trạng thái canary + probe nằm trong Durable Object `EgressHealth` (`apps/sync-worker/src/egressHealth.ts`),
**sống qua deploy** và **không có route nào từ ngoài xoá được** — `fetch()` của worker chỉ
phục vụ `/dlq/replay`. Nếu trạng thái kẹt (vd `alerted: true` mà thực tế đã thông, hoặc
`lastVerdict` treo ở `WAF_BLOCKED` làm cổng enqueue đóng mãi), **đường thoát duy nhất hiện
có** là đổi hằng `CANARY_KEY` / `STATE_KEY` trong file đó rồi **deploy lại** worker — khoá mới
= chưa có trạng thái = bắt đầu sạch (và sẽ có lại một tin "đã bật giám sát"). Bình thường
trạng thái tự lành sau một tick `OK`, nên chỉ dùng cách này khi đã xác nhận nó thật sự kẹt.

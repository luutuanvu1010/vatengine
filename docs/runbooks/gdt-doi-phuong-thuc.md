# Runbook — GDT chặn hoặc đổi phương thức lối vào (U43)

## Dấu hiệu
- Telegram: "🚫 GDT đang CHẶN đăng nhập từ hệ thống (WAF)" (canary mỗi giờ) hoặc "⚠️ GDT đổi cách phản hồi đăng nhập" (DRIFT), hoặc "🚫 Probe egress GDT xấu N tick".
- `audit_log`: nhiều `dang_nhap_thue_that_bai` cùng lý do (`waf_blocked` hoặc thông điệp lạ), 0 `dang_nhap_thue_thanh_cong`.
- Màn Kết nối tài khoản thuế báo "Tổng cục Thuế đang chặn yêu cầu từ hệ thống".

## Nguyên tắc
Khách hàng hợp pháp, trung thành với portal: gửi đúng những gì portal gửi. KHÔNG xoay IP, KHÔNG giả lập trình duyệt, KHÔNG giải captcha, KHÔNG thử dồn (leo thang thành chặn IP).

## Các bước (≈ 30 phút, đã làm đúng thế này ngày 2026-09-24)
1. Tái lập từ máy dev: `cd packages/gdt-client && npx vitest run test/contract/authenticate.contract.test.ts` → đọc `CANARY_VERDICT`/`STATUS`/`MESSAGE`. `OK` ở máy dev nhưng chặn ở biên ⇒ WAF phân biệt theo nguồn (hiếm); khác ⇒ đi tiếp.
2. Tải portal: `curl -s https://hoadondientu.gdt.gov.vn/ | grep -o 'src="[^"]*\.js"'` → tải các chunk, tìm chunk chứa `security-taxpayer/authenticate` và interceptor axios (`interceptors.request.use`). Ngày 24/09 đó là `_app-*.js`, module 81466: gắn `request-id` (uuid), `Action`, `End-Point`.
3. So với `withRequestId()` trong `packages/gdt-client/src/http.ts`. Thiếu header nào thì curl thử với header đó (MST giả `0000000000`, captcha thật lấy từ `/api/captcha`, cvalue sai): mong 401 "Mã captcha không đúng."
4. Sửa `withRequestId()` (thêm header) + chú thích "KIỂM CHỨNG <ngày>" + cập nhật `.claude/rules/gdt-adapter.md`. Nếu là DRIFT (dạng phản hồi mới): cập nhật `canary.ts`/`auth.ts` với bằng chứng, không đoán.
5. `make lint && make test && make test-contract`.
6. Deploy `vat-sync-worker` → `vat-api` → `vat-web`. Ghi Version ID vào backlog.
7. Xác nhận: tin Telegram "✅ GDT đã thông lại" ở tick canary kế tiếp; `audit_log` có `dang_nhap_thue_thanh_cong` sau khi một người dùng đăng nhập lại.

## Nếu chữ ký WAF đổi chữ ngữ
403 sẽ rơi về `GEO_BLOCKED` (vẫn báo, chỉ sai nhãn). Cập nhật `WAF_BLOCK_SIGNATURE` trong `packages/gdt-client/src/errors.ts` kèm ngày kiểm chứng.

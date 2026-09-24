---
paths:
  - "packages/gdt-client/**"
  - "apps/*/test/contract/**"
  - "spikes/gdt-egress-probe/**"
---

# Luật: GDT Adapter (lớp kết nối cơ quan thuế)

Cụ thể hoá nguyên tắc "cô lập phụ thuộc API thuế" trong Hiến pháp (CLAUDE.md). Runtime: TypeScript trên Cloudflare Workers (xem ADR-0001).

## Bắt buộc

- Mọi lời gọi HTTP tới `hoadondientu.gdt.gov.vn` chỉ được thực hiện từ package `packages/gdt-client`. Không gọi `fetch()` tới API thuế trực tiếp từ Worker API, route, queue consumer hay workflow.
- Mọi gọi ra đi qua interface **`GdtTransport`** (đường ra hoán đổi được: `direct-cf` ↔ `vn-relay`). Logic nghiệp vụ không tự gọi `fetch()`.
- `BASE`, `INVOICE_ENDPOINTS`, `DETAIL_ENDPOINTS` là nguồn chân lý duy nhất cho URL/endpoint. Khi thuế đổi endpoint, chỉ sửa ở các hằng số này.
- Mọi hàm gọi mạng: `timeout` tường minh (`AbortController`) + kiểm tra status code tường minh. Không nuốt lỗi HTTP im lặng. Retry có backoff cho lỗi tạm thời (5xx/timeout), **không** retry cho 401.
- HTTP 401 ở các endpoint CẦN token (query/detail/export-xml) → ném `GdtError` `SESSION_EXPIRED` với thông điệp "hết phiên", dừng ngay, không tự động thử lại bằng thông tin đăng nhập cũ. **Ngoại lệ:** 401 tại `authenticate()` là "GDT từ chối đăng nhập" (sai captcha/mật khẩu), không phải hết phiên — xem mục Cổng hợp đồng bên dưới.
- **Không** tự động giải captcha. `getCaptcha()` chỉ trả ảnh về cho người dùng nhập.
- **Mọi request tới GDT phải mang header `request-id` (UUID, mỗi request HTTP một mã)** — gắn tập trung trong `fetchWithRetry` (`packages/gdt-client/src/http.ts`), không gắn rải rác. *Kiểm chứng 2026-09-24:* WAF GDT (cookie `TS*`, F5 BIG-IP) trả `403 {"message":"Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn."}` cho `POST /api/security-taxpayer/authenticate` thiếu header này; portal chính thức gắn nó vào mọi request qua interceptor axios. Sự cố 10/09→24/09/2026: 0 tenant đăng nhập được hai tuần mà contract test cũ (chỉ `/captcha`) không phát hiện. Contract test `authenticate.contract.test.ts` (nhóm không cần credential) nay canh ca này.

## Cổng hợp đồng (contract gate)

- Trước khi coi một thay đổi trong `packages/gdt-client` là xong, phải chạy `make test-contract` — kiểm tra endpoint `/captcha` (công khai, không cần đăng nhập) vẫn khớp schema kỳ vọng trong `packages/gdt-client/gdt-contract-schema.json`, **và** probe egress (T0) vẫn tới được GDT.
- Nếu response thực tế thiếu/thừa trường so với schema kỳ vọng: đây là tín hiệu Tổng cục Thuế đã đổi API. **Dừng, cập nhật `gdt-contract-schema.json` một cách tường minh sau khi xác nhận thủ công, không tự ý nới lỏng assertion để test xanh.**
- Khi phát hiện lệch hợp đồng (`GdtContractDriftError`) trong runtime (không phải test), hệ thống phải: ghi audit log mức CRITICAL, dừng đồng bộ tự động của các tenant liên quan (mở circuit breaker trong Durable Object), và không âm thầm bỏ qua dữ liệu bất thường. Ngoại lệ: schema `invoice_envelope` (`datas`) hiện chỉ log cảnh báo thay vì raise/mở circuit breaker, vì chưa có bằng chứng thực tế xác nhận GDT luôn trả `datas` kể cả khi rỗng — đây là điểm đang **mơ hồ, chưa xác nhận thủ công**, không phải đã giải quyết. Khi xác nhận được hành vi thật (log thực tế hoặc tài liệu), nâng lại thành raise cứng và xoá ghi chú này. **Ngoại lệ thứ hai:** schema `invoice_detail` (`hdhhdvu`) cũng chỉ log cảnh báo (mềm), vì cấu trúc detail mới kiểm chứng thật trên **một** mẫu (HĐ thường, thuế suất 8% — ADR-0001 Amendment #6); họ `sco` và mã thuế đặc biệt (KCT/KKKNT) **chưa quan sát**, nên chưa nâng hard-raise để tránh mở circuit breaker nhầm trên biến thể hợp lệ chưa gặp. Khi có thêm mẫu (sco + mã đặc biệt), cân nhắc nâng raise cứng và xoá ghi chú này.
- **401 khi đăng nhập (sai captcha/mật khẩu) không phải lệch hợp đồng, cũng KHÔNG phải `SESSION_EXPIRED`** — *kiểm chứng 2026-09-24 (curl thật):* sai captcha → HTTP **401** kèm `{"message":"Mã captcha không đúng.","path":"uri=/authenticate"}`; tài liệu cũ nói GDT có thể trả HTTP 200 kèm `message` lỗi mà không có `token` — giữ cả hai nhánh. `authenticate()` ném `GdtError(message GDT, "HTTP_ERROR", 401)` để audit/UI thấy đúng lý do. Luôn kiểm tra thành công nghiệp vụ (có `token`) trước khi chạy kiểm hợp đồng, để tránh người dùng gõ sai captcha nhiều lần tự mở circuit breaker.

## Đường ra (egress) & fallback

- Probe định kỳ (Cron) phân loại từng transport: `OK | GEO_BLOCKED | WAF_BLOCKED | RATE_LIMITED | TIMEOUT | ERROR`; lưu trạng thái sức khỏe trong Durable Object. `WAF_BLOCKED` (U43, kiểm chứng 2026-09-24) = 403 + thân mang chữ ký `WAF_BLOCK_SIGNATURE` (`errors.ts`, nguồn chân lý duy nhất): chặn theo HEADER, **không** chuyển relay; chặn enqueue đồng bộ như `GEO_BLOCKED`.
- **Canary lối vào** (U43): `canaryAuthenticate()` — captcha thật + authenticate MST không tồn tại `0000000000` + captcha sai, **không retry**, cron mỗi giờ ở sync-worker và ca contract không cần credential. Mong `OK` (401 nghiệp vụ); `WAF_BLOCKED`/`DRIFT` báo Telegram ngay. Không tăng tần suất, không thêm nguồn, không thử dồn khi bị chặn.
- Runtime thử `direct-cf` (T0) trước; nếu `GEO_BLOCKED`/breaker mở → dùng `vn-relay` (T1). Mỗi lần rơi xuống T1 phải phát cảnh báo (tín hiệu "không còn thuần Cloudflare").
- Tham chiếu hiện thực mẫu: `spikes/gdt-egress-probe/`.

## Khi gặp mơ hồ

Nếu chưa chắc cấu trúc response của một endpoint (ví dụ trường mới trong `/query/invoices/detail`), viết một contract test thất bại trước (ghi rõ kỳ vọng), rồi hỏi người dùng xác nhận thay vì đoán và code tiếp — đúng tinh thần "Khi gặp mơ hồ" của Hiến pháp.

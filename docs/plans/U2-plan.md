# Kế hoạch — U2: Query purchase/sold + phân trang + gộp sco + khử trùng

> Sản phẩm của `/plan-unit U2`. **Không viết code hiện thực** — chỉ kế hoạch để rà soát trước khi `/write-prompt U2` → `/start-unit U2`.
> Ngày: 2026-07-13. Tiền đề: U1 xong (getCaptcha + authenticate ĐÃ KIỂM CHỨNG, có `token`). Tham chiếu port: `backend/gdt_client.py` `query_invoices`/`_query_one`/`_build_search`.

## Phạm vi

Bổ sung vào adapter `packages/gdt-client` thao tác **truy vấn danh sách hóa đơn** theo chiều (đầu vào/đầu ra) và khoảng thời gian: gọi **hai họ endpoint** (thường `/api/query/invoices/*` + máy tính tiền `/api/sco-query/invoices/*`), **tự phân trang** tới hết bằng con trỏ `state`, **gộp** kết quả và **khử trùng lặp** theo khóa tự nhiên, mỗi hóa đơn **giữ nguyên `raw_json`**.

**NGOÀI phạm vi (nêu rõ để không lấn):**
- **Không** lưu trữ/DB — U2 chỉ trả mảng trong bộ nhớ; upsert idempotent + `tenant_id` + RLS là **U4–U5**.
- **Không** lấy chi tiết dòng hàng (endpoint `detail`) — đó là **U3**.
- **Không** đồng bộ nền/hàng đợi — **U9**.
- Vì chưa có tầng lưu trữ nên **khử trùng ở U2 dùng khóa tự nhiên KHÔNG có `tenant_id`**: `(nbmst, khhdon, khmshdon, shdon, tdlap)` — khử trùng trong-bộ-nhớ giữa normal+sco. Khóa đầy đủ có `tenant_id` áp ở U5 khi upsert vào DB.

## File sẽ tạo/sửa

- `packages/gdt-client/src/query.ts` — `queryInvoices(transport, params, opts?)`: `direction` (`purchase|sold`), `dateFrom`/`dateTo` (dd/mm/yyyy), `statuses?` (mặc định theo tham chiếu, xem điểm mơ hồ), `includeSco?`. Bên trong: `buildSearch()` (RSQL), `queryOne()` (phân trang `state` + guard chống lặp vô hạn), gộp + khử trùng + gắn `raw` + `source` (normal/sco) + `direction`.
- `packages/gdt-client/src/endpoints.ts` — (sau kiểm chứng) gỡ nhãn `CHƯA KIỂM CHỨNG` khỏi `INVOICE_ENDPOINTS`.
- `packages/gdt-client/src/contract.ts` + `gdt-contract-schema.json` — thêm schema `invoice_envelope` (`{datas, state?, total?}`) ở mức **mềm** (chỉ cảnh báo, không raise/không mở breaker) — theo `gdt-adapter.md` (chưa xác nhận GDT luôn trả `datas`).
- `packages/gdt-client/src/index.ts` — export `queryInvoices` + kiểu.
- `packages/gdt-client/test/unit/query.test.ts` — nhóm `unit` (mock transport, nhiều trang giả).
- `packages/gdt-client/test/contract/query.contract.test.ts` — nhóm `contract` (**cần token thật**, xem mục kiểm chứng).

## Test viết trước (TDD)

**unit** (mock `GdtTransport` trả trang giả lập):
1. **Phân trang đủ:** transport trả 3 trang (size=50, 50, 20 + `state` ở 2 trang đầu, hết ở trang 3) → gộp đúng **120** dòng, gọi transport đúng 3 lần.
2. **Dừng đúng:** trang cuối `datas.length < size` **hoặc** không có `state` → dừng, không gọi thừa.
3. **Guard vô hạn:** nếu server luôn trả `state` → dừng ở ngưỡng guard, không treo.
4. **Gộp normal + sco:** `includeSco=true` → gọi cả `/query` và `/sco-query`, gộp hai nguồn.
5. **Khử trùng:** cùng hóa đơn xuất hiện ở normal và sco (trùng `(nbmst,khhdon,khmshdon,shdon,tdlap)`) → chỉ giữ **một**, gắn `source` bản đầu gặp.
6. **sco không áp dụng:** endpoint sco trả lỗi HTTP → **bỏ qua sco**, vẫn trả normal (không ném); normal lỗi → ném.
7. **401 giữa chừng phân trang** → `GdtError SESSION_EXPIRED`, dừng ngay, không retry credential cũ.
8. **Giữ `raw`:** mỗi phần tử trả về giữ nguyên bản ghi gốc từ GDT (không mất trường).
9. **buildSearch (RSQL):** `dateFrom/dateTo` + `ttxly` sinh đúng chuỗi `tdlap=ge=..T00:00:00;tdlap=le=..T23:59:59;ttxly==..`.
10. **Envelope thiếu `datas`:** transport trả object không có `datas` → coi là rỗng, **cảnh báo mềm**, không mở circuit breaker (theo `gdt-adapter.md`).

**contract** (`make test-contract`, cần token thật — xem mục kiểm chứng):
11. Một truy vấn thật khoảng ngày hẹp trả `200` + envelope khớp schema `invoice_envelope`; xác nhận cơ chế `state` hoạt động thật.

## Tiêu chí nghiệm thu

4 mục checklist U2 xanh: gộp hai họ endpoint; phân trang nhiều trang đủ, không sót/lặp; khử trùng theo khóa tự nhiên; luôn giữ `raw_json`. `make lint` sạch; `make test` xanh; coverage `packages/gdt-client` ≥ 80% (không tụt). Review chéo `contract-guardian` (+ `dod-auditor`). `INVOICE_ENDPOINTS` chỉ được gỡ nhãn CHƯA KIỂM CHỨNG **sau** khi test kiểm chứng (11) xanh.

## Ràng buộc bắt buộc chạm tới

Cô lập adapter: `queryInvoices` chỉ gọi qua `GdtTransport`, không `fetch()` trực tiếp. **401 → dừng**, không retry credential cũ; lỗi tạm 5xx/timeout → retry backoff (dùng lại `fetchWithRetry`). Khóa tự nhiên để khử trùng (subset không `tenant_id` ở U2). Cổng hợp đồng: `invoice_envelope` ở mức **mềm** (log, không raise) cho tới khi xác nhận thủ công GDT có luôn trả `datas` — **không** tự nâng thành raise. Không log `raw_json` nhạy cảm ở mức INFO.

## Rủi ro & phụ thuộc

- **Giới hạn Workers (CPU 5'/wall 15'):** một truy vấn dải ngày rộng có thể hàng nghìn trang → vượt giới hạn nếu chạy đồng bộ trong một request. **U2 chỉ đảm bảo hàm phân trang đúng**; chạy thật khối lớn là việc **nền/chunking ở U9**. Thiết kế `queryInvoices` để **có thể** cắt theo lô/nối tiếp (nhận `state` khởi đầu, trả `state` cuối) nhằm sẵn sàng cho U9 — cân nhắc, không bắt buộc hiện thực đầy đủ ở U2.
- Phụ thuộc token hợp lệ (U1). Test contract (11) cần đăng nhập thật (captcha người dùng nhập).

## ⚠️ Điểm mơ hồ — DỪNG và hỏi / kiểm chứng trước khi chốt

Chỉ `/api/captcha` và `/api/security-taxpayer/authenticate` đã kiểm chứng. **CHƯA KIỂM CHỨNG** (mã cũ KHÔNG phải bằng chứng):

1. **Đường dẫn query có tiền tố `/api` đúng không** (`/api/query/invoices/{purchase,sold}`, `/api/sco-query/...`). → Kiểm chứng bằng test (11): dùng token thật gọi một dải ngày hẹp, xác nhận 200 + envelope.
2. **Cấu trúc envelope & cơ chế phân trang:** giả định `{datas: [...], state: <cursor>, total?}` và "hết khi `datas.length < size` hoặc không `state`" — **từ backend cũ, chưa xác nhận**. Nếu envelope thật khác (vd cursor tên khác, có `total`/`page`), **DỪNG**, cập nhật schema + logic tường minh, không nới assertion.
3. **`ttxly` mặc định (5,6,8) nghĩa là gì** và có nên lọc mặc định không — chưa rõ ngữ nghĩa. *Đề xuất:* mặc định **không lọc** (`statuses` = tùy chọn), để người dùng/tầng trên quyết định; xác nhận ý nghĩa 5/6/8 khi có tài liệu GDT.

**Đề nghị:** U2 hiện thực + unit test (mock) chạy độc lập; **test kiểm chứng (11) chạy trong phiên có người trực** (đăng nhập thật để lấy token + gọi query thật). Chỉ khi (11) xanh mới gỡ nhãn `INVOICE_ENDPOINTS` và chốt cấu trúc envelope.

## Bước kế tiếp

`/write-prompt U2` (sinh prompt thực thi tự chứa) → `/start-unit U2`. Phần kiểm chứng query thật cần người trực nhập captcha (tương tự probe U1).

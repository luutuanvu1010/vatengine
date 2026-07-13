# Kế hoạch — U3: GDT Adapter — detail dòng hàng

> Sản phẩm của `/plan-unit U3`. **Không viết code hiện thực** — chỉ kế hoạch để rà soát trước khi `/write-prompt U3` → `/start-unit U3`.
> Ngày: 2026-07-13. Tiền đề: U1 xong (`getCaptcha` + `authenticate`, ĐÃ KIỂM CHỨNG, có `token`); U2 xong (`queryInvoices` trả `InvoiceRow[]` gồm 5 trường khóa tự nhiên + `_source` normal/sco + `_direction`). Tham chiếu port: `backend/gdt_client.py` → `invoice_detail(row)` + entity `DongHangHoa` (KIEN_TRUC mục 7.1).

## Phạm vi

Bổ sung vào adapter `packages/gdt-client` thao tác **lấy chi tiết một hóa đơn** (các dòng hàng hóa/dịch vụ + thuế suất từng dòng) qua endpoint `detail`: chọn đúng họ endpoint theo nguồn (`/api/query/invoices/detail` cho HĐ thường, `/api/sco-query/invoices/detail` cho HĐ máy tính tiền), truyền định danh hóa đơn (5 trường khóa tự nhiên) làm tham số, gắn token Bearer, và **ánh xạ mảng dòng hàng thô → danh sách `InvoiceLine` chuẩn hóa** (giữ nguyên `raw` mỗi dòng). Một hàm `getInvoiceDetail()` (gọi mạng) + một hàm thuần `mapDetailLines()` (ánh xạ, không I/O).

**NGOÀI phạm vi (nêu rõ để không lấn):**
- **Không** lưu trữ/DB: U3 chỉ trả object trong bộ nhớ; bảng `DongHangHoa` + `hoadon_id` + `tenant_id` + upsert idempotent là **U4–U5**. `InvoiceLine` ở U3 **không** mang `id`/`hoadon_id`/`tenant_id`.
- **Không** orchestration lấy detail hàng loạt / lazy-load: U3 chỉ là **primitive lấy 1 hóa đơn**. Lấy theo lô nền hoặc lười theo yêu cầu người dùng là **U9** (nền) / **U6** (API tra cứu). (KIEN_TRUC 7.2: "chỉ gọi `detail` khi cần… hoặc trong job nền".)
- **Không** tải XML/PDF, MCCQT/QR/chữ ký số (P2 phần mở rộng) — chỉ dòng hàng + thuế suất.
- **Không** tự đăng nhập: nhận `token` sẵn (như U2).

## File sẽ tạo/sửa

- `packages/gdt-client/src/detail.ts` *(mới)* — `getInvoiceDetail(transport, token, ref, opts?)` + `mapDetailLines(raw)`; kiểu `InvoiceDetailRef`, `InvoiceLine`, `InvoiceDetail`.
- `packages/gdt-client/src/endpoints.ts` — thêm hằng `DETAIL_ENDPOINTS = { normal: "/api/query/invoices/detail", sco: "/api/sco-query/invoices/detail" }` **gắn nhãn CHƯA KIỂM CHỨNG** cho tới khi contract test (dưới) xanh. (Luật `gdt-adapter.md` đã coi `DETAIL_ENDPOINTS` là nguồn chân lý cần tồn tại.)
- `packages/gdt-client/gdt-contract-schema.json` — thêm entry `invoice_detail` (khóa mảng dòng hàng) ở mức **mềm**; `required_keys` chỉ chốt **sau** kiểm chứng thật (xem Điểm mơ hồ).
- `packages/gdt-client/src/index.ts` — export `getInvoiceDetail`, `mapDetailLines`, và các kiểu mới.
- `packages/gdt-client/test/unit/detail.test.ts` *(mới)* — nhóm `unit` (mock `GdtTransport`).
- `packages/gdt-client/test/contract/detail.contract.test.ts` *(mới)* — nhóm `contract` (**cần token thật + 1 hóa đơn thật**), viết kiểu "kỳ vọng trước".
- `docs/CHECKLIST-NGHIEM-THU.md` — đánh dấu tiến độ U3 sau khi xanh.

## Test viết trước (TDD)

**unit** (mock `GdtTransport`; assert trên **REQUEST** và trên hàm ánh xạ thuần — không phụ thuộc cấu trúc body thật chưa kiểm chứng):

1. **Chọn endpoint theo nguồn:** `ref._source === "normal"` → gọi `DETAIL_ENDPOINTS.normal`; `=== "sco"` → `DETAIL_ENDPOINTS.sco`.
2. **Truyền đúng 5 tham số định danh:** query string chứa `nbmst, khhdon, khmshdon, shdon, tdlap` lấy từ `ref` (khớp thứ tự/tên tham số của `invoice_detail` tham chiếu).
3. **Gắn `Authorization: Bearer <token>`** trên request detail.
4. **401 → `GdtError` `SESSION_EXPIRED`**, dừng ngay, **không** retry credential cũ.
5. **Lỗi HTTP khác (5xx sau hết retry / 4xx)** → ném `GdtError` (không nuốt im lặng); dùng lại `fetchWithRetry` (timeout + backoff, không retry 401).
6. **Body không parse được JSON** → ném `GdtError` (không trả rác).
7. **`mapDetailLines` — ánh xạ dòng hàng (thuần):** cho object detail giả theo **giả thuyết cấu trúc** (mảng dòng hàng + các trường/dòng), trả `InvoiceLine[]` đúng số dòng, ánh xạ đúng `ten/dvtinh/sluong/dgia/thtien` + **thuế suất** + tiền thuế dòng, **giữ `raw` từng dòng**. *(Test này mã hóa GIẢ THUYẾT cấu trúc — xem Điểm mơ hồ; đỏ→xanh theo giả thuyết, chốt sau kiểm chứng.)*
8. **`mapDetailLines` — biên:** detail thiếu mảng dòng hàng (hoặc rỗng) → trả `[]` + **cảnh báo mềm** (không throw, không mở circuit breaker), đồng nhất cách xử lý `invoice_envelope` ở U2.
9. **`mapDetailLines` — thuế suất phi số:** dòng có thuế suất dạng chuỗi (`"10%"`, `"KCT"`, `"KKKNT"`, `"0%"`) → giữ nguyên giá trị gốc trong `InvoiceLine` (không ép kiểu làm mất dữ liệu); quyết định chuẩn hóa số để lại U4/U5.
10. **Cổng hợp đồng mềm:** detail thiếu khóa mảng dòng hàng theo `invoice_detail` schema → `missingContractKeys` cảnh báo, **không** raise/không mở breaker (tới khi xác nhận thủ công — xem `gdt-adapter.md`).

**contract** (`make test-contract`, **cần token thật + 1 `InvoiceRow` thật**, `it.skipIf(!TOKEN)` như `invoices.contract.test.ts`):

11. Gọi detail thật cho **một** hóa đơn (lấy từ `queryInvoices` dải ngày hẹp) → `200` + body chứa **mảng dòng hàng** đúng khóa kỳ vọng; mỗi dòng có các trường ánh xạ (tên hàng, số lượng, đơn giá, thành tiền, **thuế suất**). Lệch → **DỪNG, cập nhật schema tường minh**, không nới assertion.

## Tiêu chí nghiệm thu

2 mục checklist U3 xanh: (a) test ánh xạ dòng hàng + thuế suất từ endpoint detail; (b) contract test cấu trúc detail, lệch → dừng + cập nhật schema tường minh. `make lint` sạch; `make test` (unit) xanh; coverage `packages/gdt-client` ≥ 80% (không tụt). Review chéo `contract-guardian` (+ `dod-auditor`). `DETAIL_ENDPOINTS` và schema `invoice_detail` chỉ được **gỡ nhãn CHƯA KIỂM CHỨNG sau** khi contract test (11) chạy thật xanh và cấu trúc dòng hàng được xác nhận.

## Ràng buộc bắt buộc chạm tới

- **Cô lập adapter:** mọi gọi detail chỉ trong `packages/gdt-client`, qua `GdtTransport` (không `fetch()` trực tiếp). `DETAIL_ENDPOINTS` là nguồn chân lý URL duy nhất (`gdt-adapter.md`).
- **401 → dừng** (`SESSION_EXPIRED`), không retry credential cũ; lỗi tạm 5xx/timeout → retry backoff qua `fetchWithRetry`; kiểm status tường minh, không nuốt lỗi.
- **Không phá captcha / không tự đăng nhập** — nhận token sẵn.
- **Khóa tự nhiên:** `ref` mang đúng 5 trường `(nbmst, khmshdon, khhdon, shdon, tdlap)` (subset không `tenant_id` — `tenant_id` chỉ vào ở tầng DB U4/U5).
- **Cổng hợp đồng:** `invoice_detail` để **mềm** (log cảnh báo) tới khi xác nhận thủ công; **không** tự nâng thành raise, **không** nới assertion để test xanh.
- **Bảo mật:** không log `raw`/giá trị hóa đơn ở mức INFO trở lên; không lưu mật khẩu/token thô. (`security.md`)

## Rủi ro & phụ thuộc

- **Cấu trúc phản hồi detail CHƯA KIỂM CHỨNG** (rủi ro chính — xem Điểm mơ hồ). `invoice_detail` tham chiếu Python **chỉ trả raw, KHÔNG ánh xạ** → tên khóa mảng dòng hàng và tên từng trường/dòng **không có bằng chứng quan sát**, chỉ suy từ entity nội bộ `DongHangHoa`. "Có trong mã cũ" KHÔNG phải bằng chứng (bài học `:30000`).
- **Phụ thuộc U2:** `getInvoiceDetail` nhận `InvoiceRow` (hoặc subset) do `queryInvoices` sinh ra; `_source` quyết định họ endpoint.
- **Giới hạn Workers (CPU 5'/wall 15'):** một hóa đơn = một call → U3 an toàn. Rủi ro chỉ phát sinh khi lấy detail **hàng loạt** đồng bộ trong một request → đó là việc **nền/chunking U9**, không thuộc U3.
- **Phụ thuộc token + hóa đơn thật** cho contract test (11): cần phiên có người trực đăng nhập (captcha người thật), giống probe U1/U2.
- **Egress GDT:** T0 (`direct-cf`) đã kiểm chứng tới GDT cho captcha/auth/query; detail đi cùng host `hoadondientu.gdt.gov.vn` nên **kỳ vọng** cùng đường ra, nhưng chỉ xác nhận khi (11) chạy thật.

## ⚠️ Điểm mơ hồ — DỪNG và hỏi / kiểm chứng trước khi chốt

Đây là điểm **"đoán cấu trúc phản hồi API thuế"** mà Hiến pháp yêu cầu DỪNG. Chỉ `/api/captcha`, `/api/security-taxpayer/authenticate`, và phong bì `/api/(sco-)query/invoices/{purchase,sold}` đã kiểm chứng. Cấu trúc `detail` **CHƯA KIỂM CHỨNG**:

1. **Đường dẫn detail + tiền tố `/api`:** giả định `/api/query/invoices/detail` và `/api/sco-query/invoices/detail`. → Kiểm chứng bằng test (11).
2. **Tham số gọi detail:** giả định GET với query params `nbmst, khhdon, khmshdon, shdon, tdlap` (từ `invoice_detail` tham chiếu). Có thể GDT cần thêm/khác trường (vd `nban`/`tban`). → Xác nhận bằng (11).
3. **Khóa mảng dòng hàng trong body:** *đề xuất giả thuyết* `hdhhdvu` (hàng hóa–dịch vụ) là mảng các dòng — **suy từ domain/entity, KHÔNG từ quan sát**. Nếu khóa thật khác → **DỪNG, cập nhật schema + `mapDetailLines` tường minh**.
4. **Tên trường từng dòng + biểu diễn thuế suất:** *đề xuất* ánh xạ `ten, dvtinh, sluong, dgia, thtien` + thuế suất (`ltsuat`/`tsuat`?) + tiền thuế dòng (`tthue`/`tsuat_tien`?). Thuế suất có thể là **chuỗi** (`"10%"`, `"8%"`, `"KCT"`, `"KKKNT"`, `"0%"`) chứ không phải số → `InvoiceLine` giữ **giá trị gốc**, chưa ép kiểu. Tên khóa thật + tập giá trị thuế suất **phải xác nhận** trước khi chốt mapping.

**Contract test kiểm chứng (test 11) là cổng gỡ nhãn.** Đề xuất hai lối, xin người dùng chọn:
- **(A) Kiểm chứng trước (khuyến nghị):** chạy một **probe detail thật** (phiên có người trực, giống U1/U2) trên **một** hóa đơn để chụp cấu trúc thật → chốt khóa mảng + tên trường + biểu diễn thuế suất → rồi mới hiện thực `mapDetailLines` bám dữ liệu thật. Tránh viết mapping theo giả thuyết rồi phải sửa.
- **(B) Hiện thực theo giả thuyết + gỡ nhãn sau:** hiện thực `getInvoiceDetail` (fetch — kiểm được bằng unit không cần body thật) + `mapDetailLines` theo giả thuyết (mục 3–4), **giữ nhãn CHƯA KIỂM CHỨNG**; test (11) xác nhận/sửa sau. Giống cách U2 đã làm với envelope.

Trước khi `/start-unit U3`, cần người dùng: **(i)** chọn (A) hay (B); **(ii)** nếu (A), cung cấp phiên đăng nhập thật để probe detail; **(iii)** xác nhận/đính chính khóa mảng dòng hàng (`hdhhdvu`?) và biểu diễn thuế suất.

## Bước kế tiếp

`/write-prompt U3` (sinh prompt thực thi tự chứa) → `/start-unit U3`. Phần kiểm chứng detail thật (test 11) cần người trực nhập captcha để lấy token + gọi detail thật (giống probe U1/U2).

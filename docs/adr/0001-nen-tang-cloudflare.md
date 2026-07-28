# ADR-0001 — Nền tảng triển khai Backend & Frontend trên hệ sinh thái Cloudflare

- **Trạng thái:** ✅ Đã chấp thuận (Accepted) — 2026-07-11 · **sửa đổi 2026-07-12, 2026-07-13** (xem "Amendment" bên dưới)
- **Quyết định đã chốt:** **4A = A2** (PostgreSQL ngoài + Hyperdrive) · **4B = B1** (TypeScript trên Workers) · Egress: **T0 (thuần Cloudflare) là đường ra CHÍNH THỨC cho API GDT `/api/*` (Amendment #3, 2026-07-13)**; relay VN/T1/U1a **TREO, không dựng** trừ khi phát sinh bằng chứng chặn địa lý mới.
- **Ngày:** 2026-07-11 (bản gốc) · 2026-07-12 (amendment egress, sau này xác định dựa trên tiền đề sai) · 2026-07-13 (Amendment #2 đính chính tiền đề `:30000`; Amendment #3 xác nhận T0 chạy được với `/api/captcha`; Amendment #4 xác nhận T0 tới được endpoint xác thực `/api/security-taxpayer/authenticate`; Amendment #7 xác nhận định dạng `tdlap`/`ncnhat` trả về trong `datas[]`)
- **Changelog:** `2026-07-12` — Egress T0 bị bác bỏ cho API sau probe edge thật (**sau này phát hiện probe nhắm sai cổng `:30000`, xem Amendment #2**); T1 relay VN thành đường chính. `2026-07-13` — Amendment #2 đính chính `:30000` là cổng chết, API thật ở `/api` `:443`. Amendment #3 — phép thử quyết định nhắm đúng `/api/captcha` từ biên Cloudflare thật (`wrangler dev --remote`) trả **200 + `{key,content}` hợp lệ** ⇒ **T0 thuần Cloudflare CHẠY**, gỡ TREO, bỏ nhu cầu relay VN. Amendment #4 — probe đăng nhập thật (QĐ-2, có người trực nhập captcha) trả **200 + `{token}` (JWT)** từ T0 ⇒ **T0 tới được cả endpoint xác thực** `/api/security-taxpayer/authenticate`, gỡ nhãn CHƯA KIỂM CHỨNG cho `AUTH_PATH`. Amendment #5 — probe query thật (Chrome đăng nhập thật, chỉ đọc network) xác nhận `INVOICE_ENDPOINTS` `/api/(sco-)query/invoices/*` trả **200 + phong bì `{datas, total, state, time}`** (datas luôn hiện diện kể cả rỗng, state=null khi rỗng), gỡ nhãn CHƯA KIỂM CHỨNG cho query hóa đơn (U2). Amendment #6 — probe detail thật (Chrome đăng nhập thật) xác nhận hợp đồng endpoint chi tiết dòng hàng `GET /api/query/invoices/detail` (**4 tham số `nbmst,khhdon,shdon,khmshdon`, KHÔNG tdlap**; mảng dòng hàng ở khóa `hdhhdvu`; thuế suất HAI trường `ltsuat` chuỗi "8%" + `tsuat` số 0.08), gỡ nhãn CHƯA KIỂM CHỨNG cho `DETAIL_ENDPOINTS.normal` (U3). Amendment #7 — probe `datas[0]` thật của `GET /api/query/invoices/purchase` xác nhận `tdlap` là chuỗi ISO-8601 UTC KHÔNG mili giây (`YYYY-MM-DDTHH:mm:ssZ`) và luôn ở giờ `17:00:00Z` (= 00:00:00 giờ VN, UTC+7) của ngày lập, khác `ncnhat` (ISO-8601 UTC CÓ mili giây); `tgtcthue`/`tgtttbso` là JSON number (có thể dạng khoa học cho giá trị lớn); `ttxly`/`tthai` là JSON integer — gỡ nhãn CHƯA KIỂM CHỨNG cho `tdlap`, mở khóa **U5**. Nền tảng còn lại (Workers/TS, Postgres/Hyperdrive) giữ nguyên trong mọi lần sửa đổi.
- **Người quyết định:** Chủ dự án (luutuanvu.gl@gmail.com)
- **Phạm vi ảnh hưởng:** Hiến pháp `CLAUDE.md` (mục "Ngăn xếp công nghệ", "Kiến trúc — quy tắc cứng"), các luật `.claude/rules/*.md`, khung `backend/` + `frontend/` hiện có.
- **Nguồn tra cứu:** Tài liệu chính thức Cloudflare (developers.cloudflare.com), truy cập 2026-07-11. Các mốc giới hạn dẫn trong tài liệu này lấy từ trang docs cập nhật tháng 4–6/2026.

> ⚠️ **Cảnh báo quản trị.** Quyết định này **mâu thuẫn trực diện** với Hiến pháp hiện hành (Python/FastAPI/PostgreSQL/Celery/Redis). Theo chính khung quản trị của dự án ("khi một luật mâu thuẫn với Hiến pháp, Hiến pháp thắng — sửa luật, không sửa hiến pháp để né"), việc chuyển sang Cloudflare **bắt buộc phải sửa Hiến pháp một cách tường minh**, không được lặng lẽ đi chệch. Mục "Hệ quả" liệt kê các thay đổi Hiến pháp cần thông qua.

---

## Amendment #7 (2026-07-13) — Định dạng `tdlap`/`ncnhat` trả về trong `datas[]` đã kiểm chứng, gỡ nút chặn U5

> Đóng đúng khoảng trống nêu ở prompt `docs/prompts/U5-probe-tdlap.md`: Amendment #5 chỉ xác nhận `tdlap` **có mặt** trong row + cú pháp filter **gửi đi**; chưa ai ghi lại *giá trị GDT trả về*. Vì `tdlap` là một phần khóa tự nhiên/UNIQUE 6 trường dùng cho upsert idempotent ở U5, map sai định dạng sẽ hỏng idempotent. Chủ dự án tự đăng nhập + tự thao tác DevTools (Network → Preview/Response → Copy response) trên `GET /api/query/invoices/purchase` của MST của chính mình; dán nguyên `datas[]` cho Cowork phân tích. **Không dùng dữ liệu bên thứ ba, không phá captcha.**
>
> Ghi chú vận hành: lần probe này KHÔNG dùng được Chrome extension MCP (`mcp__Control_Chrome__*`) — `list_tabs`/`get_current_tab` chạy được nhưng `execute_javascript`/`get_page_content` báo lỗi cố định "Google Chrome is not running" qua nhiều lần thử lại trên nhiều tab khác nhau; nguyên nhân nằm ở quyền/kết nối của extension, không tự sửa được từ phía Cowork. Chuyển sang thao tác thủ công của chủ dự án là đường duy nhất khả dụng.
>
> **Xử lý dữ liệu nhạy cảm:** payload thật chứa MST/tên/địa chỉ/SĐT/CCCD/số tài khoản ngân hàng của bên bán và bên mua — vượt quá phạm vi "chỉ giữ hình dạng" đã yêu cầu. Cowork **không lưu** payload thô vào bất kỳ file hay bộ nhớ nào; chỉ trích xuất kết luận về *kiểu dữ liệu/định dạng* bên dưới, dùng giá trị placeholder cho số tiền.

### Bằng chứng (2026-07-13, `datas[0..14]` của `GET /api/query/invoices/purchase`, HĐ khởi tạo từ máy tính tiền `thlap=202604`)

| Trường | Quan sát thật | Kiểu/định dạng |
|---|---|---|
| **`tdlap`** ⭐ | ví dụ `"2026-04-12T17:00:00Z"` — **giống hệt nhau ở mọi dòng** trong lô, luôn giờ `17:00:00Z` | string, ISO-8601 UTC, **KHÔNG** mili giây, dạng `YYYY-MM-DDTHH:mm:ssZ`; `17:00:00Z` = `00:00:00` giờ VN (UTC+7) của ngày lập ⇒ `tdlap` mang ngữ nghĩa **ngày** nhưng serialize thành thời khắc UTC lệch múi giờ VN |
| `ncnhat` | ví dụ `"2026-04-13T09:44:51.456Z"` — khác nhau từng dòng (mili-giây) | string, ISO-8601 UTC **CÓ** mili giây, dạng `YYYY-MM-DDTHH:mm:ss.sssZ` — **khác `tdlap`** (không có `.sss`) |
| `tgtcthue` / `tgtttbso` | ví dụ `1234567.0` (nhỏ) và `1.4727778E7` (lớn, dạng khoa học) | JSON number (không phải chuỗi); giá trị lớn có thể serialize ở **dạng khoa học** — `JSON.parse` chuẩn xử lý được, cần test riêng để không quên |
| `ttxly` | `8` | JSON integer |
| `tthai` | `1` trong lô probe này; **cập nhật 2026-07-28:** đã giải mã đủ `1`–`5` trên 33.929 hóa đơn thật — xem `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md` §3 | JSON integer |

### Kết luận

- **Gỡ nhãn `CHƯA KIỂM CHỨNG`** cho giá trị trả về của `tdlap` (trước đây chỉ biết *có mặt* + cú pháp filter gửi đi, Amendment #5). Giả thuyết cũ dựa trên `backend/gdt_client.py:417-421` (`fromisoformat` khi có `"T"`) **được xác nhận đúng hướng** (ISO-8601) nhưng cần bổ sung chi tiết: không có mili giây, và giờ cố định lệch múi giờ VN — hai điểm mà mã di sản không thể hiện, do đó **không được copy nguyên `normalize_row()` sang TS** mà phải viết mapper mới có test riêng cho quy luật `17:00:00Z ⇔ 00:00:00 ICT`.
- Mapper `tdlap` ở U5 (`packages/sync` → cột `hoa_don.tdlap timestamptz`) nên lưu **nguyên thời khắc UTC** (Postgres `timestamptz` tự quy đổi hiển thị theo timezone truy vấn) — KHÔNG tự trừ/cộng giờ thủ công trong code ứng dụng; chỉ cần parse đúng ISO-8601 chuẩn (`new Date(tdlap)` / Zod `.datetime()`), việc "ngày lập theo giờ VN" là vấn đề hiển thị, không phải vấn đề lưu trữ.
- `tgtcthue`/`tgtttbso` đã là number nên không cần parse chuỗi số; cần ít nhất 1 test với giá trị dạng khoa học (`E7`/`E8`) để tránh hồi quy nếu ai đó đổi sang xử lý chuỗi.
- U5 (`docs/plans/U5-plan.md`, `docs/prompts/U5-prompt.md`) sẵn sàng chạy `/start-unit U5`.

### Giới hạn của bằng chứng (không phóng đại)

- Chỉ quan sát **một lô** hóa đơn khởi tạo từ máy tính tiền (`khhdon=C26MYY`, cùng `thlap=202604`) nên **mọi dòng có `tdlap` giống hệt nhau** (cùng ngày lập) — quy luật `17:00:00Z ⇔ 00:00:00 ICT` suy ra từ **1 giá trị lặp lại**, chưa kiểm chứng với hóa đơn lập vào ngày/giờ khác hoặc hóa đơn **thường** (không phải máy tính tiền); chưa loại trừ khả năng GDT dùng giờ khác `00:00:00 ICT` làm mốc cho loại hóa đơn khác.
- Chỉ quan sát chiều **mua vào** (`purchase`); `sold` **suy từ đối xứng cùng envelope** (đã có ở Amendment #5), chưa tự gọi lại riêng trong lần probe này.
- Probe qua **trình duyệt người dùng đã đăng nhập sẵn** (thao tác thủ công, không qua Chrome extension MCP do lỗi kết nối nêu trên) — kiểm chứng **định dạng dữ liệu**, không kiểm lại egress T0 (đã có ở Amendment #3/#4).
- Chưa quan sát `tdlap`/`ncnhat` khi hóa đơn bị điều chỉnh/thay thế (lô probe này chỉ thấy `tthai=1`, trạng thái gốc). **Cập nhật 2026-07-28:** giới hạn này đã được gỡ một phần — `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md` giải mã `tthai` 1–5 trên dữ liệu đã lưu (§3) và cho thấy `ncnhat` của bản gốc **KHÔNG đổi** khi hóa đơn bị thay thế (§6.1), nên `ncnhat` không dùng làm tín hiệu phát hiện thay đổi.

---

## Amendment #6 (2026-07-13) — Hợp đồng endpoint DETAIL (chi tiết dòng hàng) đã kiểm chứng cho họ `normal` (U3)

> Nối tiếp Amendment #5 (query). Probe detail THẬT qua **Chrome đăng nhập thật của người dùng** (người dùng tự đăng nhập + nhập captcha — KHÔNG bypass; token KHÔNG ghi lại; giá trị hóa đơn che). Mở chi tiết một hóa đơn mua vào thường → quan sát **request + hình dạng response** ở tầng mạng (đọc tên khóa/kiểu + cách mã hoá thuế suất, KHÔNG đọc số tiền/tên đối tác).

### Bằng chứng (2026-07-13, HĐ mua vào thường, dòng thuế suất 8%)

| Mục | Quan sát thật |
|---|---|
| Đường dẫn | `GET /api/query/invoices/detail` → `200` |
| Tham số | CHỈ 4: `nbmst, khhdon, shdon, khmshdon` — **KHÔNG có `tdlap`** (lệch giả thuyết cũ 5 tham số của `invoice_detail` Python) |
| Khóa mảng dòng hàng | `hdhhdvu` (khớp giả thuyết) |
| Trường mỗi dòng | `stt`(number), `ten`(string), `dvtinh`(string), `sluong`(number), `dgia`(number), `thtien`(number), `tchat`(number)… |
| **Thuế suất** | HAI trường: `ltsuat` (chuỗi hiển thị `"8%"`) **và** `tsuat` (số thập phân `0.08`) |
| Tiền thuế dòng | `tthue` (null ở dòng 8% này) |
| Cấp hóa đơn | envelope đầy đủ (`nbmst, nbten, nmmst, nmten, khmshdon, khhdon, shdon, tdlap, tgtcthue, tgtthue, tgtttbso, ttxly, tthai`…) + `thttltsuat` (bảng tổng hợp theo thuế suất) + `qrcode`/chữ ký số |

### Kết luận

- Thêm `DETAIL_ENDPOINTS` (`endpoints.ts`) + schema `invoice_detail` (`required_keys: ["hdhhdvu"]`); **gỡ nhãn CHƯA KIỂM CHỨNG** cho họ `normal`. Hiện thực `getInvoiceDetail()` (fetch 4 tham số, KHÔNG tdlap) + `mapDetailLines()` (giữ `raw`, giữ NGUYÊN cả `ltsuat` chuỗi lẫn `tsuat` số — **không ép kiểu**; chuẩn hóa/đối chiếu là U4/U5).

### Giới hạn của bằng chứng (không phóng đại)

- Probe qua **trình duyệt người dùng** (egress = máy người dùng), kiểm chứng **hợp đồng** (path + 4 tham số + khóa `hdhhdvu` + thuế suất), KHÔNG kiểm lại egress T0 (đã có ở Amendment #3/#4, cùng host `hoadondientu.gdt.gov.vn`).
- **`sco`** (`/api/sco-query/invoices/detail`) **suy từ đối xứng**, chưa gọi trực tiếp (tài khoản probe không có HĐ máy tính tiền — khớp Amendment #5 thấy sco-query rỗng). Giữ nhãn CHƯA KIỂM CHỨNG cho `DETAIL_ENDPOINTS.sco`.
- Chỉ quan sát **một** dòng thuế suất `8%`. Biểu diễn thuế suất cho **mã đặc biệt** (`KCT`/`KKKNT`/`0%`) và `tthue` khi khác null **chưa quan sát** — `mapDetailLines` giữ `raw` nên an toàn dữ liệu; test unit đã phủ ca mã chữ theo giả thuyết. Giữ kiểm hợp đồng **mềm** cho `invoice_detail`.

---

## Amendment #5 (2026-07-13) — Hợp đồng endpoint QUERY hóa đơn đã kiểm chứng; gỡ nhãn CHƯA KIỂM CHỨNG cho `INVOICE_ENDPOINTS` (U2)

> Đóng đúng khoảng trống "Giới hạn của bằng chứng" ở Amendment #4 (khi đó chưa kiểm chứng `INVOICE_ENDPOINTS`). Probe query THẬT qua **Chrome đăng nhập thật của người dùng** (người dùng tự đăng nhập + nhập captcha — KHÔNG bypass), quan sát tầng mạng để lấy **đường dẫn + hình dạng phản hồi**. Chỉ đọc **tên khóa** (schema), **không** ghi lại token hay giá trị hóa đơn.

### Bằng chứng (2026-07-13, quan sát network trên portal `hoadondientu.gdt.gov.vn` đã đăng nhập)

| Endpoint (thật) | status | Phong bì / ghi chú |
|---|---|---|
| `GET /api/query/invoices/purchase?sort=tdlap:desc&size=15&search=…` | `200` | keys `{datas, total, state, time}`; `datas` mảng (15), `state` chuỗi con trỏ; 16 kết quả / 2 trang ⇒ phân trang `state` hoạt động |
| `GET /api/query/invoices/sold?…` | `200` | (bắt ở tầng network) |
| `GET /api/sco-query/invoices/purchase?…` | `200` | `datas: []` (RỖNG) vẫn hiện diện; `state: null` khi rỗng |
| `GET /api/query/invoices/purchase` **không kèm** `Authorization` | `401` | xác nhận cần header `Bearer` |

- **Cú pháp RSQL** thật: `tdlap=ge=DD/MM/YYYYT00:00:00;tdlap=le=DD/MM/YYYYT23:59:59` — khớp `buildSearch()`.
- **Row** chứa đủ 5 trường khóa tự nhiên `nbmst, khmshdon, khhdon, shdon, tdlap` (+ `ttxly`, `tthai`, ~130 trường ⇒ `raw_json` hợp lý).

### Kết luận

- **Gỡ nhãn `CHƯA KIỂM CHỨNG`** cho `INVOICE_ENDPOINTS` trong `endpoints.ts`; cập nhật `gdt-contract-schema.json` (`invoice_envelope`) sang ĐÃ KIỂM CHỨNG. Điểm mơ hồ cũ ("chưa chắc GDT trả `datas` khi rỗng") **đã giải toả**: `datas` luôn hiện diện, `state=null` khi rỗng (khớp điều kiện dừng phân trang trong `query.ts`).

### Giới hạn của bằng chứng (không phóng đại)

- Probe này chạy qua **trình duyệt người dùng (egress = máy người dùng)**, KHÔNG phải biên Cloudflare — nó kiểm chứng **hợp đồng (path + phong bì + RSQL + Bearer)**, KHÔNG kiểm lại egress T0. Egress T0 tới host `hoadondientu.gdt.gov.vn` `/api/*` đã được Amendment #3/#4 xác lập (cùng host).
- `/api/sco-query/invoices/sold` **suy từ đối xứng**, chưa gọi trực tiếp trong probe này.
- Vẫn giữ kiểm hợp đồng **mềm** cho `invoice_envelope` ở tầng query (lớp phòng thủ); nâng hard-raise là quyết định governance riêng (cập nhật `.claude/rules/gdt-adapter.md` + test).

---

## Amendment #4 (2026-07-13) — T0 tới được endpoint XÁC THỰC: `authenticate` trả 200 + JWT; gỡ nhãn CHƯA KIỂM CHỨNG cho `AUTH_PATH`

> Bổ khuyết trực tiếp "Giới hạn của bằng chứng" ở Amendment #3 (khi đó **mới** kiểm chứng `/api/captcha` công khai, **chưa** kiểm chứng endpoint cần xác thực). Probe đăng nhập THẬT theo **QĐ-2** (`docs/plans/U1-plan.md`, runbook `docs/prompts/U1-probe-authenticate.md`): có người trực **đọc + nhập captcha** (KHÔNG bypass), credential nạp **ephemeral** qua `.dev.vars` rồi **xoá ngay** sau probe.

### Bằng chứng (2026-07-13, `wrangler dev --remote`, spike `spikes/gdt-egress-probe`, route probe tạm — đã revert)

Worker chạy trên colo Cloudflare thật gọi `POST https://hoadondientu.gdt.gov.vn/api/security-taxpayer/authenticate` **qua adapter thật** (`authenticate()` trong `packages/gdt-client`), body `{username, password, ckey, cvalue}` (captcha do người dùng đọc + gõ). Log server (bản che) đối chiếu độc lập với trang kết quả trên trình duyệt.

| Chỉ số | Giá trị |
|---|---|
| `httpStatus` | `200` |
| `hasToken` | `true` (JWT, prefix `eyJ...` — **không** ghi lại token đầy đủ) |
| `egressCountry` (`cdn-cgi/trace`) | `SG` (Singapore — colo CF nước ngoài, xác nhận egress không phải VN cục bộ) |
| verdict | `VERIFIED` |

### Kết luận

- **T0 (thuần Cloudflare) tới được endpoint XÁC THỰC** `/api/security-taxpayer/authenticate`, không chỉ endpoint captcha công khai — đóng đúng khoảng trống nêu ở Amendment #3.
- Hình dạng phản hồi thành công khớp hợp đồng `authenticate` `{token}` (`packages/gdt-client/gdt-contract-schema.json`).
- **Gỡ nhãn `CHƯA KIỂM CHỨNG`** cho `AUTH_PATH` trong `endpoints.ts` + cập nhật `gdt-contract-schema.json` (`authenticate`) sang trạng thái ĐÃ KIỂM CHỨNG. Bằng chứng đầy đủ (ngày, status, egress, hasToken, đã che token/password) ở `docs/CHECKLIST-NGHIEM-THU.md` (U1).

### Giới hạn của bằng chứng (không phóng đại)

- **Chưa** kiểm chứng `INVOICE_ENDPOINTS` (`/api/query/invoices/*`, `/api/sco-query/invoices/*`) — vẫn giữ nhãn `CHƯA KIỂM CHỨNG`, là việc của **U2**.
- Probe là **bán thủ công một lần** (không vào CI tự động): captcha cần người thật. CI (`make test-contract`) chỉ giữ contract công khai `/api/captcha`.
- Mã probe **tạm, đã revert** ngay sau khi lấy bằng chứng (`git status` sạch); credential ephemeral đã xoá — không lưu mật khẩu thuế thô (ranh giới `security.md`).

---

## Amendment #3 (2026-07-13) — Phép thử quyết định: T0 thuần Cloudflare CHẠY với endpoint đúng; gỡ TREO, bỏ relay VN

> Thực thi đúng bước "Test quyết định còn lại" mà Amendment #2 đã đặt ra. Kiểm chứng bằng `wrangler dev --remote` (edge Cloudflare thật, KHÔNG local) nhắm **đúng** `https://hoadondientu.gdt.gov.vn/api/captcha`.

### Bằng chứng (2026-07-13, `wrangler dev --remote`, spike `spikes/gdt-egress-probe`, route `/decision`)

Worker (chạy trên colo Cloudflare thật, không phải máy local) gọi trực tiếp `GET https://hoadondientu.gdt.gov.vn/api/captcha` rồi đọc `https://www.cloudflare.com/cdn-cgi/trace` để xác nhận IP egress không phải VN (loại trừ khả năng "đạt giả" do egress cục bộ trùng IP VN).

| Lần gọi | `status` | `egressCountry` (từ `cdn-cgi/trace`, xác nhận egress là colo CF thật — không phải máy local VN) | `bodyPreview` |
|---|---|---|---|
| 1 | `200` | `HK` | `{"key":"6a549f29add46b3412d172ac","content":"<svg ...>"}` |
| 2 | `200` | `HK` | `{"key":"6a549f2fadd46b3412d174eb","content":"<svg ...>"}` |
| 3 | `200` | `HK` | `{"key":"6a549f310375c3799e8c2023","content":"<svg ...>"}` |

3 lần gọi liên tiếp, đều `200`, đều JSON hợp lệ đúng hình dạng `{key, content}` (khớp `packages/gdt-client/gdt-contract-schema.json` kỳ vọng cho `/captcha`), đều từ colo `HK` (Hồng Kông — nước ngoài, không phải VN) ⇒ loại trừ giả thuyết "đạt do egress cục bộ mang IP Việt Nam".

### Kết luận

- **Nhánh quyết định ở Amendment #2 mục "2. Test quyết định còn lại" chọn nhánh đầu:** `200` + JSON `{key,content}` từ colo nước ngoài ⇒ **T0 (Workers `fetch()` trực tiếp, thuần Cloudflare) tới được API GDT thật `/api/captcha` qua `:443`**.
- **Gỡ TREO** đặt ra ở Amendment #2: nhánh relay VN/VPS/Tunnel/`ADR-0002`/`U1a` **không cần dựng** cho đường API — giữ nguyên trạng thái *lưu trữ làm bằng chứng lịch sử*, không xoá tài liệu, nhưng **không còn là việc phải làm trước U1**.
- `GdtTransport` mặc định quay lại **`direct-cf` (T0)**; `vn-relay` (T1) hạ xuống vai trò dự phòng lý thuyết — chỉ dựng lại nếu probe định kỳ (mục "Đường ra & fallback", `.claude/rules/gdt-adapter.md`) phát hiện `GEO_BLOCKED`/breaker mở thật sự trong tương lai.
- **Việc kế tiếp (đã có bằng chứng, không còn là giả định):** sửa `BASE` trong `packages/gdt-client/src/endpoints.ts` + `backend/gdt_client.py` → `https://hoadondientu.gdt.gov.vn` (`:443`), path `/api/...`, kèm contract test khoá `{key, content}`; sau đó vào **U1** (không còn bị U1a chặn).

### Giới hạn của bằng chứng (nói thẳng, không phóng đại)

- Route `/decision` gọi `/api/captcha` — endpoint công khai duy nhất đã kiểm chứng. **Chưa** kiểm chứng T0 có tới được các endpoint cần xác thực (`/authenticate`, `/query/invoices/*`) — đó là việc của U1/U2, không suy diễn từ kết quả này.
- Egress country quan sát được (`HK`) là colo phục vụ request tại thời điểm test; Cloudflare có thể route qua colo khác ở lần gọi sau — không ảnh hưởng kết luận (mọi colo nước ngoài đều xác nhận "không phải egress cục bộ VN"), nhưng không nên hiểu nhầm là "luôn luôn cố định HK".

---

## Amendment #2 (2026-07-13) — Tiền đề cổng `:30000` SAI; API thật ở `/api` trên `:443`

> Kiểm chứng bằng `curl` từ **vantage VN thật** + đọc **lưu lượng sống** của trang login GDT. **Đảo một tiền đề nền của Amendment 2026-07-12.** Nền tảng (Workers/TS, Postgres/Hyperdrive) giữ nguyên; phần **egress/relay bị TREO để tái thẩm định**.

### Bằng chứng (2026-07-13, vantage VN)

| Phép thử | Kết quả | Diễn giải |
|---|---|---|
| `curl :30000/captcha` (hostname → 103.9.200.142) | **Connection refused ~34ms** | Không dịch vụ nào lắng nghe `:30000`. Refused (không timeout) ⇒ **không phải** chặn địa lý. |
| `dig +short hoadondientu.gdt.gov.vn` | **103.9.200.142** (netname GDT-VN) | Phân giải **thẳng** origin VN — **KHÔNG** sau Cloudflare. Đính chính khẳng định "zone Cloudflare proxied" ở Amendment #1. |
| `curl :443/captcha` (± `Accept: json`) | **404** Next.js `_error` (`isServer:true`) | `/captcha` không tồn tại ở host này ⇒ path BASE cũ sai. |
| **Lưu lượng sống trang login** | `GET https://hoadondientu.gdt.gov.vn/api/captcha` | **API thật: `:443`, cùng host, tiền tố `/api`.** |

### Kết luận

- **`BASE = https://hoadondientu.gdt.gov.vn:30000` là SAI** (kế thừa từ chú thích chưa kiểm chứng ở `backend/gdt_client.py` dòng 27–31). Đúng: **`https://hoadondientu.gdt.gov.vn`** (`:443`), captcha ở **`/api/captcha`**.
- **521 ở Amendment #1 là ARTIFACT của việc gọi cổng chết `:30000`**, KHÔNG phải bằng chứng GDT chặn biên Cloudflare. Suy luận "cần relay VN" đứng trên tiền đề sai.
- GDT **không** nằm sau Cloudflare; `:443` mở và spike gốc **đã trả 200 từ colo CF SG** ⇒ **prior mạnh rằng Workers tới được API `:443` (T0) — nhiều khả năng KHÔNG cần relay/VPS/Tunnel.**

### TREO & bước sửa (chưa xoá — giữ làm bằng chứng lịch sử)

1. **TREO để tái thẩm định:** quyết định relay (Amendment #1), `ADR-0002`, mốc `U1a`, mục "Relay VN" trong `.claude/rules/security.md`, mọi dòng `:30000` trong docs/code.
2. **Test quyết định còn lại:** chạy lại egress probe nhắm **đúng** `https://hoadondientu.gdt.gov.vn/api/captcha` **từ biên Cloudflare** (`wrangler dev --remote`/deploy). `{key, content}` ⇒ **gỡ bỏ relay/VPS/Tunnel/U1a, trở lại T0 thuần Cloudflare**; nếu bị chặn địa lý ⇒ tái lập relay nhưng nhắm **đúng** endpoint 443 `/api`.
3. **Sửa `BASE`** ở `packages/gdt-client/src/endpoints.ts` + `backend/gdt_client.py` (→ `:443`, path `/api/...`) kèm contract test — việc của phiên Claude Code (không làm ở đây).

---

## Amendment (2026-07-12) — Egress T0 (thuần Cloudflare) BỊ BÁC BỎ cho API; T1 relay VN là ĐƯỜNG CHÍNH

> Bổ sung sau khi **kiểm chứng lại egress bằng probe trên edge thật** (`wrangler dev --remote`, colo SG). ADR **giữ trạng thái Accepted**; đây là changelog sửa **một giả định sai của bản gốc** (mục 5B, 8, 9), **không** đảo quyết định nền tảng — Workers/TS + Postgres/Hyperdrive giữ nguyên.

### Bằng chứng probe (edge thật Cloudflare, colo SG — 2026-07-12)

| Phép thử (từ Cloudflare Worker) | Kết quả | Diễn giải |
|---|---|---|
| `fetch https://hoadondientu.gdt.gov.vn:30000/captcha` | **HTTP 521** · `server: cloudflare` · body `error code: 521` | Biên Cloudflare **KHÔNG tới được** origin API trên `:30000` |
| `connect(TLS) :30000` (Workers TCP Sockets) | **không nối được** — `cannot connect to the specified address` | Sockets cũng không tới `:30000` |
| `fetch :443/captcha` | **404** · `server: cloudflare` · HTML SPA | `:443` chỉ là tầng web; `/captcha` **không phải** API ở đây |
| `fetch :443/` (root) | **200** · HTML SPA | Đúng thứ spike gốc đo — **chỉ web SPA**, không phải API |
| direct-origin (resolveOverride / TCP tới origin IP) | **inconclusive** — 521 từ Cloudflare / bị `wrangler dev --remote` chặn | Không né được lớp CF từ biên; không có bằng chứng đi vòng được |

DNS công khai: `hoadondientu.gdt.gov.vn` → **`103.9.200.142`** (netname **GDT-VN**, origin Việt Nam — **không** phải IP Cloudflare).

### Kết luận (thay cho "Kết quả spike (2026-07-11)" ở mục 5B)

- Spike gốc kết luận **sai**: chỉ đo `:443` **root** (cổng web SPA CF-fronted, trả 200), **không phải API `:30000`**. Đính chính tại mục 5B.
- **Từ biên Cloudflare KHÔNG tới được API `:30000`** — bằng cả `fetch()` lẫn TCP `connect()`. Tên miền GDT là zone Cloudflare (proxied); edge phục vụ `:443` nhưng trả 521 cho `:30000`.
- Không có đường "thuần Cloudflare" nào tới API → **nhánh (b)** trong cây quyết định đã chốt.

### Quyết định sửa đổi

1. **T1 relay VN = ĐƯỜNG CHÍNH cho mọi gọi API GDT** (`:30000`). T0 (Workers `fetch()` trực tiếp) **chỉ** còn dùng cho tài nguyên công khai `:443` + probe egress — **KHÔNG** cho API.
2. **`GdtTransport` mặc định = `vn-relay`.** `direct-cf` không còn là mặc định; chỉ dùng cho probe/tài nguyên `:443`.
3. **Relay VN được nâng thành THÀNH PHẦN TRỌNG YẾU VỀ BẢO MẬT** (không còn là "fallback tiện lợi"):
   - **mTLS + shared-secret**; **chỉ** Worker của dự án gọi được relay.
   - **Stateless**: chỉ *forward* request tới GDT rồi trả nguyên response; **không lưu**, **không log** body / credential / token / `raw_json`.
   - Đặt tại **điểm hiện diện Việt Nam** (VPS Viettel/VNPT/FPT…), gọi thẳng origin `103.9.200.142:30000`.
   - Ràng buộc chi tiết: `.claude/rules/security.md` mục "Relay VN (egress GDT)".
4. **Dependency bắt buộc mới:** production **phụ thuộc một egress host đặt tại VN** — thành phần ngoài Cloudflare (mất tính "thuần Cloudflare" cho đường API, đã chấp nhận). **Không có relay VN ⇒ không đồng bộ được hóa đơn.**
5. **Lộ trình:** chèn mốc **U1a — Dựng relay VN + kiểm chứng egress `:30000`** TRƯỚC U1 (xem `docs/CHECKLIST-NGHIEM-THU.md`). U1 (captcha + authenticate) **BỊ CHẶN bởi U1a**.

### Còn phải kiểm chứng (điều kiện tiên quyết của U1a)

Từ **vantage VN thật**: `curl https://103.9.200.142:30000/captcha` (Host: `hoadondientu.gdt.gov.vn`) trả JSON `{key, content}` hợp lệ. **Chưa có VPS VN ⇒ chưa dựng relay, chưa vào U1a/U1.**

---

## 1. Bối cảnh

VATCrawlbot là SaaS multi-tenant truy xuất hóa đơn đầu vào/đầu ra trực tiếp từ Hệ thống Hóa đơn điện tử của Tổng cục Thuế (`hoadondientu.gdt.gov.vn`), phục vụ tới 100.000 doanh nghiệp. Đặc trưng tải:

- **I/O-bound, không CPU-bound:** công việc chính là gọi HTTP tới GDT, phân trang, parse JSON, khử trùng lặp và upsert. Rất ít tính toán nặng.
- **Việc nặng nằm ở nền:** đồng bộ định kỳ hàng chục nghìn tenant, phải idempotent, có retry/backoff/circuit breaker, tôn trọng rate limit phía GDT.
- **Multi-tenant nghiêm ngặt:** mọi truy vấn gắn `tenant_id`; cách ly dữ liệu; tuân thủ NĐ 13/2023, NĐ 123/2020, TT 78/2021.
- **Dữ liệu tài chính cần truy vấn quan hệ + lưu bản thô:** khóa tự nhiên `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`; luôn lưu `raw_json`; phục vụ đối chiếu – kê khai – kết xuất kế toán.

Chủ dự án yêu cầu tận dụng **toàn bộ hệ sinh thái Cloudflare** cho cả backend và frontend.

---

## 2. Động lực quyết định (Decision Drivers)

1. Phù hợp workload I/O-bound + job nền bền (durable), có retry/backoff/circuit breaker sẵn.
2. Cô lập được adapter GDT, dễ mock + viết contract test.
3. Cách ly multi-tenant + bảo mật ở tầng dữ liệu; lưu `raw_json`; hỗ trợ khóa tự nhiên & upsert idempotent.
4. Vận hành ở quy mô 100k tenant với chi phí và độ phức tạp hạ tầng thấp (serverless, không quản máy chủ).
5. Tôn trọng máy chủ thuế (rate limit phía client) và ranh giới pháp lý/đạo đức trong Hiến pháp.
6. Giảm thiểu rủi ro cho một sản phẩm **Enterprise production** (tránh phụ thuộc thành phần còn beta ở đường đi chính).

---

## 3. Bản đồ năng lực Cloudflare → yêu cầu dự án

| Nhu cầu dự án | Dịch vụ Cloudflare | Ghi chú năng lực (theo docs 2026) |
|---|---|---|
| API stateless, biên toàn cầu | **Workers** | CPU tới 5 phút/req (mặc định 30s); wall-time HTTP không giới hạn khi client còn kết nối; 128 MB RAM/isolate; 10.000 subrequest/req (paid). |
| Frontend SPA | **Workers Static Assets / Pages** | Tối đa 100.000 file/phiên bản, 25 MiB/file (paid). Host React/Next/SvelteKit. |
| Điều phối đồng bộ nhiều bước, bền | **Workflows** | Durable multi-step, tự retry, `step.sleep`, `waitForEvent`; wall-time mỗi step không giới hạn. Lý tưởng cho đồng bộ idempotent. |
| Hàng đợi job nền | **Queues** | 10.000 queue/account; 128 KB/message; 100 lần retry; 250 consumer đồng thời; 5.000 msg/s/queue; backlog 25 GB/queue; consumer 15 phút. |
| Chạy định kỳ | **Cron Triggers** | 250 cron/account; wall 15 phút; CPU 15 phút nếu chu kỳ ≥ 1 giờ. |
| Rate limit + circuit breaker theo tenant/MST | **Durable Objects** | Đối tượng đơn nhất toàn cầu, đơn luồng, lưu trạng thái nhất quán mạnh, có Alarms. Chuẩn để giữ token-bucket + trạng thái ngắt mạch từng tenant. |
| Lưu file thô lớn (XML/PDF/kết xuất) | **R2** | Object storage tương thích S3, **không phí egress**. |
| Session/cấu hình đọc nhiều | **Workers KV** | Key-value, đọc độ trễ thấp; Cloudflare Access cũng dùng KV cho credential. |
| Giữ Postgres hiện có (JSONB, RLS) | **Hyperdrive** | Pool kết nối + cache truy vấn tới Postgres/MySQL ngoài (Neon, Supabase, PlanetScale, RDS…) từ Workers, dùng driver `pg` sẵn có. |
| DB serverless gốc Cloudflare | **D1** | SQLite. Tối đa 10 GB/DB (cứng); 50.000 DB/account (có thể xin lên hàng triệu); thiết kế cho **database-per-tenant**. Có JSON functions, read-replication (beta). |
| Đo lường/định lượng theo tenant (billing) | **Analytics Engine** | Time-series high-cardinality, truy vấn SQL — hợp cho usage-based billing. |
| Xác thực & bảo vệ | **Cloudflare Access (Zero Trust), WAF, Secrets** | SSO/chính sách cho khu vực quản trị; bí mật qua Workers Secrets/Secrets Store. |

**Lưu ý captcha:** Hiến pháp cấm phá captcha bằng máy — captcha GDT do người dùng nhập. Turnstile của Cloudflare (nếu dùng) chỉ để **bảo vệ chính app VATCrawlbot** khỏi bot, **không** dùng để vượt captcha của GDT.

---

## 4. Hai quyết định mở (cần chủ dự án chọn)

### 4A. Tầng dữ liệu

| Phương án | Ưu | Nhược | Hợp khi |
|---|---|---|---|
| **A1. D1 (SQLite) thuần, database-per-tenant** | Native Cloudflare nhất; cách ly tenant ở mức **DB riêng** (mạnh hơn RLS logic); mô hình 50k→hàng triệu DB khớp 100k tenant; chi phí chỉ theo query+storage; đồng bộ theo tenant chạy đơn luồng gọn. | **Là SQLite, không phải Postgres** → mất JSONB thật (chỉ có JSON functions), mất RLS, SQL kém phong phú; **10 GB/DB là trần cứng**; truy vấn xuyên tenant (báo cáo tổng) phải fan-out; query tối đa 30s. **Vi phạm Hiến pháp** → phải sửa. | Muốn thuần Cloudflare, chấp nhận đổi Hiến pháp, dữ liệu mỗi tenant < 10 GB, ít báo cáo xuyên tenant. |
| **A2. Postgres ngoài + Hyperdrive** (khuyến nghị) | **Giữ nguyên Hiến pháp** (JSONB `raw_json`, RLS theo `tenant_id`, SQL trưởng thành, đối chiếu bằng JOIN mạnh); Hyperdrive lo pool + cache, giảm độ trễ từ Workers; Neon/Supabase scale, đặt region gần VN (SG). | Không "thuần Cloudflare" 100% — thêm một nhà cung cấp Postgres ngoài (chi phí + phụ thuộc); một DB lớn cần chiến lược partition khi rất lớn; cân nhắc phí egress/độ trễ tới origin. | Ưu tiên tôn trọng Hiến pháp, cần truy vấn/đối chiếu tài chính mạnh, muốn rủi ro kỹ thuật thấp nhất. |
| **A3. Lai D1 + Postgres** | D1-per-tenant cho dữ liệu hóa đơn "nóng"; Postgres qua Hyperdrive cho phân tích/đối chiếu xuyên tenant + billing. Linh hoạt nhất. | Hai mô hình dữ liệu song song → phức tạp đồng bộ, tăng chi phí bảo trì & lỗi. | Có đội mạnh, chấp nhận phức tạp để tối ưu cả chi phí lẫn khả năng phân tích. |

**Khuyến nghị:** **A2 (Postgres + Hyperdrive)** cho giai đoạn production đầu tiên. Dữ liệu hóa đơn thuế là dữ liệu tài chính cần JSONB `raw_json`, RLS, và đối chiếu quan hệ — đây đúng sở trường Postgres và **tôn trọng Hiến pháp**. Hyperdrive vẫn là dịch vụ Cloudflare nên vẫn "trong hệ sinh thái". Giữ **A1 (D1-per-tenant)** như con đường tối ưu chi phí/native để đánh giá lại ở giai đoạn scale, nếu chấp nhận sửa Hiến pháp.

### 4B. Ngôn ngữ chạy trên Workers

| Phương án | Ưu | Nhược |
|---|---|---|
| **B1. TypeScript** (khuyến nghị) | Đường chính, trưởng thành nhất trên Workers; toàn bộ binding (Queues, Workflows, D1, R2, DO, Hyperdrive) + tài liệu/ví dụ đầy đủ; hệ sinh thái Hono/Zod/Drizzle mạnh; rủi ro production thấp. | Khác Hiến pháp (Python); đội phải thạo TS; mất thư viện Python cho parse/kế toán. |
| **B2. Python trên Workers** | Giữ Python theo Hiến pháp; hỗ trợ FastAPI, httpx, Pydantic; bind được D1/R2/Queues/Workflows. | **Còn beta** (cần cờ `python_workers`); gói phụ thuộc giới hạn theo Pyodide; một số tính năng/binding đi sau; **rủi ro cho SaaS Enterprise 100k khách ở đường đi chính**. |

**Khuyến nghị:** **B1 (TypeScript)** cho runtime Workers vì đây là sản phẩm production Enterprise — không nên đặt beta (Python Workers) trên đường đi chính. Kỷ luật "cô lập adapter + contract test" là **độc lập ngôn ngữ**, nên vẫn giữ nguyên tinh thần Hiến pháp về kiến trúc. Nếu có thư viện parse **chỉ có ở Python** là bắt buộc, tách riêng một dịch vụ Python nhỏ (Cloudflare Containers — *cần spike kiểm chứng*) thay vì đưa Python vào toàn bộ backend.

---

## 5. Quyết định (kiến trúc đề xuất)

Áp dụng **kiến trúc serverless thuần Cloudflare**, backend TypeScript trên Workers, tầng dữ liệu theo lựa chọn 4A (mặc định A2). Sơ đồ luồng:

```
Người dùng ─▶ Cloudflare (WAF, Access/Zero Trust)
                 │
      ┌──────────┴───────────┐
      ▼                      ▼
Frontend SPA           API Worker (TS, stateless)
(Workers Static           │  ├─ Auth: JWT session ↔ KV; Access cho admin
 Assets / Pages)          │  ├─ Truy vấn dữ liệu (RLS theo tenant_id)
                          │  └─ Ghi bí mật/credential → Secrets Store (mã hoá)
                          │
   Cron Trigger (định kỳ) ┼─▶ Queues (job "đồng bộ tenant X kỳ Y")
                          │        │
                          │        ▼
                          │   Consumer Worker ─▶ Workflow (durable, idempotent)
                          │        │   step: đăng nhập/kiểm token ─▶ 401? dừng+báo
                          │        │   step: phân trang /query/... & /sco-query/...
                          │        │   step: parse + khử trùng lặp (khóa tự nhiên)
                          │        │   step: upsert + lưu raw_json
                          │        ▼
                          │   Durable Object (per tenant/MST):
                          │        token-bucket rate limit + circuit breaker
                          │
   ┌──────────────────────┴───────────────────────────────┐
   ▼                 ▼                 ▼                    ▼
gdt_client        Postgres          R2 (XML/PDF,        Analytics Engine
(adapter cô lập)  (Hyperdrive)      kết xuất lớn)       (usage/billing)
fetch()+timeout   JSONB raw_json
+retry/backoff    RLS tenant_id
```

### Ánh xạ thành phần

- **`gdt_client` (adapter cô lập):** một module Worker duy nhất, mọi gọi ra GDT đi qua một interface **`GdtTransport` hoán đổi được** (không gọi `fetch()` trực tiếp trong logic nghiệp vụ) — nhờ vậy có thể đổi đường ra (Cloudflare trực tiếp ↔ egress IP Việt Nam) mà không đụng phần còn lại. Mọi transport đều có timeout + retry backoff; 401 → dừng, báo hết hạn token. Giữ đúng quy tắc cứng Hiến pháp; contract test bằng Vitest + Miniflare, nhóm `contract` gọi endpoint công khai GDT. Chi tiết chuỗi đường ra: mục **5B**.
- **Đồng bộ nền:** Cron Trigger phát tán job → **Queues** (một message/tenant/kỳ) → consumer khởi tạo **Workflow** cho từng tenant. Workflow đảm bảo bền vững, tự retry từng bước, không nhân đôi khi chạy lại (idempotent qua khóa tự nhiên + upsert). Việc phân trang hai họ endpoint (`/query/invoices/{purchase,sold}` và `/sco-query/invoices/{purchase,sold}`) chia thành các step, chunk nhỏ để không chạm trần CPU/wall.
- **Rate limit & ngắt mạch:** một **Durable Object** cho mỗi tenant (hoặc mỗi MST) giữ token-bucket + trạng thái circuit breaker, đảm bảo "không gọi dồn dập" máy chủ thuế.
- **Dữ liệu:** Postgres (Neon/Supabase, region gần VN) qua **Hyperdrive**, JSONB cho `raw_json`, RLS theo `tenant_id`. **R2** cho XML/PDF gốc và file kết xuất lớn. **KV** cho session/cấu hình. **Analytics Engine** cho định lượng theo tenant phục vụ billing.
- **Frontend:** React/Next.js (hoặc SvelteKit) trên **Workers Static Assets/Pages**; gọi API Worker cùng account qua Service Binding khi cần.
- **Bảo mật:** **Cloudflare Access/Zero Trust** cho khu vực quản trị nội bộ; **không lưu mật khẩu thuế thô** — ưu tiên chỉ lưu token phiên, hoặc mã hoá envelope; bí mật qua **Workers Secrets/Secrets Store**; audit log hành động nhạy cảm (giữ nguyên `security.md`).

---

## 5B. Chiến lược đường ra GDT (Egress) — Probe + Fallback

`hoadondientu.gdt.gov.vn` là cổng của cơ quan thuế Việt Nam. Workers gọi ra từ IP biên Cloudflare toàn cầu (thường **không phải IP Việt Nam**), nên GDT có thể chặn/giới hạn theo địa lý. Vì **không thể giả định trước**, ta thiết kế hệ thống để **tự dò và tự chuyển đường ra**, thay vì chọn cứng một phương án.

### Nguyên tắc: trừu tượng hóa đường ra sau một interface

Mọi lời gọi GDT đi qua `GdtTransport` (đổi được lúc chạy, không đụng logic):

```ts
export type ProbeVerdict = "OK" | "GEO_BLOCKED" | "RATE_LIMITED" | "TIMEOUT" | "ERROR";

export interface GdtTransport {
  readonly name: string;                 // "direct-cf" | "vn-relay"
  fetch(url: string, init?: RequestInit): Promise<Response>;
  probe(): Promise<{ verdict: ProbeVerdict; egressIp?: string; egressCountry?: string; latencyMs: number }>;
}
```

### Chuỗi fallback (thứ tự ưu tiên)

| Tầng | Đường ra | Thuần Cloudflare? | Khi dùng |
|---|---|---|---|
| **T0** | **Workers `fetch()` trực tiếp** từ biên Cloudflare | ✅ Có | ~~Mặc định cho API~~ → **BÁC BỎ cho API (521 trên `:30000`)**. Chỉ còn dùng cho tài nguyên công khai `:443` + probe egress. |
| **T1** | **Relay đặt tại Việt Nam** (VPS VN: Viettel/VNPT/FPT…), Worker gọi qua relay bằng mTLS + shared-secret; relay chỉ *chuyển tiếp* request tới GDT rồi trả nguyên response. | ❌ Không (một thành phần ngoài Cloudflare, đặt tại VN) | **ĐƯỜNG CHÍNH cho API `:30000`** (Amendment 2026-07-12). `GdtTransport` mặc định = `vn-relay`. |

> Ghi chú kỹ thuật: Workers `fetch()` **không hỗ trợ HTTP proxy**, nên T1 dùng **mẫu relay** (Worker POST gói `{method,url,headers,body}` tới relay VN; relay gọi GDT và trả về) thay vì proxy CONNECT. Relay phải **stateless, không lưu dữ liệu hóa đơn**, chỉ forward — để giảm bề mặt tuân thủ/bảo mật. Các lựa chọn thay thế cần đánh giá thêm: **Cloudflare Tunnel/WARP Connector** đặt tại VN, hoặc **Magic WAN** — nhưng phức tạp hơn và vẫn cần điểm hiện diện VN.

### Cơ chế gọi thử (probe) + quyết định chuyển đường

1. **Probe định kỳ (Cron, ví dụ mỗi 5–15 phút):** với mỗi transport, gọi thử một endpoint công khai nhẹ của GDT **và** một dịch vụ echo (`.../cdn-cgi/trace`) để ghi lại **IP + quốc gia egress**. Phân loại kết quả thành `ProbeVerdict`.
2. **Lưu trạng thái sức khỏe từng transport** trong Durable Object (per-transport circuit breaker) + KV để đọc nhanh; đẩy metric sang Analytics Engine.
3. **Runtime routing:** mỗi request GDT thử theo thứ tự T0 → T1; nếu T0 trả verdict `GEO_BLOCKED` (hoặc breaker T0 đang mở) → dùng ngay T1 và đánh dấu breaker. Định kỳ probe lại T0 để **tự phục hồi** khi GDT nới chặn.
4. **Cảnh báo:** khi phải chuyển sang T1 (nghĩa là T0 bị chặn), phát cảnh báo cho vận hành — vì đây là tín hiệu "không còn thuần Cloudflare".
5. **Contract test (nhóm `contract`):** chạy probe trong CI để phát hiện sớm khi GDT đổi hành vi chặn hoặc đổi API.

Một **spike gọi thử chạy được** đã được tạo tại `spikes/gdt-egress-probe/` để xác minh thực tế T0 (và T1 nếu đã dựng relay) trước khi chốt ADR.

### Kết quả spike (2026-07-11) — ⚠️ ĐÃ ĐÍNH CHÍNH (xem Amendment 2026-07-12)

> **Đính chính (2026-07-12):** Kết quả dưới đây **đo sai đối tượng** — chỉ gọi `:443` **root** (cổng web SPA CF-fronted), **không phải API `:30000`**. Kết luận "T0 thuần Cloudflare khả thi" là **SAI với API**. Probe edge thật ngày 2026-07-12 cho thấy biên Cloudflare **không** tới được API `:30000` (521 / không nối được). Giữ lại đoạn gốc dưới đây làm bằng chứng lịch sử; quyết định hiện hành nằm ở **Amendment** đầu tài liệu.

Deploy thật lên biên Cloudflare và gọi thử:

```json
{"decidedTransport":"direct-cf","results":[{"transport":"direct-cf","verdict":"OK",
 "httpStatus":200,"egressIp":"2a06:98c0:3600::103","egressCountry":"SG","latencyMs":543}]}
```

→ **T0 (thuần Cloudflare) gọi được GDT** (HTTP 200) từ colo **Singapore** (egress country `SG`, **không phải VN nhưng không bị chặn**), độ trễ ~543 ms. **Kết luận sơ bộ: kiến trúc thuần Cloudflare khả thi; chưa cần dựng relay VN (T1) ngay.**

**Vẫn phải lưu ý (chưa xác minh):** đây là **một** lần gọi, từ **một** colo, tới endpoint gốc `/` (chưa đăng nhập). Chưa chứng minh: (a) mọi colo khác của Cloudflare đều không bị chặn; (b) GDT không chặn/giới hạn khi **tải cao/nhiều request liên tục**; (c) hành vi trên **endpoint truy vấn hóa đơn thật** (cần token). Vì vậy **giữ nguyên** abstraction `GdtTransport` + probe định kỳ (Cron) để tự phát hiện nếu GDT siết chặn về sau, và **giữ T1 như fallback đã thiết kế** (chỉ dựng khi probe báo `GEO_BLOCKED`/`RATE_LIMITED` ổn định).

---

## 6. Cách triển khai (deployment)

1. **Monorepo + Wrangler:** mỗi service (api, sync-consumer, workflows, frontend) có `wrangler.jsonc` riêng; đặt `compatibility_date` cố định và cờ `nodejs_compat`; binding khai báo tường minh (D1/R2/KV/Queues/Hyperdrive/DO).
2. **Môi trường:** `dev` → `staging` → `production` bằng Wrangler environments; preview deployment cho mỗi PR.
3. **CI/CD:** GitHub Actions chạy `lint` (ESLint/Biome + `tsc`) → test (Vitest + `@cloudflare/vitest-pool-workers`, Miniflare) → `wrangler deploy`. Giữ các mục tiêu `make` tương đương: `make test`, `make test-contract`, `make lint`, `make deploy`.
4. **Migrations:** Postgres bằng Drizzle/Prisma migrate (nếu A2) hoặc D1 migrations (nếu A1).
5. **Bí mật:** không hard-code; nạp qua `wrangler secret` / Secrets Store; credential GDT của tenant mã hoá trước khi lưu.
6. **Observability:** Workers Logs + Logpush; Workflows visualizer; Analytics Engine cho metric nghiệp vụ; cảnh báo khi circuit breaker mở hoặc 401 hàng loạt.
7. **TDD giữ nguyên:** viết test trước; coverage ≥ 80% tầng nghiệp vụ; contract test bắt đổi API GDT.

---

## 7. Hệ quả

### Tích cực
- Hạ tầng serverless, không quản máy chủ; scale ngang tự nhiên tới 100k tenant; chi phí theo dùng.
- Workflows + Queues + Durable Objects thay trọn vai trò Celery/Redis với độ bền cao hơn và ít vận hành hơn.
- R2 không phí egress → rẻ khi lưu/kết xuất khối lượng lớn hóa đơn.
- Biên toàn cầu + WAF/Access sẵn có cho bảo mật và độ trễ.

### Bắt buộc sửa Hiến pháp (phải thông qua tường minh)
- **Ngăn xếp:** Python/FastAPI → **TypeScript/Workers (Hono)**; Celery+Redis → **Queues + Workflows + Durable Objects + Cron**; (A1) PostgreSQL → **D1**, hoặc (A2) giữ **PostgreSQL qua Hyperdrive**.
- **Lệnh chuẩn:** `make run/migrate/up` (uvicorn/alembic/docker-compose) → tương đương Wrangler (`wrangler dev/deploy`, migrations, Miniflare).
- **Quy tắc cứng "tầng ứng dụng stateless"** vẫn giữ; "cô lập adapter GDT" và "khóa tự nhiên + upsert idempotent" **giữ nguyên**, chỉ đổi ngôn ngữ/hạ tầng hiện thực.
- Cập nhật `.claude/rules/gdt-adapter.md`, `multi-tenant.md`, `security.md`, `testing.md` theo runtime mới.

### Tiêu cực / đánh đổi
- Khoá nhà cung cấp (vendor lock-in) vào Cloudflare.
- Nếu A1: mất Postgres/JSONB/RLS, trần 10 GB/DB, báo cáo xuyên tenant khó hơn.
- Nếu A2: vẫn phụ thuộc một Postgres ngoài (không thuần Cloudflare).
- Trần CPU 5 phút/req và wall 15 phút cho cron/queue/DO-alarm → tác vụ batch dài phải chia nhỏ theo step Workflow.

---

## 8. Rủi ro cần kiểm chứng trước khi chốt (spikes)

1. **❌ Egress IP tới API GDT — BÁC BỎ (Amendment 2026-07-12):** probe edge thật cho thấy biên Cloudflare **không** tới được API `:30000` (521 / không nối được); kết quả "ĐẠT" ngày 2026-07-11 chỉ đo `:443` root, không phải API. → **T1 relay VN là đường chính**; điều kiện tiên quyết mới là **dựng + kiểm chứng relay VN (U1a)**. Xem Amendment đầu tài liệu.
2. **Python-only libs:** nếu bắt buộc thư viện parse chỉ có ở Python → đánh giá Cloudflare Containers (cần kiểm chứng khả dụng/giá) hoặc một microservice ngoài.
3. **Dung lượng/tenant:** xác minh dữ liệu hóa đơn/tenant có vượt 10 GB không (quyết định A1 vs A2).
4. **Tuân thủ dữ liệu (NĐ 13/2023):** xác nhận nơi lưu trữ (region) và ràng buộc dữ liệu cá nhân với D1/R2/Postgres đã chọn.

---

## 9. Bước tiếp theo

1. ❌ **Spike egress-GDT (rủi ro #1) — ĐÃ CHẠY LẠI, BÁC BỎ T0 cho API** (Amendment 2026-07-12): biên Cloudflare không tới được API `:30000`. Điều kiện tiên quyết chuyển thành **U1a — dựng + kiểm chứng relay VN**.
2. Chủ dự án chọn **4A** (mặc định A2 — Postgres + Hyperdrive) và **4B** (mặc định B1 — TypeScript). Đây là 2 mục còn mở duy nhất trước khi chuyển trạng thái ADR sang *Accepted*.
3. Sau khi chốt: soạn PR sửa Hiến pháp + luật theo mục 7, dựng khung Wrangler U0, rồi tiếp tục U1–U3 (GDT Adapter) — trong đó tích hợp `GdtTransport` + probe và **contract test** xác minh thêm egress trên endpoint có token và dưới tải.

---

## 10. Nguồn tham chiếu

- Workers limits — https://developers.cloudflare.com/workers/platform/limits/
- D1 limits — https://developers.cloudflare.com/d1/platform/limits/
- Queues limits — https://developers.cloudflare.com/queues/platform/limits/
- Workflows — https://developers.cloudflare.com/workflows/
- Hyperdrive — https://developers.cloudflare.com/hyperdrive/
- Durable Objects — https://developers.cloudflare.com/durable-objects/
- R2 — https://developers.cloudflare.com/r2/
- Chọn sản phẩm lưu trữ — https://developers.cloudflare.com/workers/platform/storage-options/
- Python Workers (beta) — https://developers.cloudflare.com/workers/languages/python/

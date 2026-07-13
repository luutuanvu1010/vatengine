# RUNBOOK — Probe kiểm chứng cấu trúc endpoint DETAIL của GDT (U3)

> Chạy trong **Claude Code**, tại thư mục dự án, **có bạn ngồi cùng** (đã đăng nhập portal thuế bằng phiên Chrome của chính mình).
> Mục tiêu: quan sát **HÌNH DẠNG THẬT** của phản hồi khi mở chi tiết **một** hóa đơn, để gỡ nhãn `CHƯA KIỂM CHỨNG` cho `DETAIL_ENDPOINTS` + schema `invoice_detail`. **Không** phá captcha, **không** lưu mật khẩu/token thô, **không** ghi giá trị hóa đơn thật (số tiền, tên đối tác).
> Đây là **probe kiểm chứng dùng một lần** (như probe U1/U2), KHÔNG phải một đơn vị U — mọi mã probe là tạm, revert sau khi lấy bằng chứng.

## Bối cảnh — cái gì đã chắc, cái gì CHƯA

**ĐÃ KIỂM CHỨNG (không probe lại):** chỉ ba nhóm — `GET /api/captcha`; `POST /api/security-taxpayer/authenticate` (trả `{token}`); và **phong bì** `GET /api/(sco-)query/invoices/{purchase,sold}` = `{datas, total, state, time}`. Token gắn qua header `Authorization: Bearer`. Egress T0 (`direct-cf`) tới `hoadondientu.gdt.gov.vn` OK (ADR-0001 Amendment #3/#4/#5).

**CHƯA KIỂM CHỨNG — tuyệt đối KHÔNG viết như fact, mục tiêu của probe này là quan sát:**
- Đường dẫn detail thật: giả định `/api/query/invoices/detail` (HĐ thường) và `/api/sco-query/invoices/detail` (HĐ máy tính tiền) — **CHƯA gọi thật lần nào**. "Cùng họ endpoint với query nên chắc đúng" là **suy đoán**, không phải bằng chứng.
- Bộ tham số gọi detail (giả định 5 trường `nbmst, khhdon, khmshdon, shdon, tdlap` như `invoice_detail` trong `backend/gdt_client.py`) — **GIẢ ĐỊNH**, GDT có thể đòi khác.
- **Tên khóa mảng dòng hàng** trong body detail — GIẢ THUYẾT `hdhhdvu` (viết tắt "hàng hóa–dịch vụ") **chỉ suy từ domain/entity nội bộ `DongHangHoa`, KHÔNG từ quan sát lưu lượng nào**. `invoice_detail(row)` trong `backend/gdt_client.py` chỉ `return r.json()` thô, chưa từng duyệt mảng dòng → chưa từng "nhìn thấy" khóa này. Envelope query dùng `datas`, nhưng **KHÔNG được** suy ra body detail cũng dùng `datas` — detail là endpoint khác, phải quan sát riêng.
- **Tên từng trường dòng hàng** (`ten/dvtinh/sluong/dgia/thtien/…`) — đều là tên cột DB **nội bộ** trong `DongHangHoa` (KIEN_TRUC 7.1), do team đặt; "có trong tài liệu/entity nội bộ" **KHÔNG phải bằng chứng** (bài học `:30000`). Tất cả là GUESS cho tới khi probe.
- **Biểu diễn thuế suất từng dòng** — GIẢ THUYẾT: có thể là **chuỗi mã** (`"10%"`, `"8%"`, `"5%"`, `"0%"`, `"KCT"`, `"KKKNT"`, có thể `"KHAC"`) chứ không phải số thuần. **Chưa quan sát** cả tên khóa lẫn tập giá trị. Trình bày là "có thể", không phải "là".

---

Dán khối dưới đây vào phiên Claude Code:

Bạn tiếp nối dự án **VATCrawlbot**. Nhiệm vụ: chạy **probe kiểm chứng cấu trúc endpoint DETAIL** theo `docs/plans/U3-plan.md` (mục "Điểm mơ hồ") và ranh giới bảo mật của Hiến pháp + `.claude/rules/security.md` + `.claude/rules/gdt-adapter.md`. Tuân thủ tuyệt đối:

- **KHÔNG** in/log/trả về `token` thô, mật khẩu, cookie phiên ở bất kỳ đâu — token nằm trong header request của phiên Chrome; **không copy, không dán, không ghi lại**.
- **KHÔNG** ghi lại **giá trị hóa đơn thật**: số tiền, đơn giá, thành tiền, tiền thuế, tên hàng hóa, tên/MST đối tác. Chỉ cần **HÌNH DẠNG**: tên khóa, kiểu dữ liệu, cấu trúc (mảng/object), và **CÁCH mã hoá** thuế suất (ví dụ dạng đã **che** giá trị: `"số | chuỗi '10%' | mã 'KCT'"`).
- **KHÔNG** tự giải/bypass captcha. Probe chính **không đụng captcha** — người dùng đã đăng nhập sẵn bằng phiên Chrome của họ.
- Mã probe (nếu dùng đường phụ) là **tạm**: sau khi có bằng chứng, **revert** — không giữ route probe trong repo.
- Đây là **"đoán cấu trúc phản hồi API thuế"** mà Hiến pháp yêu cầu DỪNG khi mơ hồ. Không tự chốt khóa/tên trường từ giả thuyết; chỉ chốt từ quan sát thật ở probe này.

## Đường probe CHÍNH (khuyến nghị) — đọc network của Chrome đã đăng nhập (như U2)

Nhẹ, không cần credential trong `.dev.vars`, không dựng Worker. Chỉ đọc, không ghi giá trị thật.

1. Người dùng **đã đăng nhập** portal `hoadondientu.gdt.gov.vn` trong Chrome (phiên của chính họ — dữ liệu thuộc thẩm quyền tài khoản, đúng ranh giới pháp lý).
2. Mở **Network** (DevTools) hoặc dùng công cụ đọc network sẵn có; lọc theo `invoices`.
3. Trong danh sách hóa đơn, người dùng **mở chi tiết MỘT hóa đơn** (ưu tiên chọn: một HĐ **thường** để bắt đường `/query/…/detail`, và nếu có, một HĐ **máy tính tiền** để bắt `/sco-query/…/detail`). Thao tác mở này khiến portal bắn XHR lấy detail.
4. Với XHR detail vừa bắn: đọc **REQUEST** (đường dẫn đầy đủ + có/không tiền tố `/api`, method, danh sách **tên** query params — KHÔNG ghi giá trị định danh nếu nhạy cảm) và **RESPONSE** (chỉ **tên khóa** + kiểu; với 1 dòng hàng đầu tiên, liệt kê **tên khóa** từng trường và **cách** thuế suất được mã hoá, giá trị đã che).
5. Ghi lại theo mục "Cần quan sát/ghi lại gì" bên dưới. **Không** dán nguyên response chứa số tiền/tên đối tác vào chat hay file — chỉ trích tên khóa + kiểu + ví dụ mã hoá đã che.

> Lưu ý bảo mật khi đọc network: token JWT nằm ở header `Authorization` của request — **bỏ qua, không chép**. Body response chứa dữ liệu hóa đơn thật — **chỉ đọc cấu trúc, che giá trị**.

## Đường probe PHỤ (fallback) — temp Worker `wrangler dev --remote` (chỉ khi cần xác nhận egress T0 cho detail)

Chỉ dùng nếu cần chứng minh **T0 (`direct-cf`) tự gọi được** endpoint detail (không qua trình duyệt), ví dụ để loại trừ khả năng detail bị chặn địa lý khác với query. Nặng hơn (cần token ephemeral), nên **chỉ chạy khi đường chính chưa đủ trả lời câu hỏi egress**.

- Dựng Worker probe **tạm** trong `spikes/gdt-egress-probe/` (không đụng mã production `packages/gdt-client`), dùng `GdtTransport` `direct-cf` tối thiểu, gọi `getInvoiceDetail(transport, token, ref)` **nếu** hàm đã tồn tại; nếu chưa, gọi trực tiếp `DETAIL_ENDPOINTS.normal` với 5 tham số giả định để **quan sát status + hình dạng** (đây chính là phép kiểm chứng giả định đường dẫn/tham số).
- Token + `ref` (5 trường định danh của **một** hóa đơn thật) nạp **ephemeral** qua `.dev.vars` (đã gitignore) do **người dùng tự gõ**; bạn **không đọc** giá trị. Trả về chỉ: `httpStatus`, `egressCountry` (đọc `cdn-cgi/trace`), và **tên khóa cấp cao nhất** của body (che giá trị). **Không** in token, **không** in số tiền.
- Chạy `wrangler dev --remote` (biên thật, khớp T0). Sau khi lấy status/egress + tên khóa: **xoá** dòng credential/`ref` trong `.dev.vars`, `git checkout -- spikes/gdt-egress-probe/` (hoặc xoá file), `git status` xác nhận sạch.

## Cần quan sát/ghi lại gì (đúng danh sách chưa-kiểm-chứng cần giải)

Ghi lại (giá trị đã che ở mọi chỗ nhạy cảm):

1. **Đường dẫn detail thật:** `GET` (hay method khác?) trên `hoadondientu.gdt.gov.vn` có trả `200` cho `/api/query/invoices/detail` (HĐ thường) và `/api/sco-query/invoices/detail` (HĐ máy tính tiền) không — ghi **status code** + **đường dẫn chính xác** (có/không tiền tố `/api`).
2. **Tham số gọi detail:** GDT chấp nhận bộ tham số nào — xác nhận 5 tham số `nbmst, khhdon, khmshdon, shdon, tdlap` (như `invoice_detail` Python) có đủ trả `200` không, hay cần thêm/khác (vd `nban`/`tban`; định dạng `tdlap` có hậu tố `...T00:00:00` hay không). Ghi **tên** tham số, không ghi giá trị định danh nếu nhạy cảm.
3. **Tên khóa MẢNG dòng hàng** trong body detail: khóa nào chứa danh sách dòng hàng (`hdhhdvu`? khác?) — ghi **tên khóa thật** (giá trị đã che), và xác nhận là **mảng của object**.
4. **Tên khóa TỪNG TRƯỜNG** trong mỗi dòng hàng: khóa thật cho tên hàng, đơn vị tính, số lượng, đơn giá, thành tiền (khớp hay khác `ten/dvtinh/sluong/dgia/thtien`) — liệt kê **tập tên khóa** quan sát được trên **1** dòng (giá trị che).
5. **Khóa THUẾ SUẤT từng dòng:** tên khóa thật (`ltsuat`/`tsuat`/khác) và **KIỂU** dữ liệu (number hay string).
6. **Tập giá trị thuế suất thật:** cách GDT mã hoá — là **số** (`10`) hay **chuỗi** (`"10%"`), và có xuất hiện **mã chữ** (`"KCT"`, `"KKKNT"`, `"0%"`) không; ghi **ví dụ CÁCH mã hoá** (giá trị che nếu nhạy cảm).
7. **Khóa TIỀN THUẾ dòng:** có trường tiền thuế riêng cho từng dòng không, **tên khóa** là gì, có **luôn hiện diện** không.
8. **Các khóa cấp-hóa-đơn khác** trong body detail (ngoài mảng dòng hàng) để xác định `required_keys` cho schema `invoice_detail` — chỉ ghi **TÊN** khóa, không ghi giá trị.
9. **Egress:** detail đi cùng host `hoadondientu.gdt.gov.vn`; nếu chạy đường phụ, xác nhận T0 `direct-cf` vẫn trả `200` (không `GEO_BLOCKED`) cho endpoint detail. (Đường chính đi qua egress máy người dùng, không kiểm được T0 — nếu cần khẳng định T0 cho detail thì phải chạy đường phụ.)

## Xử lý khi LỆCH giả thuyết

- Nếu đường dẫn / tham số / khóa mảng / tên trường / kiểu thuế suất **khác** giả thuyết ở `U3-plan.md` (mục 3–4): **DỪNG**. Không nới assertion, không âm thầm chọn một bên.
- **Cập nhật tường minh**: sửa `DETAIL_ENDPOINTS` (nếu đường dẫn khác), `mapDetailLines` (nếu khóa/tên trường khác), và schema `invoice_detail` (`required_keys` theo quan sát thật) — kèm ghi chú ngày + nguồn bằng chứng. Ghi drift note nếu phát hiện lệch với kế hoạch.
- Nếu detail trả `403`/`451`/`GEO_BLOCKED` khi chạy đường phụ (T0): đây là **bằng chứng mới** cho khả năng cần relay VN cho detail — mở lại thảo luận (`security.md` mục Relay VN đang TREO), **không** tự chốt.
- Nếu bất kỳ trường thuế suất phi số nào xuất hiện: khẳng định lại quyết định **giữ nguyên giá trị gốc (raw)** trong `InvoiceLine`, **không ép sang number** ở U3 (ép kiểu làm mất mã chữ và lẫn `"0%"` với `"KCT"`). Chuẩn hoá số + đại diện mã là quyết định **U4/U5**.

## Nếu probe XANH: chốt bằng chứng + gỡ nhãn `CHƯA KIỂM CHỨNG`

Chỉ thực hiện khi đã quan sát **thật** (không suy đoán):

1. `packages/gdt-client/src/endpoints.ts` — trên `DETAIL_ENDPOINTS`, **xoá** nhãn `CHƯA KIỂM CHỨNG`, thay bằng: `// ĐÃ KIỂM CHỨNG (<ngày>): probe detail thật (Chrome đăng nhập thật của người dùng) — GET <đường dẫn chính xác> trả 200; mảng dòng hàng ở khóa '<khóa thật>'. Không ghi token/giá trị hóa đơn.` (ghi đúng khóa/đường dẫn quan sát được, kể cả khi khác giả thuyết).
2. `packages/gdt-client/gdt-contract-schema.json` — thêm/cập nhật entry `invoice_detail`: `description` nêu đường dẫn + ngày + nguồn bằng chứng; `required_keys` = **đúng tập khóa quan sát thật** (khóa mảng dòng hàng + các khóa cấp-hóa-đơn cần thiết). Giữ cổng hợp đồng **mềm** (cảnh báo, không mở circuit breaker) đồng nhất `invoice_envelope`, cho tới khi có quyết định governance nâng cứng.
3. `docs/CHECKLIST-NGHIEM-THU.md` — dưới **U3**, đánh dấu 2 mục; ghi dòng bằng chứng probe (ngày, status, đường dẫn, khóa mảng dòng hàng, kiểu thuế suất — **không** giá trị hóa đơn).
4. `docs/adr/0001-nen-tang-cloudflare.md` — thêm **Amendment** ghi nhận cấu trúc detail đã kiểm chứng (nối tiếp Amendment #5 của query); nêu rõ điều gì quan sát trực tiếp, điều gì còn suy từ đối xứng (vd một trong hai họ normal/sco chưa gọi trực tiếp).
5. `make lint && make test` xanh → commit nhỏ: `docs+chore(u3): kiểm chứng cấu trúc endpoint detail bằng probe thật — gỡ nhãn CHƯA KIỂM CHỨNG`.

> Nếu **chỉ** kiểm chứng được một họ (vd `/query/…/detail`) mà chưa bắt được HĐ máy tính tiền cho `/sco-query/…/detail`: gỡ nhãn **đúng phần đã quan sát**, giữ nhãn `CHƯA KIỂM CHỨNG` cho phần còn lại (ghi rõ "suy từ đối xứng, chưa gọi trực tiếp"), như cách U2 đã làm với `/sco-query/invoices/sold`.

## Definition of Done (probe)

Có kết quả tái lập được, ghi vào checklist/ADR (đã che nhạy cảm): đường dẫn detail + status; tên khóa mảng dòng hàng thật; tên các trường/dòng thật; tên khóa + **kiểu** thuế suất và ví dụ cách mã hoá; tên khóa tiền thuế dòng (nếu có); các khóa cấp-hóa-đơn cho `required_keys`. Không lộ token/mật khẩu/giá trị hóa đơn ở bất kỳ đâu; nếu dùng đường phụ thì credential/`ref` trong `.dev.vars` đã xoá và mã probe tạm đã revert (`git status` sạch). Nếu XANH: nhãn `CHƯA KIỂM CHỨNG` đã gỡ đúng phạm vi quan sát + schema `invoice_detail` cập nhật. Nếu LỆCH/`GEO_BLOCKED`/lỗi: **DỪNG và báo, không tự chốt** — cập nhật giả thuyết/kế hoạch tường minh.

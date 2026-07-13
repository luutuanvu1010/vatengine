# PHIẾU GHI BẰNG CHỨNG — Cấu trúc `detail` (dòng hàng + thuế suất) cho U3

> ✅ **ĐÃ KIỂM CHỨNG (2026-07-13) — probe detail thật đã chạy.** Phiếu này **đã được điền** bằng quan sát network thật (Chrome đăng nhập thật của người dùng, HĐ mua vào thường, dòng thuế suất 8%; không ghi token/giá trị hóa đơn). Kết quả chốt (nguồn chân lý): **ADR-0001 Amendment #6** + `docs/CHECKLIST-NGHIEM-THU.md` (U3). Tóm tắt: đường dẫn `/api/query/invoices/detail`; **4 tham số `nbmst,khhdon,shdon,khmshdon` — KHÔNG tdlap**; khóa mảng dòng hàng **`hdhhdvu`** (giả thuyết đúng); trường dòng `stt/ten/dvtinh/sluong/dgia/thtien/tchat`; **thuế suất HAI trường** `ltsuat` (chuỗi "8%") + `tsuat` (số 0.08); tiền thuế dòng `tthue`. **CÒN GIỮ `CHƯA KIỂM CHỨNG`:** họ `sco` (`/api/sco-query/invoices/detail`, chưa gọi trực tiếp) và mã thuế đặc biệt `KCT`/`KKKNT` (mới quan sát 8%). Các bảng "Giả thuyết → Quan sát thật" bên dưới giữ nguyên làm **lịch sử suy luận trước probe**; cột trạng thái đã được các mục trên thay thế.

> **Đây KHÔNG phải bằng chứng.** Đây là **khung để thu bằng chứng**: một phiếu ghi mà **người trực điền tay** *sau* khi quan sát lưu lượng detail thật. Mọi ô "Giả thuyết" bên dưới bắt nguồn từ `docs/plans/U3-plan.md` (Điểm mơ hồ #3–4) và từ entity **nội bộ** `DongHangHoa` (`KIEN_TRUC_VA_KE_HOACH.md` mục 7.1) — **suy từ domain, KHÔNG từ quan sát**. "Có trong mã cũ / tài liệu / entity nội bộ" **KHÔNG phải bằng chứng** (bài học `:30000`, Hiến pháp mục "Nguyên tắc bằng chứng").
>
> **Trạng thái mặc định mọi hàng = `CHƯA KIỂM CHỨNG`.** Chỉ đổi sang `ĐÃ KIỂM CHỨNG` khi có quan sát tái lập được (ngày + phương pháp), ghi ngay tại hàng đó. `mapDetailLines()` (U3 impl) **chỉ được bám vào các hàng đã `ĐÃ KIỂM CHỨNG`**; hàng còn `CHƯA KIỂM CHỨNG` chỉ được mã hóa như **giả thuyết** trong test (đỏ→xanh theo giả thuyết) và giữ nhãn tương ứng trong `endpoints.ts` + `gdt-contract-schema.json`.
>
> Ngày lập: 2026-07-13. Nguồn phạm vi: `docs/plans/U3-plan.md`.

---

## 0. Ranh giới bằng chứng — cái gì ĐÃ biết, cái gì CHƯA

**ĐÃ KIỂM CHỨNG (fact — không nằm trong phạm vi phiếu này, chỉ nêu để đối chiếu):**

- Ba đường công khai/nghiệp vụ đã xác nhận: `GET /api/captcha`, `POST /api/security-taxpayer/authenticate`.
- Phong bì **query** `/api/(sco-)query/invoices/{purchase,sold}` = `{datas, total, state, time}`; `datas` là mảng (rỗng vẫn hiện diện, `state: null` khi rỗng). *(U2, probe query thật 2026-07-13.)*
- Token gắn qua header `Authorization: Bearer <token>`; bare fetch không kèm header → `401`.
- Egress **T0** (`direct-cf`, thuần Cloudflare) tới GDT **OK** cho captcha/auth/query (ADR-0001 Amendment #3/#4/#5).

**CHƯA KIỂM CHỨNG (toàn bộ nội dung phiếu này) — tuyệt đối không viết như fact ở bất kỳ đâu:**

- Đường dẫn endpoint `detail` (kể cả tiền tố `/api`) và việc nó tồn tại/trả `200`.
- Bộ tham số cần để gọi `detail`.
- Tên **khóa mảng** chứa danh sách dòng hàng trong body detail.
- Tên **từng trường** trên mỗi dòng hàng.
- **Biểu diễn thuế suất** từng dòng (kiểu dữ liệu, tập giá trị, có mã chữ hay không).
- Detail có đi cùng đường egress T0 hay không.

> ⚠️ **Không suy dây chuyền:** phong bì query dùng `datas` **đã verified**, nhưng detail là **endpoint khác** — **KHÔNG** được suy ra body detail cũng dùng `datas` hay cùng hình dạng. Phải quan sát riêng. Tương tự, việc query `{purchase,sold}` đã verified **KHÔNG** kéo theo `detail` "chắc cũng đúng họ endpoint".

---

## 1. Cách thu bằng chứng (không phá captcha, không ghi giá trị thật)

**Ranh giới bảo mật (BẮT BUỘC — `security.md` + Hiến pháp):**

- **KHÔNG** ghi/log/dán **token thô**, mật khẩu, `cvalue`, hay bất kỳ credential nào.
- **KHÔNG** ghi **giá trị hóa đơn thật**: số tiền, đơn giá, tên hàng hóa, tên/MST đối tác, số hóa đơn thật. Phiếu này chỉ cần **HÌNH DẠNG** — *tên khóa*, *kiểu dữ liệu*, và *ví dụ CÁCH mã hóa* (đặc biệt cách mã hóa thuế suất). Mọi giá trị minh họa phải **che** (ví dụ `"<string>"`, `123` → `<number>`, `"1a2b…"`).
- **KHÔNG** tự giải/bypass captcha — người thật nhập.

**Phương pháp A — khuyến nghị (nhẹ, như U2): đọc network của Chrome đã đăng nhập thật.**
Người dùng đăng nhập `hoadondientu.gdt.gov.vn` bằng tài khoản MST hợp pháp của chính họ, mở một hóa đơn để UI tự gọi detail; ta **chỉ đọc** request/response trong tab network (DevTools) và chép lại **tên khóa + kiểu + ví dụ đã che** vào bảng dưới. Không cần credential trong `.dev.vars`, không giữ token trong repo. Đây là cách U2 đã kiểm chứng phong bì query.

**Phương pháp B — dự phòng (như U1-probe): probe tạm qua `wrangler dev --remote`.**
Chỉ dùng nếu A không khả thi. Nạp credential **ephemeral** vào `.dev.vars` (người dùng tự gõ, không đọc giá trị), lấy captcha → người dùng nhập → `authenticate` → dùng token trong bộ nhớ phiên để gọi detail cho **một** hóa đơn; trang kết quả chỉ in **hình dạng đã che** (tên khóa, kiểu), **không** in token/giá trị. Sau khi có quan sát: **xoá credential** khỏi `.dev.vars` và **revert** mã probe (`git status` sạch). Đồng thời ghi nhận `httpStatus` + `egressCountry` để xác nhận T0 cho detail (giá trị B duy nhất so với A: kiểm được egress T0). Xem `docs/prompts/U1-probe-authenticate.md`.

---

## 2. Bảng ghi bằng chứng — ĐƯỜNG DẪN & THAM SỐ gọi `detail`

| # | Mục cần quan sát | Giả thuyết (provenance) | Quan sát thật (điền sau probe — che giá trị) | Trạng thái |
|---|---|---|---|---|
| P1 | Đường dẫn detail HĐ thường | `/api/query/invoices/detail` — suy từ đối xứng họ query, **chưa gọi thật lần nào** (U3-plan #1) | *(status code + path chính xác, có/không tiền tố `/api`)* | ⬜ CHƯA KIỂM CHỨNG |
| P2 | Đường dẫn detail HĐ máy tính tiền (sco) | `/api/sco-query/invoices/detail` — suy từ đối xứng, chưa gọi thật (U3-plan #1) | | ⬜ CHƯA KIỂM CHỨNG |
| P3 | Phương thức + bộ tham số | Giả định `GET` với query params `nbmst, khhdon, khmshdon, shdon, tdlap` (lấy từ `invoice_detail(row)` Python — **là giả định, không phải xác nhận**). Có thể GDT cần thêm/khác (`nban`/`tban`; định dạng `tdlap` có `…T00:00:00`?) (U3-plan #2) | *(method thật; danh sách tham số thật; định dạng `tdlap`)* | ⬜ CHƯA KIỂM CHỨNG |
| P4 | Egress detail (T0) | **Kỳ vọng** cùng host `hoadondientu.gdt.gov.vn` nên cùng đường T0 — nhưng chưa gọi thật (chỉ Phương pháp B kiểm được egress) | *(status; `egressCountry` nếu dùng B; không `GEO_BLOCKED`?)* | ⬜ CHƯA KIỂM CHỨNG |

> Lệch bất kỳ (path khác, 404, cần tham số khác) → **DỪNG, cập nhật `DETAIL_ENDPOINTS`/schema tường minh**, không nới assertion để test xanh (`gdt-adapter.md`).

---

## 3. Bảng ghi bằng chứng — KHÓA MẢNG dòng hàng trong body detail

Body detail chứa danh sách dòng hàng ở **một khóa nào đó** — tên khóa thật **chưa quan sát**. Các ứng viên chỉ để **loại trừ khi probe**, không phải để chọn sẵn.

| # | Khóa ứng viên | Provenance (vì sao chỉ là GUESS) | Trạng thái |
|---|---|---|---|
| L0a | `hdhhdvu` | U3-plan #3 đề xuất: viết tắt "hàng hóa – dịch vụ". **Không có quan sát.** `invoice_detail(row)` (`backend/gdt_client.py`) chỉ trả `r.json()` thô, **không duyệt** mảng dòng hàng → chưa từng log tên khóa này. | ⬜ CHƯA KIỂM CHỨNG |
| L0b | `hdhdvu` | Biến thể chính tả của `hdhhdvu` (bớt một `h`). Thuần khả năng gõ tắt khác; **không nguồn xác nhận.** Liệt kê để probe loại trừ. | ⬜ CHƯA KIỂM CHỨNG |
| L0c | `details` | Khả năng khóa mảng mang tên tiếng Anh chung. **Không nguồn.** Nêu để không bỏ sót trường hợp body detail dùng tên khác hẳn họ query (query dùng `datas` — **KHÔNG suy ra detail cũng vậy**). | ⬜ CHƯA KIỂM CHỨNG |

**Điền sau probe:**

- Tên khóa mảng dòng hàng **thật**: `__________`
- Kiểu: mảng của object? `__________`
- (Nếu khác cả 3 ứng viên → ghi tên thật, cập nhật `mapDetailLines` + schema tường minh.)

---

## 4. Bảng ghi bằng chứng — TỪNG TRƯỜNG trên mỗi dòng hàng

Cột "Tên nội bộ" là tên đề xuất cho `InvoiceLine` (do team đặt), **KHÔNG** phải tên khóa GDT. Cột "Khóa GDT ứng viên" đều là **GUESS**; điền "Khóa GDT thật" từ quan sát.

| # | Ý nghĩa | Tên nội bộ (đề xuất) | Khóa GDT ứng viên (GUESS) | Provenance | Khóa GDT **thật** (che giá trị) | Trạng thái |
|---|---|---|---|---|---|---|
| F1 | Số thứ tự dòng | `stt` | `stt` | Tên trường nội bộ `DongHangHoa` (KIEN_TRUC 7.1). Entity nội bộ ≠ bằng chứng khóa GDT. | | ⬜ CHƯA KIỂM CHỨNG |
| F2 | Tên hàng hóa/dịch vụ | `ten` | `ten` | Tên nội bộ `DongHangHoa`. Trùng tên một số khóa cấp-hóa-đơn trong `FIELD_LABELS` (gdt_client.py) nhưng đây là trường **cấp-dòng**, chưa quan sát trong body detail. | | ⬜ CHƯA KIỂM CHỨNG |
| F3 | Đơn vị tính | `dvtinh` | `dvtinh` | Tên nội bộ `DongHangHoa`. Không có quan sát GDT. | | ⬜ CHƯA KIỂM CHỨNG |
| F4 | Số lượng | `sluong` | `sluong` | Tên nội bộ `DongHangHoa`. Suy từ entity, không từ lưu lượng. | | ⬜ CHƯA KIỂM CHỨNG |
| F5 | Đơn giá | `dgia` | `dgia` | Tên nội bộ `DongHangHoa`. Không có quan sát GDT. | | ⬜ CHƯA KIỂM CHỨNG |
| F6 | Thành tiền dòng (trước thuế) | `thtien` | `thtien` | Tên nội bộ `DongHangHoa`. Không có quan sát GDT. | | ⬜ CHƯA KIỂM CHỨNG |
| F7 | **Thuế suất dòng** | `ltsuat` | `ltsuat` / `tsuat` / `vatrate` | `ltsuat` = tên nội bộ `DongHangHoa`; `tsuat` = biến thể U3-plan #4. **Tên khóa thật lẫn kiểu đều chưa biết.** Xem mục 5. | | ⬜ CHƯA KIỂM CHỨNG |
| F8 | **Tiền thuế dòng** | `tsuatTien` | `tsuat_tien` / `tthue` / `thtien_thue` | `tsuat_tien` = tên nội bộ `DongHangHoa`; `tthue` = biến thể U3-plan #4. Không có quan sát GDT; cũng chưa biết trường này có **luôn hiện diện** không. | | ⬜ CHƯA KIỂM CHỨNG |

**Điền sau probe (một dòng thật, giá trị che):** liệt kê **toàn bộ** tên khóa quan sát được trên một object dòng hàng (kể cả khóa ngoài F1–F8):
`____________________________________________`

---

## 5. Bảng ghi bằng chứng — BIỂU DIỄN THUẾ SUẤT (điểm rủi ro cao nhất)

**Giả thuyết (CHƯA KIỂM CHỨNG):** thuế suất dòng có thể **KHÔNG** phải số thuần mà là **chuỗi mã hóa**, vì hóa đơn điện tử VN cho phép các mục không-phải-phần-trăm. Đây là **suy luận nghiệp vụ hợp lý**, **chưa quan sát** — trình bày như "có thể", không phải "là".

| Khía cạnh cần quan sát | Giả thuyết (che) | Quan sát thật (điền sau probe) | Trạng thái |
|---|---|---|---|
| Kiểu dữ liệu trường thuế suất | `number` hay `string`? | | ⬜ CHƯA KIỂM CHỨNG |
| Có dấu `%`? | `"10%"` vs `10` vs `0.1`? | | ⬜ CHƯA KIỂM CHỨNG |
| Có mã chữ? | có thể xuất hiện `"KCT"` (không chịu thuế), `"KKKNT"` (không kê khai/nộp thuế), `"0%"`, `"KHAC"` | | ⬜ CHƯA KIỂM CHỨNG |
| Tập giá trị thật quan sát được | *(chép các giá trị mã hóa thật — đây là mã loại thuế, **không** phải giá trị tiền nhạy cảm; vẫn tránh kèm số tiền)* | | ⬜ CHƯA KIỂM CHỨNG |

**Hệ quả ràng buộc cho `mapDetailLines` (U3):** nếu giả thuyết đúng, `mapDetailLines` **PHẢI giữ NGUYÊN giá trị gốc (raw)** của thuế suất, **KHÔNG ép sang `number`** — ép kiểu sẽ làm mất mã chữ và nhầm `"0%"` (chịu thuế suất 0) với `"KCT"` (không chịu thuế), hai trường hợp **khác bản chất kê khai**. Việc chuẩn hóa thành số + đại diện mã là **quyết định U4/U5**, **không** thuộc U3. *(Ràng buộc này đứng vững kể cả trước khi biết tên khóa thật, vì nó chỉ nói "đừng làm mất dữ liệu".)*

---

## 6. Sau khi điền xong — cổng gỡ nhãn

Chỉ khi các hàng liên quan chuyển `ĐÃ KIỂM CHỨNG` (kèm ngày + phương pháp A/B):

1. `packages/gdt-client/src/endpoints.ts` — gỡ nhãn `CHƯA KIỂM CHỨNG` khỏi `DETAIL_ENDPOINTS`, thay bằng `// ĐÃ KIỂM CHỨNG (<ngày>): detail probe thật, <method A/B>, egress <country nếu B>. (Không ghi token/giá trị.)`.
2. `packages/gdt-client/gdt-contract-schema.json` — chốt entry `invoice_detail` (`required_keys` = khóa mảng dòng hàng + các khóa cấp-hóa-đơn thật quan sát được) từ trạng thái mềm sang xác nhận.
3. `packages/gdt-client/src/detail.ts` — `mapDetailLines` bám khóa **thật** đã điền (mục 3–5), không bám giả thuyết.
4. `packages/gdt-client/test/contract/detail.contract.test.ts` — cập nhật `required_keys` khớp quan sát; giữ `it.skipIf(!TOKEN)` (đọc env qua `globalThis.process`).
5. `docs/CHECKLIST-NGHIEM-THU.md` (U3) — ghi dòng bằng chứng (ngày, method, status, các khóa **thật**, cách mã hóa thuế suất; **không** token/giá trị hóa đơn).
6. Nếu Phương pháp B: cân nhắc Amendment ADR-0001 xác nhận T0 cho detail; xoá credential `.dev.vars` + revert probe (`git status` sạch).

> Lệch giả thuyết ở **bất kỳ** hàng nào (tên khóa khác, thuế suất là số/chuỗi khác dự đoán, thiếu trường) → **DỪNG, cập nhật tường minh**, **không** nới assertion, **không** tự chốt (`gdt-adapter.md` + Hiến pháp "Khi gặp mơ hồ").

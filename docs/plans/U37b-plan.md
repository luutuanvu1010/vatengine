# U37b — Phát hành gói hóa đơn gốc cho MỘT khách hàng, chia sẻ qua link công khai

> **Trạng thái:** 🟢 **ĐÃ DUYỆT (QA1) 2026-07-29** — 5 điểm mơ hồ ở §8 đã chốt, nâng thành
> QĐ-B7…QĐ-B11 ở §2. Sẵn sàng thực thi theo `docs/plans/U37b-prompt-dieu-phoi.md`.
> Gói 0 đã hoàn thành **trước khi** có kế hoạch này (xem §4, ghi chú trung thực).
>
> **Kế hoạch chi tiết phần còn lại (Gói 4c → 7): `docs/plans/U37b-plan-4c-7.md`** — gộp bốn gói
> cuối thành một kế hoạch liền mạch vì chúng khớp nối chặt với nhau.
>
> **Bàn giao phiên gần nhất: `docs/plans/HANDOFF-phien-2026-07-29-U37b.md`** — đọc file đó trước
> nếu bạn là phiên mới. Xong Gói 0–3 + 4a; tiếp theo là Gói 4b.
>
> Đặc tả nền: `docs/plans/U37-HO-SO-KHOI-DONG-xuat-hoa-don-theo-mau.md` — §4.5/§4.7 (bằng chứng
> endpoint + nội dung gói GDT), §4.6/§4.8 (số đo production), §8 (hướng thiết kế đã duyệt).
> Bàn giao U37a: `docs/plans/HANDOFF-phien-2026-07-28-U37a.md`.

---

## 1. Vì sao làm

Doanh nghiệp cần **gửi lại hóa đơn đã xuất cho một khách hàng cụ thể** — khách hỏi "cho xin lại
hóa đơn tháng 6", kế toán phải vào cổng thuế tải từng tờ rồi gửi tay. U37a đã dựng xong đường
**tải hồ sơ gốc từ GDT** (XML có chữ ký số + bản thể hiện HTML do GDT dựng sẵn) và kho lưu bất
biến. U37b nối phần còn lại: **chọn khách hàng → gói lại → phát một link chia sẻ được**.

Người nhận mở link tải về mà **không cần tài khoản**; link sống **khoảng 30 ngày** rồi tự hết hạn.

## 2. Quyết định đã chốt (không mở lại khi code)

| # | Quyết định | Nguồn |
|---|---|---|
| QĐ-B1 | **Chỉ chiều BÁN RA** (`chieu='sold'`). Mua vào ngoài phạm vi | Chủ dự án 2026-07-29 |
| QĐ-B2 | **Bắt buộc chọn MỘT khách hàng doanh nghiệp.** Không cho xuất "cả tháng" | Chủ dự án 2026-07-29 |
| QĐ-B3 | **MST hoặc tên trống ⇒ chặn/ẩn nút** | Chủ dự án 2026-07-29 |
| QĐ-B4 | Nút mở khi đã **CHỌN** từ danh sách, **không** phải khi ô tìm có chữ | Đề xuất được duyệt |
| QĐ-B5 | **Không có bộ lọc riêng cho nút xuất** — dùng CHUNG bộ lọc trang Danh sách hóa đơn | Chủ dự án 2026-07-29 |
| QĐ-B6 | Tìm **live theo cả tên và MST**; danh sách nhỏ ⇒ lọc trên máy khách | Chủ dự án 2026-07-29 |
| QĐ-5 | Tên miền công khai **`docs.tourdao.vn`**, KHÔNG dùng `r2.dev` | Hồ sơ §3 |
| QĐ-6 | ~~Tự xóa sau ~30 ngày~~ → **SỬA 2026-07-29: ~1 TUẦN (7 ngày)** bằng R2 Lifecycle theo prefix | Hồ sơ §3, chủ dự án sửa 29/07 |
| QĐ-7 | **Cảnh báo rủi ro link công khai có checkbox xác nhận** + nút thu hồi + audit log | Hồ sơ §3 |
| QĐ-3 | Trường rỗng để trống — không bịa | Hồ sơ §3 |
| QĐ-B7 | **`vat-api` đóng gói ZIP** (không phải sync-worker) — worker giữ đơn nhiệm là tải hồ sơ gốc | Chủ dự án 2026-07-29 |
| QĐ-B8 | **Tiến trình đếm trực tiếp từ `tep_hoa_don_goc`** — không thêm cột đếm, không tạo nguồn sự thật thứ hai | Chủ dự án 2026-07-29 |
| QĐ-B9 | **Khoảng ngày trống ⇒ CHẶN.** Không cho phát gói phủ toàn bộ lịch sử | Chủ dự án 2026-07-29 |
| QĐ-B10 | Tên file tải về `hoa-don-<tên khách rút gọn>-<tuNgay>-<denNgay>.zip` qua `contentDisposition`. Tên khách **KHÔNG** được vào khóa R2 | Chủ dự án 2026-07-29 |
| QĐ-B11 | Cảnh báo QĐ-7 là **khối inline cạnh nút**, không dựng primitive `Modal` | Chủ dự án 2026-07-29 |

**Quyết định cũ KHÔNG áp dụng:** QĐ-1/2/4/8 đã vô hiệu (hồ sơ §3). Đặc biệt **QĐ-8 (in tuyên bố
"không thay thế hóa đơn gốc") là SAI SỰ THẬT** ở U37b — file phát ra **chính là** bản gốc có chữ
ký số.

## 3. Phạm vi

**Trong phạm vi:** chọn khách hàng bằng ô tìm live; phát hành gói ZIP chứa hồ sơ gốc của các hóa
đơn bán ra cho khách đó trong khoảng lọc; lưu gói lên bucket công khai có hạn 30 ngày; trả link;
thu hồi link; audit log; giao diện nút + cảnh báo.

**NGOÀI phạm vi:** chiều mua vào; dựng PDF (→ U38, và gần như không còn lý do vì GDT kèm sẵn
`invoice.html`); hạn mức 10 lượt tải/tháng (backlog `[2026-07-16]`, phụ thuộc lớp thương mại);
sửa drift Registry↔FilterBar cho `nbmst`/`nmmst` (xem hồ sơ §8 mục 8).

## 4. Thiết kế theo gói

### Gói 0 — Endpoint danh sách khách hàng ✅ **ĐÃ XONG** (`b5f8e35`)

> ⚠️ **Ghi chú trung thực:** gói này được thực thi **TRƯỚC KHI** có kế hoạch này — đi thẳng từ
> hồ sơ §8 sang code, bỏ qua cổng QA1. Sai quy trình (`/plan-unit` → `/write-prompt` →
> `/start-unit`). Không cuộn lại vì nằm đúng phạm vi §8 đã duyệt, đã qua `make lint`/`make test`
> và có 12 test canh. Ghi lại để không lặp lại cách làm này ở các gói sau.

`GET /invoices/khach-hang` → `{ items: [{nmmst, nmten, soHoaDon}], biCatBot }`.
`packages/query/src/khachHang.ts` gộp theo MST, chỉ chiều bán ra, bỏ hóa đơn thiếu MST **hoặc**
thiếu tên, sắp theo tên, trần 2.000 và báo `biCatBot` khi cắt.
Đính chính đã ghi: bộ lọc `nmmst` **vốn đã có sẵn** trên FilterBar, không phải làm mới.

### Gói 1 — Ô tìm live chọn khách hàng (`apps/web`)

- Primitive **mới** `ComboBox` trong `components/ui/primitives.tsx` (thư viện chưa có; `ui.md:21`
  cấm tô kiểu nội tuyến trong `features/`).
- Thay ô `Field` nhập MST thô hiện tại (`FilterBar.tsx:137-146`) khi `chieu !== "purchase"`.
- Gõ khớp **cả tên lẫn MST**, không phân biệt hoa/thường và **bỏ dấu** (gõ "cong ty" ra "CÔNG TY").
- Hiển thị `Tên — MST · N hóa đơn`; chọn xong ràng `nmmst` **chính xác** vào bộ lọc.
- Có nút xóa lựa chọn (đưa `nmmst` về `undefined`).
- Bàn phím: ↑/↓ di chuyển, Enter chọn, Esc đóng. Ô nhập mang `role="combobox"` +
  `aria-expanded`/`aria-controls`, có nhãn.
  **ĐÍNH CHÍNH 2026-07-29 sau khi hiện thực:** panel gợi ý KHÔNG dùng `role="listbox"`/`option`.
  Mẫu combobox của ARIA xung đột với 5 quy tắc a11y của Biome (`useSemanticElements`,
  `noNoninteractiveElementToInteractiveRole`, `useFocusableInteractive`…) vốn giả định
  `<select>` — mà `<select>` không lọc live được. Chọn `<ul>`/`<li>` + `<button>` thật:
  vẫn tiếp cận được bằng bàn phím và trình đọc màn hình, và KHÔNG phải tắt 5 quy tắc a11y
  trong một primitive dùng chung. Đổi câu chữ tiêu chí thay vì lệch âm thầm.
- Bốn trạng thái (`ui.md:22`): rảnh / đang tải / rỗng ("chưa có khách hàng nào có MST") / lỗi.
- `biCatBot = true` ⇒ hiện dòng "còn nữa, hãy gõ thêm để thu hẹp" — **không cắt im lặng**.

### Gói 2 — Bảng `goi_chia_se` + migration

Cột: `id`, `tenant_id`, `khoa_r2`, `nmmst`, `tu_ngay`, `den_ngay`, `so_hoa_don`, `kich_thuoc`,
`nguoi_tao`, `tao_luc`, `het_han_luc`, `trang_thai` (`dang_tao|san_sang|loi|da_thu_hoi`), `ma_loi`.

**Ba cạm bẫy BẮT BUỘC xử lý** (đều đã cắn dự án này rồi):
1. `FORCE ROW LEVEL SECURITY` — `drizzle-kit` chỉ sinh `ENABLE`, phải viết tay.
2. Khối `DO $$ … GRANT SELECT,INSERT,UPDATE … TO vat_app … RAISE WARNING … END $$` **trong chính
   migration** — quên là lần thứ **ba**.
3. **Bẫy `_journal.json`:** mốc `when` của `idx 15..19` nằm ở **tương lai (02/08/2026)**. Migration
   sinh mới trước mốc đó sẽ bị `drizzle-kit migrate` **âm thầm bỏ qua** trong khi vẫn in
   `[✓] migrations applied successfully!`. Đặt `when = <mục trước>.when + 60000` rồi hậu kiểm
   bằng `node scripts/hau-kiem-bang.mjs goi_chia_se`.

### Gói 3 — Hạ tầng bucket công khai *(cần chủ dự án thao tác)*

- Tạo bucket **`vat-chia-se`** (hiện chỉ có `vat-raw`).
- Gắn custom domain **`docs.tourdao.vn`**; **KHÔNG bật `r2.dev`** — tài liệu Cloudflare ghi rõ:
  quên tắt là vẫn lộ dù đã gắn tên miền.
- Lifecycle: **một** rule theo prefix `goi-hoa-don/`, `Expiration: { Days: 30 }` (trần 1000
  rule/bucket ⇒ không tạo rule mỗi file).
- Thêm binding R2 thứ hai cho worker phát hành.

### Gói 4 — Phát hành gói

- Endpoint tạo gói: nhận `nmmst` + khoảng ngày, **kiểm quyền tenant tại thời điểm tạo** (file công
  khai nằm ngoài RLS/JWT — sau đó không còn cửa nào chặn).
- 🔴 **`ref` PHẢI dựng từ hàng `hoa_don` đã lọc `tenant_id` của phiên** — `runHoSoGocJob` tin thẳng
  `msg.ref`, không tra lại (phát hiện ở review bảo mật U37a).
- Enqueue message `kind:"hoso"` cho hóa đơn **chưa có** trong kho; hóa đơn đã có thì `daCo` chặn,
  không tốn request GDT.
- Đóng gói **PHẲNG**, tài nguyên tĩnh dùng chung **một bộ** (`invoice.html` tham chiếu tên phẳng,
  không tiền tố ⇒ **không phải sửa một ký tự nào** trong HTML):
  ```
  details.js  viewinvoice-bg.jpg  sign-check.jpg
  <khhdon>-<shdon>.html   <khhdon>-<shdon>.xml
  bao-cao.txt
  ```
- ⚠️ Hai hóa đơn khác `nbmst` vẫn có thể trùng `<khhdon>-<shdon>`; `zipStream.ts` có `uniqueName`
  thêm hậu tố — **phải kiểm lại tên sinh ra vẫn ghép đúng cặp `.xml`/`.html`**.
- **Không** đi qua `apps/api/src/storage.ts` (helper đó đọc trọn file vào RAM).
- Khóa R2: `goi-hoa-don/<YYYY-MM>/<token ngẫu nhiên ≥128-bit base32url>.zip`. **Tuyệt đối không**
  nhúng MST, tên doanh nghiệp, khoảng ngày hay `tenant_id` — khóa **là** thứ duy nhất bảo vệ file.
  Tên file thân thiện đặt qua `contentDisposition` lúc `put()`.
- **Khâu kiểm tra (yêu cầu gốc số 3):** đối chiếu **số lượng** XML trong gói với số hóa đơn thỏa
  bộ lọc; hóa đơn GDT từ chối → vào `bao-cao.txt`; **0 hóa đơn thành công ⇒ KHÔNG phát hành link**.

### Gói 5 — Thu hồi + audit

- Nút **thu hồi ngay** = xóa object R2 + `trang_thai='da_thu_hoi'`.
- `audit_log` cho **phát hành** và **thu hồi**, `chiTiet` qua `maskSensitive()`, ghi trong
  `withTenant` như mọi call-site hiện có.

### Gói 6 — Giao diện

- Nút trong `hanhDongPhu` của `FilterBar` (`InvoicesPage.tsx:130-150`), cạnh `InvoiceExportButtons`.
- **Điều kiện mở:** đã chọn khách hàng (QĐ-B4) **và** `chieu === "sold"`. Chưa đủ ⇒ nút mờ + lý do.
- Cảnh báo QĐ-7 **có checkbox xác nhận** trước khi phát link.
- Quy mô thật chỉ vài giây (§4.8) ⇒ trạng thái gọn: "đang chuẩn bị…" → hiện link. Không cần thanh
  phần trăm.
- Nhãn khai trong Registry, không gõ chuỗi rời.

### Gói 7 — Tài liệu

`docs/06-BINDING_MAP.md` (đọc TỪ MÃ, không chép từ kế hoạch); hồ sơ U37; `U37b-tien-do.md`.

## 5. Tiêu chí nghiệm thu

1. `make lint && make test` xanh; coverage không tụt dưới 80%.
2. Test cách ly tenant cho `goi_chia_se` (A không đọc được của B).
3. `node scripts/hau-kiem-bang.mjs goi_chia_se` → đạt toàn bộ (bảng, RLS ENABLE **và** FORCE,
   policy, `vat_app` có S/I/U và KHÔNG có DELETE).
4. Test: chưa chọn khách hàng ⇒ nút **không** bấm được; ô tìm có chữ nhưng chưa chọn ⇒ vẫn **không**
   bấm được (QĐ-B4).
5. Test: gói ZIP có đúng `2×N + 3 + 1` mục và **một** bộ tài nguyên tĩnh.
6. Test: 0 hóa đơn thành công ⇒ không phát hành link.
7. **Nghiệm thu thật trên production:** chọn một khách hàng có hóa đơn → bấm xuất → mở link ở cửa
   sổ ẩn danh (không đăng nhập) tải được → giải nén, **mở `invoice.html` bằng trình duyệt thấy
   đúng tờ hóa đơn** → đối chiếu số hóa đơn/MST/tổng tiền khớp danh sách → thu hồi → link trả 404.
8. `wrangler r2 bucket lifecycle list vat-chia-se` cho thấy đúng một rule 30 ngày theo prefix;
   `r2.dev` **tắt**.
9. Review chéo: `dod-auditor` **+ `security-reviewer`** (bắt buộc — phát hành link công khai không
   cần đăng nhập, dữ liệu doanh nghiệp/đối tác, NĐ 13/2023).

## 6. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| **Pháp lý** — link công khai lộ dữ liệu doanh nghiệp + đối tác | Khóa ngẫu nhiên ≥128-bit, thu hồi ngay, audit log, checkbox xác nhận |
| **Bẫy `r2.dev`** | Không bật; lỡ bật để thử thì phải tắt |
| **Bẫy GRANT / FORCE / journal `when`** | Gói 2, cả ba đều có bước hậu kiểm |
| **`ref` dựng sai tenant** | Gói 4; FK ghép `(tenant_id, hoa_don_id)` là lưới cuối, không thay việc dựng đúng |
| Quy mô | **Không còn rủi ro** khi giữ QĐ-B2: lớn nhất 56 hóa đơn ≈ 28 giây (§4.8) |

## 7. Trạng thái duyệt

- [x] Chốt 5 điểm mơ hồ ở §8 — chủ dự án trả lời 2026-07-29 (thành QĐ-B7…QĐ-B11 ở §2)
- [x] Chủ dự án duyệt kế hoạch (QA1) — ngầm định qua việc chốt đủ 5 điểm chặn
- [x] Sinh `U37b-prompt-dieu-phoi.md`

## 8. Năm điểm mơ hồ — ĐÃ CHỐT 2026-07-29

Nêu theo Hiến pháp §"Khi gặp mơ hồ" trước khi code; chủ dự án đã trả lời đủ. Chép lên §2 thành
QĐ-B7…QĐ-B11 để chúng là **quyết định**, không còn là câu hỏi.

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Ai đóng gói ZIP, lúc nào? | **`vat-api`** dựng khi client hỏi lại và thấy đã đủ (QĐ-B7) |
| 2 | Theo dõi tiến trình bằng gì? | Đếm trực tiếp từ **`tep_hoa_don_goc`** (QĐ-B8) |
| 3 | Khoảng ngày để trống thì sao? | **CHẶN** — không phát gói phủ toàn bộ lịch sử (QĐ-B9) |
| 4 | Tên file ZIP tải về | `hoa-don-<khách>-<từ>-<đến>.zip`; tên khách KHÔNG vào khóa R2 (QĐ-B10) |
| 5 | Cảnh báo QĐ-7 đặt ở đâu? | **Khối inline** cạnh nút, không dựng `Modal` (QĐ-B11) |

**Hệ quả QĐ-B9 lên Gói 6:** điều kiện mở nút thành **ba** vế — đã chọn khách hàng **và**
`chieu === "sold"` **và** có đủ `tuNgay`+`denNgay`. Thiếu vế nào thì nút mờ kèm đúng lý do của
vế đó (đừng gộp một thông báo chung chung).

## 9. Liên quan

- `docs/plans/U37-HO-SO-KHOI-DONG-xuat-hoa-don-theo-mau.md` — bằng chứng §4.5–§4.8, thiết kế §8
- `docs/plans/HANDOFF-phien-2026-07-28-U37a.md` — U37a đã làm gì, cạm bẫy đã biết
- `.claude/rules/ui.md`, `security.md`, `multi-tenant.md`, `deploy.md`
- `scripts/hau-kiem-bang.mjs` — hậu kiểm sau migrate

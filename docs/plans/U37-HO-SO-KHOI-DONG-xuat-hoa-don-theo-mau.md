# U37 — Hồ sơ khởi động: Module XUẤT HÓA ĐƠN THEO MẪU CHUẨN

> **Câu lệnh gọi ở phiên sau:** *"xây dựng module xuất hoá đơn"* → mở file này trước, rồi chạy `/plan-unit U37` (nếu đã đủ dữ kiện) hoặc làm **Bước R** ở §7 trước (nghiên cứu) rồi mới lập kế hoạch.

| | |
|---|---|
| **Mã đơn vị** | U37 (U36 là số lớn nhất đang dùng, xác nhận `ls docs/plans/` 2026-07-28) |
| **Trạng thái** | 🟡 **HỒ SƠ NGHIÊN CỨU — CHƯA PHẢI KẾ HOẠCH.** Chưa qua `/plan-unit`, chưa có test, chưa có code. |
| **Mức ưu tiên** | **1 (cao nhất trong backlog)** — chỉ định trực tiếp của chủ dự án |
| **Nguồn gốc** | `docs/BACKLOG-y-tuong-va-de-xuat.md`, mục `[2026-07-28] ⭐ ƯU TIÊN 1 — Xuất hóa đơn theo MẪU CHUẨN` |
| **Ngày lập hồ sơ** | 2026-07-28 (3 vòng hỏi–đáp với chủ dự án trong cùng ngày) |
| **Review bắt buộc khi làm** | `dod-auditor` **+ `security-reviewer`** (đụng: đường tải file đầu tiên của hệ thống, phát hành link công khai không cần đăng nhập, dữ liệu doanh nghiệp/đối tác) |

---

## 1. Mục tiêu — nói bằng ngôn ngữ người dùng

Người dùng đang xem danh sách hóa đơn **bán ra** của mình. Cạnh nút **Xuất Excel** có thêm nút **Xuất hóa đơn**. Bấm vào, hệ thống dựng ra từng tờ hóa đơn **trông giống mẫu chuẩn** (có logo công ty, đủ thông tin bên bán – bên mua, bảng hàng hóa), gói tất cả vào **một file ZIP**, rồi đưa lại **một đường link chia sẻ được** — gửi qua email/Zalo/WhatsApp, người nhận mở ra tải được mà không cần tài khoản. Link sống **khoảng 30 ngày** rồi tự hết hạn.

Mục đích của file: **hỗ trợ tổng hợp và đối soát**. **Không thay thế hóa đơn gốc.**

---

## 2. Ba yêu cầu gốc (nguyên văn chủ dự án, 2026-07-28)

1. Nút **"Xuất hóa đơn"** đặt **cạnh nút Xuất Excel**; file phải **đúng mẫu hóa đơn GTGT của GDT** — gồm **logo**, thông tin người bán, thông tin cần thiết của người mua. Mẫu tham chiếu: `docs/doi_chieu_data/hoa_don_mau.pdf`.
2. File tải về ở **định dạng nén (ZIP)**, lưu trên **R2**, giữ **1 tháng rồi tự xóa**; đặt **công khai chỉ-đọc** để chia sẻ qua **link / email / Zalo / WhatsApp** — người nhận **đọc + tải được**.
3. Có **khâu kiểm tra** đảm bảo hóa đơn tạo ra **đạt chuẩn, không sai, không thiếu thông tin**.

---

## 3. Tám quyết định ĐÃ CHỐT (không mở lại khi lập kế hoạch)

| # | Quyết định | Ghi chú ràng buộc |
|---|---|---|
| QĐ-1 | **Chỉ làm hóa đơn BÁN RA** (`chieu = 'sold'`) | Hóa đơn mua vào không có đường lấy logo người bán → ngoài phạm vi |
| QĐ-2 | **Định dạng bên trong ZIP = PDF** | Mục đích: lưu trữ nội bộ + thống kê cơ bản, không đua độ đẹp với bản gốc nhà cung cấp |
| QĐ-3 | **Trường rỗng thì để trống** — không bịa, không suy diễn | Lấy tối đa trường người mua có thật trong dữ liệu đã đồng bộ |
| QĐ-4 | **Logo do người dùng TỰ TẢI LÊN** qua *Cài đặt chung → Thông tin doanh nghiệp* | Không lấy từ GDT (xem §4.1 — bằng chứng ngược lại) |
| QĐ-5 | **Tên miền công khai = `docs.tourdao.vn`** (custom domain, KHÔNG dùng `r2.dev`) | `tourdao.vn` đã nằm trên Cloudflare |
| QĐ-6 | **Tự xóa sau ~30 ngày** bằng R2 Object Lifecycle Rule theo prefix | Không tự viết cron |
| QĐ-7 | **Cảnh báo rủi ro link công khai** trước khi tạo link (checkbox xác nhận, không phải dòng chữ mờ) | Kèm nút **thu hồi ngay** + audit log |
| QĐ-8 | **In tuyên bố trên CHÍNH bản PDF** (chân mỗi trang): *"Tài liệu này hỗ trợ tổng hợp và đối soát thông tin. Không thay thế hóa đơn điện tử gốc (bản XML có chữ ký số) do người bán phát hành."* | Đặt chân trang để không mất khi tách lẻ file |

---

## 4. Bằng chứng ĐÃ KIỂM CHỨNG (2026-07-28) — dùng lại, không kiểm lại

### 4.1 ⚠️ GDT **không** phát hành PDF có logo — giả định ban đầu đã bị bác bỏ

Giả định ban đầu của chủ dự án: *"Hoá đơn tải về từ trang GDT vẫn có logo ⇒ logo được lưu sẵn trong CSDL của GDT."* **Bốn bằng chứng độc lập nói ngược lại:**

1. **Chân trang mọi hóa đơn trong file mẫu** (`pdftotext -f 1 -l 1 docs/doi_chieu_data/hoa_don_mau.pdf`, trích nguyên văn):
   > *"Đơn vị cung cấp dịch vụ Hóa đơn điện tử: Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel), MST: 0100109106. Tra cứu hóa đơn điện tử tại Website: https://vinvoice.viettel.vn/utilities/invoice-search. **Mã số bí mật**: 5666OK7MZX1R3CK."*

   Lặp lại ở mọi trang kiểm tra (dòng 87, 176, 265, 354, 443…), mỗi hóa đơn một "Mã số bí mật" riêng. **"Mã số bí mật" là khóa tra cứu của NHÀ CUNG CẤP, không phải trường của GDT.**
2. **Metadata PDF** (`pdfinfo`): `Producer: iText® 5.5.13`, **152 trang**, tạo 01/07/2026 14:54 — kết xuất hàng loạt từ hệ thống nhà cung cấp.
3. **Ảnh nhúng** (`pdfimages -list`): đúng **3 ảnh/trang**, kích thước **giống hệt nhau ở mọi trang** (179×364, 512×106, 130×54) — logo/con dấu của **một** người bán, do hệ thống Viettel chèn lúc dựng bản thể hiện.
4. **Adapter của ta biết gì về GDT:** `packages/gdt-client/src/endpoints.ts` + `detail.ts` chỉ có `/query/invoices/{purchase,sold}`, `/sco-query/...`, `/…/invoices/detail` (4 tham số định danh) — **không có endpoint PDF/logo nào**.
5. **Tín hiệu đối thủ:** `KHAO_SAT_TINH_NANG_NIBOT.md:31` — *"với PDF gốc có logo/màu, NIBOT chào dịch vụ **DOLAGO** để tải từ nhà cung cấp"*. Nếu GDT phát PDF có logo, NIBOT đã không phải bán thêm dịch vụ bên thứ ba.

⇒ **Kết luận làm việc:** logo nằm ở **nhà cung cấp dịch vụ HĐĐT của người bán** (Viettel/VNPT/MISA…), không ở kho GDT. **Bài học:** đây đúng dạng bẫy Hiến pháp cảnh báo (`:30000`) — một tiền đề chưa kiểm chứng suýt định hình cả tính năng ưu tiên 1.

### 4.2 Bộ khung kết xuất và hạ tầng đã có sẵn (tái dùng, đừng viết lại)

| Có sẵn | Vị trí | Dùng vào việc gì |
|---|---|---|
| Binding R2 `RAW` → bucket `vat-raw` | `apps/api/wrangler.jsonc:42-44` | Kho **nội bộ** (logo, file kết xuất xlsx/csv hiện tại) |
| Nén ZIP | `packages/export/src/zipStream.ts` | Gói nhiều PDF thành một file |
| Renderer một-hóa-đơn-một-file (XML/HTML, U22) | `packages/export/src/invoiceDoc.ts` | **Điểm bám gần nhất** cho "một hóa đơn = một trang mẫu" |
| Chuẩn hóa 3 trường thuế (U35b) | `packages/export/src/columns.ts` | Nguồn logic `tsuat`→`%`, tự tính `tsuatTien`, chuẩn hóa `tongSauThue` |
| Nút xuất hiện có | `apps/web/src/features/invoices/InvoiceExportButtons.tsx` | Chỗ đặt nút "Xuất hóa đơn" |
| Màn Cài đặt | `apps/web/src/features/settings/SettingsPage.tsx` | Chỗ đặt ô tải logo |

### 4.3 R2 public + lifecycle — tài liệu chính thức Cloudflare (đọc 2026-07-28)

Nguồn: `developers.cloudflare.com/r2/buckets/public-buckets/` và `.../object-lifecycles/`.

- **Hai cách công khai:** (i) **custom domain** — bắt buộc cho production, mở được WAF/Cache/Bot Management/Zero Trust Access/WAF Token Auth; (ii) **`r2.dev`** — tài liệu ghi *"intended for non-production traffic… rate-limited and should only be used for development purposes"* ⇒ **không dùng cho khách**.
- **Điều kiện custom domain:** *"The domain being used must have been added as a zone in the same account as the R2 bucket."* Cloudflare tự tạo CNAME khi kết nối; trạng thái **Initializing → Active** sau vài phút.
- **⚠️ Bẫy tài liệu ghi rõ:** nếu từng bật `r2.dev` để thử thì **phải tắt** — *"If you do not disable public access, your bucket will remain publicly available through your r2.dev subdomain"*. Tắt tên miền chính mà quên `r2.dev` = **vẫn lộ**.
- **Điểm an toàn sẵn có:** *"public buckets do not let you list the bucket contents at the root"* ⇒ không ai liệt kê được toàn bộ file. **Hệ quả: an toàn hoàn toàn phụ thuộc vào khóa object đoán-không-ra.**
- **Lifecycle:** `npx wrangler r2 bucket lifecycle add <bucket>` với `Expiration: { Days: 30 }` theo prefix, hoặc `lifecycle set` từ file JSON. **Độ chính xác:** *"Objects will typically be removed from a bucket within 24 hours of the `x-amz-expiration` value"* ⇒ **UI phải nói "khoảng 30 ngày"**, không hứa mốc chính xác. Trần **1000 rule/bucket** ⇒ **một rule theo prefix chung**, không tạo rule mỗi file.

**Quy tắc đặt tên object (là YÊU CẦU BẢO MẬT, không phải thẩm mỹ):**

```
goi-hoa-don/<YYYY-MM>/<token-ngẫu-nhiên-≥128-bit-base32url>.zip
```

- Tiền tố `<YYYY-MM>` = tháng phát hành → khớp thẳng lifecycle rule theo prefix, tiện dọn/thống kê.
- **TUYỆT ĐỐI KHÔNG** nhúng MST, tên doanh nghiệp, khoảng ngày, số hóa đơn hay `tenant_id` vào khóa — khóa **là** thứ duy nhất bảo vệ file.
- Tên file thân thiện khi tải về đặt qua metadata `contentDisposition` lúc `put()` — **không** đặt vào khóa.
- Ánh xạ khóa ↔ (tenant, kỳ, người tạo, `het_han_luc`) lưu ở bảng Postgres có `tenant_id` + audit log.
- **Bucket RIÊNG** (vd `vat-chia-se`) gắn `docs.tourdao.vn`; **không** đặt chung `vat-raw`. URL cuối: `https://docs.tourdao.vn/goi-hoa-don/2026-07/<token>.zip`.

### 4.4 Khoảng trống dữ liệu và năng lực — đo thật, không suy đoán

| Phát hiện | Bằng chứng | Hệ quả |
|---|---|---|
| Bảng `tenants` **không có** cột `logo`, **cũng không có** địa chỉ / điện thoại / fax | `packages/db/src/schema/tenants.ts` — chỉ `id, ten, mst, trang_thai, goi_dich_vu, ghi_chu, ban_quyen, ngay_tao` | Cần **migration**. Mẫu hóa đơn cần địa chỉ+ĐT+fax người bán ⇒ đơn vị này thực chất là **"hồ sơ doanh nghiệp đầy đủ để in hóa đơn"**, không phải chỉ thêm một trường logo. **Gom một lượt** để tránh migration hai lần. |
| `PATCH /me` chỉ cho `quan_tri` sửa `ten`/`ghi_chu`, schema `strict` | `apps/api/src/routes/me.ts:22-28` | Phải mở rộng tường minh |
| **Dự án CHƯA TỪNG có luồng tải file lên** | `grep "multipart/form-data\|formData()" apps/api/src` = **0 kết quả** | Đây là **đường upload đầu tiên** của hệ thống ⇒ bề mặt tấn công mới ⇒ **`security-reviewer` bắt buộc** |
| Bảng `hoa_don` chỉ có cột người mua `nmmst` + `nmten` | `packages/db/src/schema/hoaDon.ts:30-31` | Địa chỉ người mua, họ tên người nhận, hình thức thanh toán, đơn vị tiền tệ, MCCQT… nếu có thì nằm trong `raw_json` — **phải rà thật** (xem §5, việc R1) |
| `invoiceDoc.ts` **chưa** hưởng sửa 3 trường thuế của U35b | Backlog mục `[2026-07-27]` | Nếu bám `invoiceDoc.ts` mà không vá trước, bản PDF sẽ in `0.08` thay vì `8%` và có thể **trống Tiền thuế** |

---

## 5. CHƯA KIỂM CHỨNG — phải làm xong trước khi chốt kế hoạch (Bước R)

> Theo *Nguyên tắc bằng chứng* (`CLAUDE.md`): không mục nào dưới đây được coi là "đã chốt" cho tới khi có phép kiểm tái lập được **kèm ngày và kết quả**.

- **R1 — Bản đồ trường dữ liệu.** Rà `raw_json` thật trên production, lập bảng **"trường trong mẫu ↔ khóa GDT ↔ tỷ lệ có dữ liệu"** cho hóa đơn `chieu='sold'`. Đây là **việc đầu tiên** — template không thiết kế được khi chưa biết có gì.
- **R2 — Thư viện sinh PDF chạy được trên Cloudflare Workers.** Chưa có thư viện nào được xác nhận. Ba hướng phải đo:
  - (a) JS thuần (vd `pdf-lib`) — **kiểm font tiếng Việt có dấu** (phải nhúng font Unicode, font chuẩn PDF không đủ);
  - (b) **Cloudflare Browser Rendering** (Puppeteer) từ HTML — đẹp nhất nhưng là dịch vụ trả phí riêng, phải đo chi phí + throughput;
  - (c) dựng trong **Queue consumer** từng lô nhỏ để né trần CPU/wall-time.
  **Không chọn hướng nào trước khi có phép đo thật.**
- **R3 — Ngưỡng quy mô.** Chưa đo CPU/wall-time/bộ nhớ khi dựng hàng trăm–hàng nghìn PDF một lượt. Cần biết trần để quyết định chia lô.
- **R4 — Chi phí R2 ở quy mô mục tiêu.** Hàng nghìn hóa đơn/tenant/tháng × mục tiêu 100.000 tenant — ước lượng dung lượng + chi phí trước khi mở rộng.
- **R5 *(tùy chọn, để sau)* — GDT có phát logo thật không.** Đăng nhập `hoadondientu.gdt.gov.vn` bằng tài khoản thật, mở một hóa đơn, dùng DevTools → Network ghi lại có request nào trả PDF/ảnh logo không. Nếu **có** → đó là **cải tiến cho hóa đơn MUA VÀO** (vốn không có đường nào khác). Không chặn U37 vì QĐ-4 đã chốt đường tự tải lên.

---

## 6. Rủi ro phải xử lý trong thiết kế (không để lại cho lúc code)

### 6.1 Pháp lý — rủi ro cao nhất

Link công khai **không cần đăng nhập** nghĩa là **bất kỳ ai có link đều đọc được dữ liệu doanh nghiệp + đối tác** (tên, MST, địa chỉ, mặt hàng, giá trị giao dịch) — **dữ liệu thuộc phạm vi NĐ 13/2023/NĐ-CP**. Bắt buộc: khóa ngẫu nhiên đủ dài (§4.3), **thu hồi sớm được**, audit log mỗi lần phát hành/thu hồi, cảnh báo có xác nhận (QĐ-7).

### 6.2 Nhầm lẫn giá trị chứng từ

Thứ ta tạo là **"bản thể hiện"** — **không** phải hóa đơn điện tử gốc có giá trị pháp lý (gốc là XML có chữ ký số). QĐ-8 bắt in tuyên bố lên chính PDF; giao diện cũng phải nói rõ.

### 6.3 Bảo mật đường tải logo lên (đường upload đầu tiên của hệ thống)

Tối thiểu phải chốt trong spec: dung lượng ≤ **500 KB**; **danh sách trắng PNG/JPEG**, **KHÔNG nhận SVG** (SVG nhúng được script → XSS); **xác thực magic bytes**, không tin `Content-Type`/đuôi file; chặn ảnh kích thước bất thường (decompression bomb); khóa object gắn `tenant_id` để không ghi đè chéo tenant. **Logo lưu ở bucket NỘI BỘ `vat-raw`, KHÔNG phải bucket công khai** — PDF nhúng ảnh vào file nên logo không cần URL public.

### 6.4 Cách ly tenant ngoài hàng rào

File công khai nằm **ngoài** RLS/JWT — mọi kiểm tra quyền phải làm **tại thời điểm tạo**, vì sau đó không còn cửa nào chặn.

### 6.5 Bẫy GRANT migration

Migration tạo bảng mới (bảng theo dõi link chia sẻ) **phải kèm `GRANT`** — dự án **đã dính bẫy này 2 lần**, và triệu chứng chỉ lộ ra ở production (xem backlog `[2026-07-28]` + memory `bay-grant-migration`).

### 6.6 Race export × sync

Hóa đơn **chưa đồng bộ dòng hàng** mà vẫn xuất ⇒ tờ hóa đơn trống ruột. Xem sự cố `[2026-07-27] Kết xuất giữa lúc đồng bộ đang chạy`. Yêu cầu (3) phải chặn được ca này.

---

## 7. Các bước Loop Engineering tiếp theo

| Bước | Việc | Đầu ra | Cổng |
|---|---|---|---|
| **R** | Chạy R1 → R4 ở §5 (R5 tùy chọn) | Ghi kết quả **kèm ngày + lệnh + output** trực tiếp vào file này, mục §5 chuyển từ "CHƯA KIỂM CHỨNG" sang "đã kiểm chứng" | Không sang bước P khi R1 và R2 còn treo |
| **P** | `/plan-unit U37` — viết `docs/plans/U37-plan.md` theo khuôn U36 (Vì sao làm / Quyết định đã chốt / Phạm vi / Thiết kế theo gói / Tiêu chí nghiệm thu / Rủi ro / Trạng thái duyệt) | `U37-plan.md` | Chủ dự án duyệt kế hoạch trước khi code |
| **C** | Cân nhắc **tách đôi**: **U37a** = hồ sơ doanh nghiệp (logo + địa chỉ + ĐT + fax, đường upload đầu tiên) → **U37b** = dựng PDF + ZIP + link chia sẻ. U37b phụ thuộc U37a | Hai plan con nếu tách | Hiến pháp: **mỗi lần một đơn vị** |
| **T** | `/start-unit U37a` rồi `/start-unit U37b` — TDD, test đỏ trước | Code + test | `make lint && make test` xanh |
| **Q** | `/qa-unit` — `dod-auditor` **+ `security-reviewer`** (bắt buộc, §6) | Báo cáo review | Stop hook `.claude/hooks/gate-dod.sh` |

**Việc phải làm TRƯỚC hoặc CÙNG LÚC (nợ chặn):** vá `invoiceDoc.ts` để hưởng sửa 3 trường thuế của U35b — nếu không, PDF in `0.08` thay vì `8%` và có thể trống Tiền thuế (§4.4).

---

## 8. Hướng thiết kế đề xuất (khung — chưa phải thiết kế chốt)

1. **Registry-first** (bắt buộc theo `.claude/rules/ui.md` + `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md`): khai báo bộ trường "mẫu hóa đơn" trong Registry miền hóa đơn — một nguồn sự thật, **không hardcode nhãn trong template**.
2. **Renderer** mở rộng từ `invoiceDoc.ts` → PDF; gom qua `zipStream.ts` → một ZIP. Job chạy **nền qua Queue** (không dựng đồng bộ trong request).
3. **Khâu kiểm tra (yêu cầu 3) = cổng tự động, không phải "xem bằng mắt".** Trước khi phát hành ZIP, chạy validator trên từng hóa đơn:
   - (a) đủ trường bắt buộc theo mẫu;
   - (b) **đối chiếu số học**: `Σ thành tiền dòng hàng` khớp `tổng trước thuế`; `tiền thuế` khớp `thuế suất × tiền hàng`; `tổng sau thuế` khớp (tái dùng logic đã sửa ở U35b `columns.ts`);
   - (c) hóa đơn **chưa đồng bộ dòng hàng** ⇒ **từ chối xuất** kèm thông báo rõ (§6.6 — đừng lặp lại lỗi ô trống câm).

   Có lỗi ⇒ **báo cáo kèm danh sách hóa đơn hỏng, không phát hành file im lặng**.
4. **Lưu trữ & chia sẻ:** khóa ngẫu nhiên (§4.3); bảng theo dõi (`tenant_id`, khóa, thời điểm tạo, `het_han_luc`, người tạo) + audit log "phát hành link công khai"; lifecycle 30 ngày + nút **thu hồi ngay**.

---

## 9. Liên quan

- `docs/BACKLOG-y-tuong-va-de-xuat.md` — mục `[2026-07-28] ⭐ ƯU TIÊN 1` (bản gốc, giữ làm lịch sử)
- `docs/doi_chieu_data/hoa_don_mau.pdf` — mẫu tham chiếu (⚠️ **nguồn Viettel vinvoice, không phải GDT** — §4.1)
- `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md` + `.claude/rules/ui.md` — chuẩn tầng trình bày, Registry
- `.claude/rules/security.md`, `.claude/rules/multi-tenant.md` — ràng buộc bảo mật & cách ly
- Backlog `[2026-07-27]` — `invoiceDoc.ts` chưa hưởng sửa thuế U35b (nợ chặn)
- Backlog `[2026-07-27]` — race export × sync (ca phải chặn ở yêu cầu 3)
- Backlog `[2026-07-28]` — bẫy GRANT migration
- Backlog `[2026-07-16]` — hạn mức 10 lượt tải/tháng (link công khai là một dạng "lượt tải" cần đếm)
- `KHAO_SAT_TINH_NANG_NIBOT.md` — đối thủ có `PDF.ZIP` + `AIO.PDF`; PDF gốc có logo phải mua dịch vụ DOLAGO

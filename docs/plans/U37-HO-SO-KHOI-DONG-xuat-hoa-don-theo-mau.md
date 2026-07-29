# U37 — Hồ sơ khởi động: Module XUẤT HÓA ĐƠN THEO MẪU CHUẨN

> **Câu lệnh gọi ở phiên sau:** *"làm tiếp U37b"* → đọc **`docs/plans/HANDOFF-phien-2026-07-28-U37a.md`** TRƯỚC (bàn giao gọn, đủ để bắt đầu ngay), rồi §8 mục U37b của file này. Bước R đã đóng; U37a xong 3/3 lát và đã deploy.

| | |
|---|---|
| **Mã đơn vị** | U37 (U36 là số lớn nhất đang dùng, xác nhận `ls docs/plans/` 2026-07-28) |
| **Trạng thái** | 🔄 **ĐỔI HƯỚNG 2026-07-28 (chủ dự án).** Không dựng bản thể hiện từ dữ liệu nữa — **tải thẳng hóa đơn gốc từ GDT** (§4.5). Bốn quyết định cũ bị vô hiệu hóa (§3). **Bước R đã đóng** (§4.5–§4.7). U37a xong 3/3 lát (`c133bcf`, `44db2e2`, `c217a24`); tiếp theo là **U37b**. |
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

> **📌 Đổi hướng 2026-07-28 (giữ nguyên văn ba yêu cầu trên làm lịch sử).** Chủ dự án chỉ đạo: *"thay vì tạo hoá đơn từ dữ liệu thì tìm cách tải hoá đơn từ GDT luôn, vì họ hỗ trợ việc đó. Như vậy vừa đơn giản và chính xác"* — và điều đó **đã được kiểm chứng đúng** (§4.5).
>
> Hệ quả với ba yêu cầu gốc: **(1)** không còn "đúng mẫu + logo" — thứ GDT phát là **XML gốc có chữ ký số**, chính xác tuyệt đối nhưng **không xem được bằng mắt**; phần "nhìn thấy tờ hóa đơn" tách sang **U38**. **(2)** giữ nguyên. **(3)** giữ nguyên nhưng đổi nội dung kiểm: không còn đối chiếu số học (ta không tự tính gì), chuyển thành đối chiếu **số lượng** + báo cáo hóa đơn GDT không có hồ sơ gốc (§8).
>
> Mục **§1** ở trên mô tả sản phẩm theo hướng CŨ; đọc §8 để lấy hình dung đúng theo hướng mới.

---

## 3. Tám quyết định ĐÃ CHỐT — **bốn cái đã bị hướng mới vô hiệu hóa (2026-07-28)**

| # | Quyết định | Trạng thái sau khi đổi hướng |
|---|---|---|
| QĐ-1 | **Chỉ làm hóa đơn BÁN RA (`chieu = 'sold'`)** | ⚠️ **VÔ HIỆU rồi KHÔI PHỤC — cùng kết luận, khác lý do.** 28/07: lý do cũ ("không lấy được logo người bán") hết hiệu lực ⇒ mở ra cả hai chiều. **29/07: quay lại CHỈ BÁN RA** vì nhu cầu thật của khách là *"tải hóa đơn ĐÃ XUẤT cho một khách hàng cụ thể"* (§4.8). Kỹ thuật vẫn làm được mua vào (bundle GDT có nhãn `"Xuất xml (hóa đơn mua vào)"`), nhưng **ngoài phạm vi U37b** |
| QĐ-2 | ~~Định dạng bên trong ZIP = PDF~~ | ❌ **VÔ HIỆU.** Bên trong ZIP là **XML gốc có chữ ký số** do GDT phát |
| QĐ-3 | **Trường rỗng thì để trống** — không bịa, không suy diễn | ✅ Còn hiệu lực (áp cho báo cáo kèm gói và cho U38) |
| QĐ-4 | ~~Logo do người dùng TỰ TẢI LÊN~~ | ❌ **VÔ HIỆU.** Không dựng bản thể hiện ⇒ không cần logo. **Đường tải file lên đầu tiên của hệ thống RA KHỎI phạm vi**, kèm toàn bộ rủi ro §6.3 |
| QĐ-5 | **Tên miền công khai = `docs.tourdao.vn`** (custom domain, KHÔNG dùng `r2.dev`) | ✅ Còn hiệu lực (chủ dự án tái xác nhận 2026-07-28) |
| QĐ-6 | **Tự xóa sau ~30 ngày** bằng R2 Object Lifecycle Rule theo prefix | ✅ Còn hiệu lực |
| QĐ-7 | **Cảnh báo rủi ro link công khai** trước khi tạo link (checkbox xác nhận, không phải dòng chữ mờ) | ✅ Còn hiệu lực. Kèm nút **thu hồi ngay** + audit log |
| QĐ-8 | ~~In tuyên bố "không thay thế hóa đơn điện tử gốc" lên chân mỗi trang PDF~~ | ❌ **VÔ HIỆU — và in lên là SAI SỰ THẬT.** File **chính là** bản gốc có chữ ký số. Rủi ro §6.2 (nhầm lẫn giá trị chứng từ) biến mất |

### Quyết định MỚI chốt cùng lúc (2026-07-28)

| # | Quyết định |
|---|---|
| QĐ-A | **Gói chỉ chứa XML gốc từ GDT.** Bản thể hiện xem-bằng-mắt đẩy sang **U38**, dựng từ kho XML đã tải (khi đó không gọi GDT thêm lần nào) |
| QĐ-B | **Không chặn trần số hóa đơn mỗi lần xuất.** Chạy nền qua hàng đợi; `TenantLimiter` giữ nhịp; báo tiến trình |
| QĐ-C | **Tách đôi:** U37a = adapter + kho XML gốc + job nền; U37b = gói ZIP + link công khai + thu hồi + UI |

---

## 4. Bằng chứng ĐÃ KIỂM CHỨNG (2026-07-28) — dùng lại, không kiểm lại

### 4.1 ⚠️ GDT **không** phát hành PDF có logo — giả định ban đầu đã bị bác bỏ

Giả định ban đầu của chủ dự án: *"Hoá đơn tải về từ trang GDT vẫn có logo ⇒ logo được lưu sẵn trong CSDL của GDT."* **Sáu bằng chứng độc lập nói ngược lại:**

1. **Chân trang mọi hóa đơn trong file mẫu** (`pdftotext -f 1 -l 1 docs/doi_chieu_data/hoa_don_mau.pdf`, trích nguyên văn):
   > *"Đơn vị cung cấp dịch vụ Hóa đơn điện tử: Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel), MST: 0100109106. Tra cứu hóa đơn điện tử tại Website: https://vinvoice.viettel.vn/utilities/invoice-search. **Mã số bí mật**: 5666OK7MZX1R3CK."*

   Lặp lại ở mọi trang kiểm tra (dòng 87, 176, 265, 354, 443…), mỗi hóa đơn một "Mã số bí mật" riêng. **"Mã số bí mật" là khóa tra cứu của NHÀ CUNG CẤP, không phải trường của GDT.**
2. **Metadata PDF** (`pdfinfo`): `Producer: iText® 5.5.13`, **152 trang**, tạo 01/07/2026 14:54 — kết xuất hàng loạt từ hệ thống nhà cung cấp.
3. **Ảnh nhúng** (`pdfimages -list`): đúng **3 ảnh/trang**, kích thước **giống hệt nhau ở mọi trang** (179×364, 512×106, 130×54) — logo/con dấu của **một** người bán, do hệ thống Viettel chèn lúc dựng bản thể hiện.
4. **Adapter của ta biết gì về GDT:** `packages/gdt-client/src/endpoints.ts` + `detail.ts` chỉ có `/query/invoices/{purchase,sold}`, `/sco-query/...`, `/…/invoices/detail` (4 tham số định danh) — **không có endpoint PDF/logo nào**.
5. **Tín hiệu đối thủ:** `KHAO_SAT_TINH_NANG_NIBOT.md:31` — *"với PDF gốc có logo/màu, NIBOT chào dịch vụ **DOLAGO** để tải từ nhà cung cấp"*. Nếu GDT phát PDF có logo, NIBOT đã không phải bán thêm dịch vụ bên thứ ba.
6. **⭐ Bằng chứng thứ 6 — từ CHÍNH cổng GDT, không phải PDF của nhà cung cấp** (bổ sung 2026-07-28): `docs/doi_chieu_data/Hóa Đơn Điện Tử.html` là trang cổng GDT thật đã lưu, **có chứa khối "Xem hóa đơn"** — tức bản thể hiện do chính GDT dựng. Đếm ảnh trong toàn trang:

   ```
   $ node -e "const h=require('fs').readFileSync(f,'utf8');
              console.log((h.match(/<img[^>]*>/g)||[]).length)"
   8
   ```

   Tám thẻ `<img>` gồm **1 logo của cổng GDT** (`NTT_Logo_v2.png`) + **7 icon menu** (`ic_ql_tao_lap.svg`). **Không có thẻ ảnh nào trong khối hóa đơn.** Bản thể hiện của GDT dựng hoàn toàn bằng HTML/CSS + một mã QR vẽ bằng SVG `<rect>`. ⇒ GDT **không hề lưu logo người bán**, kể cả để hiển thị trên cổng của mình.

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

> **⚠️ Bảng trên đã LẠC HẬU sau khi đổi hướng (2026-07-28).** Đo thật `raw_json` production (§4.6) cho thấy khoảng trống dữ liệu **nhỏ hơn nhiều** so với ghi nhận ở đây: `raw_json` có **152 khóa cấp 1**, gồm đủ `nbdchi`/`nbsdthoai`/`nbstkhoan`/`nbtnhang` (người bán) và `nmdchi`/`nmtnmua`/`htttoan` (người mua). Hai dòng cuối cũng hết hiệu lực: đường upload logo ra khỏi phạm vi (QĐ-4 vô hiệu), và `invoiceDoc.ts` **không còn là nợ chặn** vì U37 không đi qua renderer nào.

### 4.5 ⭐ GDT CÓ đường tải hóa đơn gốc — ĐÃ KIỂM CHỨNG (2026-07-28, offline, không cần đăng nhập)

Nguồn sơ cấp: bundle JS của chính cổng `hoadondientu.gdt.gov.vn`, lưu trong `docs/doi_chieu_data/Hóa Đơn Điện Tử_files/`. Trích nguyên văn (đã khử minify):

```js
// 1121-a47aace172e5b7dc.js — handleExportXML (nút "Xuất xml" trên màn Tra cứu)
const { hsgoc } = selectedRow;
if (!hsgoc) return message.error("Không tồn tại hồ sơ gốc");
dispatch(exportXml(this.getValues(selectedRow, ["nbmst","khhdon","shdon","khmshdon"]),
                   jwt, activeTab == 1 ? "query" : "sco-query"))
  .then(blob => saveAs("invoice", blob, "zip"))

// _app-2aef5a25f219981e.js
exportXml = (params, token, family) => () =>
  sendGetBlob(`https://hoadondientu.gdt.gov.vn/api/${family}/invoices/export-xml`, params, token)

sendGetBlob = (url, params, token) => axios({
  method: "get", url, params, responseType: "blob",
  headers: { Authorization: `Bearer ${token}`, "Accept-Language": "vi" },
})
```

**Đã kiểm chứng:**

- Đường dẫn: `GET /api/{query|sco-query}/invoices/export-xml`
- Tham số: `nbmst`, `khhdon`, `shdon`, `khmshdon` — **trùng khít 4 tham số định danh** của `/invoices/detail` mà `packages/gdt-client/src/endpoints.ts` đã kiểm chứng và đang dùng
- Xác thực: `Authorization: Bearer <token GDT>` — **cùng token** U14 đã có
- Phản hồi: **blob**, cổng lưu thành `invoice.zip`
- Điều kiện tiên quyết: cờ **`hsgoc`** trên dòng hóa đơn
- Có cho **cả hai chiều**: bundle chứa cả `"Xuất xml (hóa đơn bán ra)"` lẫn `"Xuất xml (hóa đơn mua vào)"`

**KHÔNG có endpoint PDF cho hóa đơn.** `grep -ohiE '[a-z0-9/_-]*pdf[a-z0-9/_-]*' *.js` chỉ ra tên icon (`FilePdfOutline`, `file-pdf`) và hai hàm in chứng từ TNCN (`print01QTRPDF`, `pageSignBoxPrintPDF`) — không có đường xuất PDF hóa đơn nào. Ba endpoint xuất hóa đơn duy nhất: `/invoices/export-xml`, `/invoices/export-excel`, `/invoices/export-excel-sold`.

**CHƯA KIỂM CHỨNG (chờ R-b):** bên trong ZIP có gì (chỉ XML? có kèm bản thể hiện?), mã lỗi khi thiếu `hsgoc`, và GDT có kìm nhịp riêng cho endpoint này không.

### 4.6 `hsgoc` và độ giàu của `raw_json` — ĐO THẬT trên production (2026-07-28)

Lệnh: `node scripts/do-hsgoc-u37.mjs` (chỉ `SELECT`). Tổng **33.945** hóa đơn.

| chiều × nguồn | tổng | có khóa `hsgoc` | `hsgoc` khác `null` |
|---|---|---|---|
| `purchase` × `normal` | 322 | 322 | **258** |
| `purchase` × `sco` | 22.017 | 22.017 | 22.017 |
| `sold` × `sco` | 11.606 | 11.606 | 11.606 |

- **`hsgoc` có mặt ở 100% hóa đơn đã đồng bộ** — không cần thêm gì để lấy cờ này.
- Giá trị là **UUID chuỗi** (id hồ sơ gốc), **không phải boolean**.
- **64 hóa đơn `null`**, toàn bộ nằm trong `purchase/normal` (~19,9% nhóm đó). Mọi hóa đơn `sco` đều có ⇒ phải có nhánh "GDT không có hồ sơ gốc" trong báo cáo kèm gói, nhưng tỷ lệ nhỏ.
- Không tồn tại tổ hợp `sold/normal` trong dữ liệu hiện tại.

**`raw_json` có 152 khóa cấp 1** — giàu hơn nhiều so với 24 cột của bảng `hoa_don`. Đáng chú ý cho **U38**:

- **`tgtttbchu`** — tổng tiền thanh toán **bằng chữ**, GDT trả sẵn ⇒ **không cần viết bộ đọc số thành chữ tiếng Việt**
- **`qrcode`** — GDT trả sẵn ⇒ **không cần bộ sinh mã QR**
- Người bán: `nbdchi`, `nbsdthoai`, `nbstkhoan`, `nbtnhang`, `nbfax` (322), `nbcks` (chữ ký số)
- Người mua: `nmdchi`, `nmtnmua`, `nmshchieu`, `nmcccd`, `nmstkhoan` (322)
- Khác: `htttoan` (hình thức thanh toán, 322), `dvtte`/`tgia` (322 — khớp ghi nhận backlog "`dvtte` trống ở 100% hóa đơn `sco`"), `hdhhdvu` (dòng hàng)

⚠️ Các khóa đếm `322` **chỉ có ở `purchase/normal`** — hóa đơn `sco` (33.623) nghèo trường hơn. U38 phải xử lý hai mức độ đầy đủ khác nhau.

### 4.7 ⭐⭐ R-b — PROBE THẬT `export-xml`: bên trong ZIP có gì (2026-07-28)

Lệnh: `node scripts/probe-export-xml-u37.mjs` (token GDT thật lấy từ DB, chủ dự án cho phép; chỉ đọc, không ghi DB, không in token).

**Ca 1 — hóa đơn CÓ hồ sơ gốc** (`purchase`/`normal`, family `query`): **HTTP 200**, 317.636 byte, là ZIP. Bên trong **5 file**:

| File | Kích thước | Là gì |
|---|---|---|
| `invoice.xml` | 10.338 B | **Bản gốc có chữ ký số** — `<HDon><DLHDon Id="…"><TTChung><PBan>2.1.0</PBan>…` |
| **`invoice.html`** | 32.186 B | **⭐ BẢN THỂ HIỆN do CHÍNH GDT dựng sẵn** |
| `details.js` | 109.897 B | jQuery 1.8.2 (tài nguyên tĩnh) |
| `viewinvoice-bg.jpg` | 152.675 B | Ảnh nền tờ hóa đơn (tài nguyên tĩnh) |
| `sign-check.jpg` | 11.928 B | Dấu "Signature Valid" (tài nguyên tĩnh) |

*(Hai ảnh này khớp đúng hai ảnh mà cổng GDT nạp trước khi in — `printInvoice` gọi `handleLoadImage("/static/images/viewinvoice-bg.jpg")` và `sign-check.jpg`.)*

**Ca 2 — hóa đơn `hsgoc = null`:** **HTTP 500**, `content-type: application/json`, thân nguyên văn:

```json
{"timestamp":"28/07/2026 19:10:32","message":"Không tồn tại hồ sơ gốc của hóa đơn.",
 "details":"","path":"uri=/invoices/export-xml","requestId":"30f0dc15-…"}
```

**Ba hệ quả thiết kế:**

1. **U38 gần như không cần nữa.** GDT kèm sẵn bản thể hiện HTML ⇒ "xem bằng mắt" đã có, miễn phí. U38 co lại còn "PDF hóa nếu cần in hàng loạt" (xem backlog `[2026-07-28] U38`).
2. **BẮT BUỘC khử trùng lặp tài nguyên tĩnh.** `invoice.html` tham chiếu 3 tài nguyên bằng **tên phẳng không tiền tố** (`details.js`, `viewinvoice-bg.jpg`, `sign-check.jpg`) và **không nhúng base64** (đã đo bằng regex trong probe). Tức **274.500/317.636 byte ≈ 86% mỗi ZIP là 3 file giống hệt nhau lặp lại**. Gói **phẳng** với **một** bộ tài nguyên dùng chung ở gốc ZIP ⇒ **không phải sửa một ký tự nào** trong HTML:

   ```
   details.js   viewinvoice-bg.jpg   sign-check.jpg        ← một lần cho cả gói
   C26TQO-13580.html   C26TQO-13580.xml                    ← mỗi hóa đơn ~42 KB
   …
   bao-cao.txt                                             ← HĐ không lấy được
   ```

   500 hóa đơn: **~21 MB thay vì ~160 MB**. Kho R2 cho 33.945 hóa đơn: **~1,4 GB thay vì ~10,5 GB**. ⇒ **Kho `tep_hoa_don_goc` chỉ lưu `invoice.xml` + `invoice.html`**, không lưu 3 file tĩnh theo từng hóa đơn.
3. **🔴 Bẫy retry — GDT trả 500 cho ca "không có hồ sơ gốc".** Nếu adapter theo lệ thường *"5xx ⇒ retry có backoff"* thì 64 hóa đơn `hsgoc = null` sẽ bị gọi lặp vô ích rồi rơi DLQ, và ta lại gọi dồn máy chủ thuế. **Phải phân loại theo thân phản hồi** (`message` = "Không tồn tại hồ sơ gốc của hóa đơn.") ⇒ **lỗi vĩnh viễn, không retry**, đưa thẳng vào báo cáo kèm gói.

**Bằng chứng thứ 7 cho §4.1:** `invoice.html` tham chiếu **đúng 3** tài nguyên, không có ảnh nào khác ⇒ **bản thể hiện chính thức của GDT không có logo người bán**, kể cả trong file GDT phát ra cho người nộp thuế tải về.

**CHƯA KIỂM CHỨNG (không chốt):** GDT có kìm nhịp riêng cho endpoint này không — hai lần gọi mất 353 ms rồi 2.261 ms, **hai mẫu là quá ít** để kết luận. Đo khi chạy lô thật ở U37a.

### 4.8 ⭐ NHU CẦU THẬT của khách — chủ dự án làm rõ 2026-07-29 (đổi hẳn phạm vi U37b)

Trước mốc này, kế hoạch ngầm hiểu "một lần xuất = cả kỳ của doanh nghiệp". **Sai đơn vị.**
Chủ dự án nêu rõ nhu cầu thật:

> *"khách tải hoá đơn đã xuất cho **1 khách hàng cụ thể** trong tháng"*

Đo lại theo đúng đơn vị đó (`node scripts/do-hsgoc-u37.mjs`, chỉ SELECT, 2026-07-29):

| Đơn vị đo | Số hóa đơn | Thời gian tải ở nhịp 2 req/giây |
|---|---|---|
| Cả kỳ, cả hai chiều *(hiểu sai ban đầu)* | **10.958** | ~1,5 giờ — **vượt ngân sách đẩy lùi 30 phút** |
| Cả kỳ, chỉ bán ra | 3.741 | ~31 phút — **sát mép ngân sách** |
| **Một khách hàng × một tháng *(nhu cầu thật)*** | **lớn nhất 56**, trung bình **6,6**, p95 ~29 | **28 giây / ~3 giây** |

⇒ **Không có vấn đề quy mô nào.** Hạ tầng hàng đợi hiện tại dư sức gấp hàng chục lần. Mọi
phương án từng cân nhắc (nới `FANOUT_MAX_BACKPRESSURE`, cron tải sẵn ban đêm, chặn trần số
hóa đơn) đều **không cần** — miễn là **bắt buộc chọn khách hàng** trước khi cho bấm.

**Phạm vi phục vụ được (đo thật):**

| | |
|---|---|
| Hóa đơn bán ra có MST người mua | **2.006 / 11.758 (17%)** — 83% còn lại là khách lẻ (CCCD / "Bán cho người tiêu dùng") |
| Khách hàng hiện trong danh sách gợi ý (có ĐỦ MST + tên) | **167** |
| Hóa đơn xuất được | **1.957** |
| Độ sạch dữ liệu tên | 165/169 MST có **đúng một** cách viết tên ⇒ live search chính xác, không gây chọn nhầm |

**Ca "có MST mà tên trống" — đã truy nguyên, KHÔNG phải lỗi của ta:** 5 MST rơi vào ca này,
toàn bộ là `nguon='sco'` (máy tính tiền) và MST bắt đầu bằng **8** (mã số thuế **cá nhân**).
`raw_json` có khóa `nmten` nhưng **chính GDT trả giá trị `null`**. Tức là khách lẻ đọc MST cá
nhân để lấy hóa đơn, không phải doanh nghiệp thiếu tên. ⇒ Luật "MST hoặc tên trống thì chặn
nút" là **đúng**, và còn tự loại nhóm này ra khỏi tính năng — khớp phạm vi "chỉ doanh nghiệp".

---

## 5. CHƯA KIỂM CHỨNG — phải làm xong trước khi chốt kế hoạch (Bước R)

> Theo *Nguyên tắc bằng chứng* (`CLAUDE.md`): không mục nào dưới đây được coi là "đã chốt" cho tới khi có phép kiểm tái lập được **kèm ngày và kết quả**.

> **Cập nhật 2026-07-28 sau khi đổi hướng:** R1 → **XONG** (§4.6). R2/R3/R4 (thư viện PDF, trần dựng PDF, chi phí kết xuất) **hủy khỏi U37, chuyển sang U38** — U37 không dựng PDF nữa. R5 → **XONG, kết luận ngược lại điều mong đợi** (§4.5: GDT không có endpoint PDF nào; nhưng CÓ endpoint tải XML gốc, tốt hơn). Chỉ còn **R-b** dưới đây là treo.

- ~~**R1 — Bản đồ trường dữ liệu.**~~ ✅ **XONG 2026-07-28** — xem §4.6. `hsgoc` có ở 100% hóa đơn; `raw_json` có 152 khóa cấp 1.
- ~~**R2 — Thư viện sinh PDF chạy được trên Cloudflare Workers.**~~ ⏭️ **Chuyển sang U38.** (Ba hướng phải đo khi tới lượt: `pdf-lib` thuần JS + nhúng font Unicode tiếng Việt; Cloudflare Browser Rendering; dựng theo lô trong Queue consumer.)
- ~~**R3 — Ngưỡng quy mô dựng PDF.**~~ ⏭️ **Chuyển sang U38.**
- ~~**R4 — Chi phí R2 ở quy mô mục tiêu.**~~ ⏭️ **Chuyển sang U38** (nhưng U37 có kho XML gốc bất biến, cần ước lượng dung lượng riêng khi có số đo từ R-b).
- ~~**R5 — GDT có phát logo thật không.**~~ ✅ **XONG 2026-07-28** — §4.5: `grep` toàn bộ bundle GDT cho thấy **không có endpoint PDF hóa đơn nào**, và bản thể hiện của chính GDT **không có logo người bán** (§4.1 bằng chứng 6). Đổi lại, phát hiện endpoint **`export-xml`** trả bản gốc có chữ ký số — nền tảng của hướng mới.

### ✅ R-b — XONG 2026-07-28

Đã probe thật (`scripts/probe-export-xml-u37.mjs`, token từ DB, chủ dự án cho phép). Kết quả đầy đủ ở **§4.7**: ZIP có 5 file gồm cả **bản thể hiện HTML do GDT dựng sẵn**; ca thiếu hồ sơ gốc trả **HTTP 500 + JSON**; 86% dung lượng mỗi ZIP là tài nguyên tĩnh trùng lặp phải khử. Chỉ còn **kìm nhịp** là chưa đủ mẫu để kết luận — đo khi chạy lô thật ở U37a.

**⇒ Bước R đóng. Không còn gì chặn bước T (code).**

---

## 6. Rủi ro phải xử lý trong thiết kế (không để lại cho lúc code)

### 6.1 Pháp lý — rủi ro cao nhất

Link công khai **không cần đăng nhập** nghĩa là **bất kỳ ai có link đều đọc được dữ liệu doanh nghiệp + đối tác** (tên, MST, địa chỉ, mặt hàng, giá trị giao dịch) — **dữ liệu thuộc phạm vi NĐ 13/2023/NĐ-CP**. Bắt buộc: khóa ngẫu nhiên đủ dài (§4.3), **thu hồi sớm được**, audit log mỗi lần phát hành/thu hồi, cảnh báo có xác nhận (QĐ-7).

### 6.2 ~~Nhầm lẫn giá trị chứng từ~~ — ❌ KHÔNG CÒN (2026-07-28)

Hướng mới tải **chính bản gốc có chữ ký số** từ GDT, không tạo "bản thể hiện" nào. Rủi ro này biến mất, và **QĐ-8 trở thành sai sự thật** nếu vẫn in (xem §3).

### 6.3 ~~Bảo mật đường tải logo lên~~ — ❌ RA KHỎI PHẠM VI (2026-07-28)

QĐ-4 vô hiệu ⇒ không có đường upload nào trong U37. Đặc tả dưới đây **giữ lại làm spec sẵn sàng cho U38** (nếu U38 dựng bản thể hiện có logo): dung lượng ≤ **500 KB**; **danh sách trắng PNG/JPEG**, **KHÔNG nhận SVG** (SVG nhúng được script → XSS); **xác thực magic bytes**, không tin `Content-Type`/đuôi file; chặn ảnh kích thước bất thường (decompression bomb); khóa object gắn `tenant_id`; lưu ở bucket **nội bộ** `vat-raw`.

### 6.3b 🔴 MỚI — nhịp gọi GDT (rủi ro lớn nhất của hướng mới)

Mỗi hóa đơn tốn **một request** tới máy chủ thuế. Một kỳ vài trăm–vài nghìn hóa đơn = ngần ấy lần gọi ⇒ trái thẳng *"Tôn trọng máy chủ thuế… Không gọi dồn dập"* của Hiến pháp. Bắt buộc: chạy nền qua queue `vat-sync` + `TenantLimiter` + circuit breaker `EgressHealth`, **không** chạy trong request `POST /exports` như đường xuất hiện nay. Giảm nhẹ: XML gốc **bất biến** ⇒ tải một lần lưu R2, lần xuất sau tốn **0** request GDT.

### 6.4 Cách ly tenant ngoài hàng rào

File công khai nằm **ngoài** RLS/JWT — mọi kiểm tra quyền phải làm **tại thời điểm tạo**, vì sau đó không còn cửa nào chặn.

### 6.5 Bẫy GRANT migration

Migration tạo bảng mới (bảng theo dõi link chia sẻ) **phải kèm `GRANT`** — dự án **đã dính bẫy này 2 lần**, và triệu chứng chỉ lộ ra ở production (xem backlog `[2026-07-28]` + memory `bay-grant-migration`).

### 6.6 ~~Race export × sync~~ — ❌ KHÔNG CÒN (2026-07-28)

XML lấy từ GDT theo **định danh hóa đơn** (`nbmst`/`khhdon`/`shdon`/`khmshdon`), không đọc bảng `dong_hang_hoa` của ta ⇒ hóa đơn đã đồng bộ dòng hàng hay chưa **không ảnh hưởng**. Rủi ro này biến mất cùng hướng mới. *(Vẫn còn nguyên với đường xuất xlsx/csv hiện tại — xem backlog `[2026-07-27]`.)*

---

## 7. Các bước Loop Engineering tiếp theo

| Bước | Việc | Đầu ra | Trạng thái |
|---|---|---|---|
| **R** | R1 + R5 ở §5 | §4.5 + §4.6 | ✅ **XONG 2026-07-28** |
| **R-b** | Probe thật `export-xml` | §4.7 | ✅ **XONG 2026-07-28** |
| **P** | Kế hoạch U37 theo hướng mới | Đã duyệt 2026-07-28 | ✅ **XONG** |
| **C** | **Tách đôi:** **U37a** = adapter `export-xml` + kho hóa đơn gốc + job nền → **U37b** = gói ZIP + bucket công khai + link + thu hồi + UI. U37b phụ thuộc U37a | Hai đơn vị con | ✅ Chốt (QĐ-C) |
| **T** | `/start-unit U37a` rồi `/start-unit U37b` — TDD, test đỏ trước | Code + test | ▶️ **SẴN SÀNG — không còn gì chặn** |
| **Q** | `/qa-unit` — `dod-auditor` **+ `security-reviewer`** (bắt buộc, §6) | Báo cáo review | ⏸ |

**Nợ chặn cũ đã GỠ:** vá `invoiceDoc.ts` cho 3 trường thuế U35b **không còn chặn U37** — hướng mới không đi qua renderer nào. Nợ đó vẫn thuộc đường `xml.zip`/`html.zip` cũ (backlog `[2026-07-27]`), xử lý khi tới lượt.

---

## 8. Hướng thiết kế — ĐÃ CHỐT theo hướng mới (2026-07-28)

### U37a — Adapter + kho XML gốc + job nền

1. **Adapter** (`packages/gdt-client`): thêm `EXPORT_XML_ENDPOINTS` vào `src/endpoints.ts` kèm khối bằng chứng đúng khuôn `DETAIL_ENDPOINTS`; `src/exportXml.ts` mới bám khuôn `src/detail.ts`, đi qua `GdtTransport` (**không** `fetch()` trực tiếp), timeout + retry backoff, `401` → dừng và báo hết hạn token. Contract test riêng.
   **🔴 Bắt buộc:** phân loại **HTTP 500 + `message` = "Không tồn tại hồ sơ gốc của hóa đơn."** thành **lỗi VĨNH VIỄN, KHÔNG retry** (§4.7 hệ quả 3). Theo lệ 5xx thông thường sẽ retry vô ích 64 hóa đơn rồi rơi DLQ — và gọi dồn máy chủ thuế.
2. **Kho hóa đơn gốc bất biến:** R2 bucket **nội bộ** `vat-raw`. **Chỉ lưu 2 file/hóa đơn** — `hoadon-goc/<tenantId>/<hoaDonId>.xml` và `.html` — **KHÔNG lưu** `details.js`/`viewinvoice-bg.jpg`/`sign-check.jpg` theo từng hóa đơn (chúng giống hệt nhau, chiếm 86% dung lượng; giữ **một** bản dùng chung). Chênh lệch: **~1,4 GB thay vì ~10,5 GB** cho 33.945 hóa đơn (§4.7). Bảng `tep_hoa_don_goc` (+ RLS + FORCE + **`GRANT`** theo khuôn `0008`+`0018` — quên là dính bẫy lần thứ ba, §6.5). Đã có ⇒ không gọi GDT lại.
3. **Job nền** (`apps/sync-worker`): thêm loại message vào queue `vat-sync` sẵn có, qua `TenantLimiter` + `EgressHealth`, DLQ dùng lại `vat-sync-dlq`. ⚠️ `apps/sync-worker/wrangler.jsonc` **hiện không có binding R2 nào** — phải thêm `RAW`.

### U37b — Gói ZIP, link công khai, thu hồi, giao diện

> **🔴 RÀNG BUỘC BẮT BUỘC khi dựng producer** (phát hiện ở review bảo mật lát 3, 2026-07-28):
> `runHoSoGocJob` **tin thẳng** `msg.ref` (nbmst/khhdon/khmshdon/shdon) trong message, không
> tự tra lại `hoa_don` theo `tenantId`. Hiện vô hại vì chưa producer nào enqueue. Khi làm nút
> "Xuất hóa đơn", `HoSoGocMessage.ref` **PHẢI** dựng từ chính hàng `hoa_don` đã lọc đúng
> `tenant_id` của phiên đăng nhập — không nhận `ref` từ client. Lớp chặn cuối đã có: FK ghép
> `(tenant_id, hoa_don_id)` làm vỡ insert nếu hóa đơn không thuộc tenant, nhưng đó là lưới
> an toàn, không thay cho việc dựng đúng.


4. **Gói ZIP — cấu trúc PHẲNG, tài nguyên tĩnh dùng chung một lần** (§4.7 hệ quả 2). `invoice.html` tham chiếu 3 tài nguyên bằng **tên phẳng không tiền tố**, nên đặt phẳng là chạy được **mà không phải sửa một ký tự nào** trong HTML:

   ```
   details.js   viewinvoice-bg.jpg   sign-check.jpg     ← MỘT lần cho cả gói
   <khhdon>-<shdon>.html   <khhdon>-<shdon>.xml         ← mỗi hóa đơn ~42 KB
   …
   bao-cao.txt                                          ← HĐ không lấy được
   ```

   500 hóa đơn ≈ **21 MB** thay vì ~160 MB. Dùng lại `packages/export/src/zipStream.ts` (`fflate`, chế độ STORE — lưu ý nội dung đã gồm 2 ảnh JPEG nén sẵn, STORE là đúng). Nguồn là object R2 đã tải; **phải stream**, không đi qua `apps/api/src/storage.ts:14` (helper đó đọc trọn file vào RAM).
   ⚠️ Trùng tên: hai hóa đơn khác `nbmst` vẫn có thể trùng `<khhdon>-<shdon>` — `zipStream.ts` đã có `uniqueName` thêm hậu tố, nhưng phải kiểm lại rằng tên sinh ra vẫn ghép đúng cặp `.xml`/`.html`.
5. **Khâu kiểm tra (yêu cầu gốc số 3) = cổng tự động, không phải "xem bằng mắt":**
   - (a) đối chiếu **số lượng** — số XML trong gói khớp số hóa đơn thỏa bộ lọc;
   - (b) hóa đơn GDT từ chối (`hsgoc = null` — ~19,9% nhóm `purchase/normal` theo §4.6 — hoặc lỗi khác) ⇒ vào **báo cáo kèm gói**, không phát hành im lặng;
   - (c) 0 hóa đơn thành công ⇒ **không phát hành link**.

   *(Đối chiếu số học ở bản cũ không còn cần: XML là bản gốc do người bán ký, ta không tự tính lại con số nào.)*
6. **Lưu trữ & chia sẻ:** bucket **mới** `vat-chia-se` + `docs.tourdao.vn`, khóa ngẫu nhiên (§4.3); bảng `goi_chia_se` (`tenant_id`, khóa, `tao_luc`, `het_han_luc`, người tạo, trạng thái) + audit log **phát hành** và **thu hồi**; lifecycle 30 ngày + nút **thu hồi ngay**. Kiểm quyền **tại thời điểm tạo** (§6.4).
7. **Phạm vi xuất — CHỐT 2026-07-29 (§4.8):**
   - **Chỉ chiều BÁN RA.** Chiều mua vào ra khỏi phạm vi U37b.
   - **Bắt buộc chọn MỘT khách hàng doanh nghiệp cụ thể.** Không cho xuất "cả tháng".
   - **Không có bộ lọc riêng cho nút xuất** — dùng CHUNG bộ lọc của trang Danh sách hóa đơn
     (module *Tra cứu hóa đơn*), để người dùng thấy gì tải nấy. `InvoiceExportButtons` vốn
     đã nhận sẵn prop `filter`.

8. **~~Thiếu bộ lọc MST~~ — ĐÍNH CHÍNH 2026-07-29: BỘ LỌC ĐÃ CÓ SẴN, không phải làm.**
   Khẳng định trước đó ("trang chỉ lọc được theo tên") **SAI** — suy từ Registry (`nmmst` không
   khai `locDuoc`) mà không đọc `FilterBar`. Kiểm lại toàn tuyến thì `nmmst` đi trọn vẹn:
   `apps/web/src/types/api.ts:187` → `FilterBar.tsx:137-146` (hiện khi `chieu !== "purchase"`)
   → `filterStore.ts:10` (giữ qua phiên) → `apiClient.ts:127` → `packages/query/src/filters.ts:222`
   (`eq`, khớp CHÍNH XÁC). Đã có test canh: `apps/web/test/features/filterBarDirection.test.tsx`
   phủ cả ẩn/hiện theo chiều lẫn việc xóa `nmmst` khi đổi sang Mua vào.
   **Ghi nhận drift (không sửa trong U37b):** `nbmst`/`nmmst` được render TAY ở `FilterBar`, không
   dẫn xuất từ Registry — lệch `.claude/rules/ui.md:18`. Có lý do chính đáng: khả năng hiện/ẩn phụ
   thuộc `chieu`, Registry hiện không diễn đạt được. Muốn hết lệch thì phải mở rộng Registry, lạc
   phạm vi U37b.

9. **Live search chọn khách hàng.** Nguồn dữ liệu: chính hóa đơn của tenant
   (`DISTINCT nmmst, nmten WHERE chieu='sold'`), bọc `withTenant`. **167 mục** ⇒ trả cả danh
   sách rồi lọc trên máy khách là đủ, KHÔNG cần tìm kiếm phía server hay phân trang.
   Gõ được **cả tên lẫn MST**, hiển thị cặp `Tên — MST` để người dùng thấy mình chọn đúng ai.

10. **Điều kiện mở nút — chốt chặn tính chính xác.** Nút mở **khi và chỉ khi đã CHỌN được một
    khách hàng từ danh sách** (tức có `nmmst` xác định ràng vào bộ lọc). **KHÔNG** dùng điều
    kiện "ô tìm kiếm không trống": người dùng gõ dở rồi bấm luôn thì ô có chữ nhưng chưa ràng
    vào MST nào ⇒ lọt qua, và kết quả là gói rỗng hoặc sai khách hàng. MST hoặc tên trống ⇒
    **chặn/ẩn nút** (chủ dự án chốt).

11. **Giao diện:** nút mới trong `hanhDongPhu` của `FilterBar` (`InvoicesPage.tsx:130-150`).
    Theo `.claude/rules/ui.md:23` đây là **hành động nặng chạy nền** — tên/vị trí phải phản ánh
    đúng, không đặt ngang hàng "Xuất Excel". Nhưng vì quy mô thật chỉ vài giây (§4.8), màn theo
    dõi tiến trình **không cần cầu kỳ**: "đang chuẩn bị…" rồi hiện link là đủ. Cảnh báo + checkbox
    xác nhận (QĐ-7) dùng `Checkbox`/`Alert` sẵn có; **`Modal` chưa tồn tại** ⇒ nếu cần thì thêm
    primitive vào `components/ui/primitives.tsx`, không tô kiểu nội tuyến trong `features/`
    (`ui-luat.test.ts` sẽ đỏ). Nhãn mới khai trong Registry, không gõ chuỗi rời.

### Ngoài phạm vi U37 (→ U38, đã co lại rất nhiều)

R-b cho thấy **GDT kèm sẵn `invoice.html`** — bản thể hiện xem-bằng-mắt **đã có, không phải dựng** (§4.7). U38 vì thế chỉ còn lý do tồn tại nếu người dùng cần **PDF để in hàng loạt**; và cả khi đó cũng là "HTML → PDF", không phải dựng template từ đầu. Hai thứ tưởng phải viết đều không cần: `tgtttbchu` (tiền bằng chữ) và `qrcode` GDT trả sẵn trong `raw_json` (§4.6).

---

## 9. Liên quan

- `docs/BACKLOG-y-tuong-va-de-xuat.md` — mục `[2026-07-28] ⭐ ƯU TIÊN 1` (bản gốc, giữ làm lịch sử)
- **`docs/doi_chieu_data/Hóa Đơn Điện Tử.html` + `…_files/`** — ⭐ **nguồn sơ cấp quan trọng nhất của đơn vị này**: trang cổng GDT thật đã lưu, chứa bản thể hiện hóa đơn do chính GDT dựng **và toàn bộ bundle JS** (nơi tìm ra endpoint `export-xml` — §4.5). Kiểm lại được offline, không cần đăng nhập.
- `scripts/do-hsgoc-u37.mjs` — script chỉ-đọc đo cờ `hsgoc` + điều tra khóa `raw_json` (§4.6)
- `docs/doi_chieu_data/hoa_don_mau.pdf` — mẫu tham chiếu (⚠️ **nguồn Viettel vinvoice, không phải GDT** — §4.1). Sau khi đổi hướng, file này **không còn là mẫu đích** của U37; giữ cho U38.
- `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md` + `.claude/rules/ui.md` — chuẩn tầng trình bày, Registry
- `.claude/rules/security.md`, `.claude/rules/multi-tenant.md` — ràng buộc bảo mật & cách ly
- Backlog `[2026-07-27]` — `invoiceDoc.ts` chưa hưởng sửa thuế U35b (nợ chặn)
- Backlog `[2026-07-27]` — race export × sync (ca phải chặn ở yêu cầu 3)
- Backlog `[2026-07-28]` — bẫy GRANT migration
- Backlog `[2026-07-16]` — hạn mức 10 lượt tải/tháng (link công khai là một dạng "lượt tải" cần đếm)
- `KHAO_SAT_TINH_NANG_NIBOT.md` — đối thủ có `PDF.ZIP` + `AIO.PDF`; PDF gốc có logo phải mua dịch vụ DOLAGO

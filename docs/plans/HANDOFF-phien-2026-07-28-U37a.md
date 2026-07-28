# Bàn giao phiên 2026-07-28 → phiên sau — U37a XONG, tiếp theo là U37b

> **Câu lệnh gọi ở phiên sau:** *"làm tiếp U37b"* → đọc file này trước, rồi
> `docs/plans/U37-HO-SO-KHOI-DONG-xuat-hoa-don-theo-mau.md` §8 (mục U37b).
> **KHÔNG cần đọc lại toàn bộ hồ sơ U37** — mọi thứ cần biết để bắt đầu nằm ở đây.

| | |
|---|---|
| **Đơn vị** | U37 — Xuất hóa đơn: tải hồ sơ gốc từ GDT → gói ZIP → link chia sẻ công khai ~30 ngày |
| **Trạng thái** | **U37a XONG cả 3 lát, đã review chéo, đã deploy.** U37b chưa bắt đầu |
| **Ưu tiên** | 1 (cao nhất trong backlog) — chỉ định trực tiếp của chủ dự án |
| **Nguồn chân lý** | `docs/plans/U37-HO-SO-KHOI-DONG-xuat-hoa-don-theo-mau.md` (§4.5–§4.7 bằng chứng, §8 thiết kế) |

---

## 1. Điều quan trọng nhất phải biết: hướng đã ĐỔI giữa phiên

Hồ sơ U37 ban đầu đặt bài toán "dựng bản thể hiện hóa đơn từ dữ liệu, in PDF giống mẫu chuẩn".
**Chủ dự án đã đổi hướng**: không dựng mới, **tải thẳng hóa đơn gốc từ GDT**. Tiền đề đó đã được
kiểm chứng đúng, và hóa ra tốt hơn kỳ vọng.

**Bốn quyết định cũ đã VÔ HIỆU** (chi tiết §3 của hồ sơ) — đừng thực thi chúng:

| Vô hiệu | Vì sao |
|---|---|
| QĐ-1 chỉ làm hóa đơn bán ra | Lý do loại mua vào là "không lấy được logo". Hết lý do ⇒ **làm cả hai chiều** |
| QĐ-2 định dạng trong ZIP là PDF | Thực tế là **XML gốc có chữ ký số + HTML bản thể hiện** |
| QĐ-4 logo người dùng tự tải lên | Không dựng bản thể hiện ⇒ **đường upload đầu tiên RA KHỎI phạm vi** |
| QĐ-8 in tuyên bố "không thay thế hóa đơn gốc" | File **chính là** bản gốc ⇒ in lên là **sai sự thật** |

**Còn hiệu lực:** QĐ-3 (trường rỗng để trống), QĐ-5 (`docs.tourdao.vn`), QĐ-6 (lifecycle 30 ngày),
QĐ-7 (cảnh báo có checkbox + thu hồi + audit log).

---

## 2. Bằng chứng ĐÃ KIỂM CHỨNG — dùng lại, TUYỆT ĐỐI không kiểm lại

Bước R đã đóng. Ba kết quả dưới đây là nền của toàn bộ thiết kế:

**(a) Endpoint GDT** (§4.5 — offline, từ bundle JS của chính cổng GDT, tái lập không cần đăng nhập):
`GET /api/{query|sco-query}/invoices/export-xml?nbmst&khhdon&shdon&khmshdon` + `Authorization: Bearer`
→ blob ZIP. Bốn tham số **trùng khít** `/invoices/detail`. **GDT KHÔNG có endpoint PDF hóa đơn nào.**

**(b) Bên trong ZIP** (§4.7 — probe thật `scripts/probe-export-xml-u37.mjs`): 317.636 byte, **5 file** —
`invoice.xml` (10 KB, bản gốc ký số), **`invoice.html` (32 KB, bản thể hiện GDT dựng SẴN)**,
`details.js` + `viewinvoice-bg.jpg` + `sign-check.jpg` (~275 KB = **86%**, giống hệt nhau ở mọi hóa đơn).
Hóa đơn không có bản gốc → **HTTP 500** + `{"message":"Không tồn tại hồ sơ gốc của hóa đơn."}`.

**(c) Dữ liệu ta có** (§4.6 — `node scripts/do-hsgoc-u37.mjs`, chỉ SELECT): `hsgoc` có ở **100%**
trong 33.945 hóa đơn (giá trị là UUID). 64 hóa đơn `null`, **toàn bộ** thuộc `purchase/normal`
(~19,9% nhóm đó). `raw_json` có **152 khóa cấp 1**, gồm sẵn `tgtttbchu` (tiền bằng chữ) và `qrcode`.

> **Hệ quả lớn:** GDT kèm sẵn bản thể hiện HTML ⇒ yêu cầu "nhìn thấy tờ hóa đơn" **đã được đáp ứng
> miễn phí**. **U38 co lại gần như không còn lý do tồn tại** — chỉ cần nếu muốn PDF in hàng loạt.

---

## 3. U37a đã làm xong những gì (đừng làm lại)

| Lát | Commit | Nội dung |
|---|---|---|
| 1 | `c133bcf` | Adapter `getInvoiceOriginalZip` + `EXPORT_XML_ENDPOINTS` + mã lỗi `NO_SOURCE_DOCUMENT` + tuỳ chọn `isPermanentError` cho `fetchWithRetry` + contract test |
| 2 | `44db2e2` | Bảng `tep_hoa_don_goc` + migration `0019` (RLS + **FORCE** + **GRANT**) |
| — | `750aa3d` | `scripts/hau-kiem-bang.mjs` — hậu kiểm bảng sau migrate |
| 3 | `c217a24` | `tachHoSoGoc` + `HoSoGocMessage` + kho DB + `runHoSoGocJob` + binding R2 cho sync-worker + định tuyến queue |
| vá | `5d45fd8` | Hai nhánh test còn thiếu + ràng buộc tenant cho U37b + backlog nợ `deps.ts` |

**Trạng thái hạ tầng:**
- Migration `0019` **đã áp production**, hậu kiểm `node scripts/hau-kiem-bang.mjs tep_hoa_don_goc` → **8/8 đạt** (bảng, RLS ENABLE, RLS FORCE, policy, `vat_app` có S/I/U và KHÔNG có DELETE).
- `vat-sync-worker` **đã deploy** 2026-07-28, version `e7a641fc-eaca-4542-95a4-0de0e1cabcf7` (100%), binding `env.RAW (vat-raw)` xác nhận có trong output deploy.
- Toàn bộ đã push lên `feat/cloudflare-stack-u0`.
- Review chéo: `contract-guardian`, `security-reviewer`, `dod-auditor` — **không Critical/Major nào**.

**Chưa có producer.** Không chỗ nào enqueue message `kind:"hoso"` — đó chính là việc của U37b.
Nên deploy vừa rồi **chưa đổi hành vi gì** của hệ thống đang chạy.

---

## 4. U37b — việc tiếp theo, kèm mọi cạm bẫy đã biết

Thiết kế đầy đủ ở hồ sơ §8 mục "U37b". Tóm tắt + những gì phiên này học được:

### 4.1 🔴 Ràng buộc BẮT BUỘC về tenant (phát hiện ở review bảo mật)

`runHoSoGocJob` **tin thẳng** `msg.ref` trong message, không tra lại `hoa_don` theo `tenantId`.
Khi dựng producer, `HoSoGocMessage.ref` **PHẢI** dựng từ chính hàng `hoa_don` đã lọc đúng
`tenant_id` của phiên đăng nhập — **không nhận `ref` từ client**. FK ghép `(tenant_id, hoa_don_id)`
là lưới an toàn cuối (insert sẽ vỡ nếu sai tenant), **không thay** cho việc dựng đúng.

### 4.2 Gói ZIP phải PHẲNG, tài nguyên tĩnh dùng chung MỘT bộ

`invoice.html` tham chiếu 3 tài nguyên bằng **tên phẳng không tiền tố**, không nhúng base64. Nên đặt
phẳng là chạy đúng **mà không phải sửa một ký tự nào** trong HTML:

```
details.js  viewinvoice-bg.jpg  sign-check.jpg     ← MỘT lần cho cả gói (đọc từ hoadon-goc/_chung/)
<khhdon>-<shdon>.html   <khhdon>-<shdon>.xml       ← mỗi hóa đơn ~42 KB
bao-cao.txt                                        ← hóa đơn không lấy được
```

500 hóa đơn ≈ **21 MB** thay vì ~160 MB. Dùng lại `packages/export/src/zipStream.ts` (`fflate`, STORE).
⚠️ Hai hóa đơn khác `nbmst` vẫn có thể trùng `<khhdon>-<shdon>` — `zipStream.ts` có `uniqueName` thêm
hậu tố, **phải kiểm lại rằng tên sinh ra vẫn ghép đúng cặp `.xml`/`.html`**.

### 4.3 Không đi qua `apps/api/src/storage.ts`

Helper đó **đọc trọn file vào RAM** (`storage.ts:14`) — trần cứng với gói nhiều nghìn hóa đơn.
Đường gói phải stream.

### 4.4 Bucket công khai — ba cạm bẫy tài liệu Cloudflare ghi rõ

- Bucket **`vat-chia-se` CHƯA TỒN TẠI** (`wrangler r2 bucket list` xác nhận hiện chỉ có `vat-raw`).
- **Không bật `r2.dev`**; nếu lỡ bật để thử thì **phải tắt** — quên tắt là vẫn lộ dù đã gắn tên miền.
- Lifecycle: **một** rule theo prefix (trần 1000 rule/bucket), và UI phải nói **"khoảng 30 ngày"**
  (Cloudflare xóa trong vòng 24h sau mốc, không đúng phút).
- Khóa: `goi-hoa-don/<YYYY-MM>/<token ngẫu nhiên ≥128-bit base32url>.zip`. **Tuyệt đối không** nhúng
  MST, tên doanh nghiệp, khoảng ngày hay `tenant_id` — khóa **là** thứ duy nhất bảo vệ file.

### 4.5 Giao diện

- Nút mới trong `hanhDongPhu` của `FilterBar` (`InvoicesPage.tsx:130-150`), cạnh `InvoiceExportButtons`.
- `.claude/rules/ui.md:23`: đây là **hành động nặng chạy nền** — tên/vị trí phải phản ánh đúng, **không**
  đặt ngang hàng "Xuất Excel" (hành động nhẹ, tức thời).
- **`Modal` CHƯA tồn tại** trong `components/ui/primitives.tsx`. Cần hộp thoại thì **thêm primitive**,
  không tô kiểu nội tuyến trong `features/` — `test/conventions/ui-luat.test.ts` sẽ đỏ.
- Nhãn trường mới khai trong Registry `packages/domain/src/registry.ts`, không gõ chuỗi rời.

### 4.6 Khâu kiểm tra (yêu cầu gốc số 3)

Cổng tự động, không phải nhìn bằng mắt: đối chiếu **số lượng** XML trong gói với số hóa đơn thỏa bộ lọc;
hóa đơn GDT từ chối → vào **báo cáo kèm gói**, không phát hành im lặng; 0 hóa đơn thành công → **không
phát hành link**.

---

## 5. Cạm bẫy hạ tầng đã đụng phải trong phiên này — sẽ đụng lại

### 5.1 🔴 `_journal.json` có mốc `when` LỆCH — bẫy ADR-0008 còn nguyên

`drizzle-kit generate` đặt `when` = thời điểm thật, nhưng `idx 15..18` trong journal mang mốc **tương lai**
(2026-08-02). Migration mới sinh sẽ có `when` **nhỏ hơn** ⇒ `drizzle-kit migrate` in
`[✓] migrations applied successfully!` mà **KHÔNG áp gì**.

**Mọi migration sinh mới từ nay đều dính**, cho tới khi mốc thật vượt 2026-08-02. Cách né đã dùng cho
`0019`: đặt `when = <mục trước>.when + 60000`. **Luôn hậu kiểm** bằng `node scripts/hau-kiem-bang.mjs <bảng>`
— đừng tin báo cáo của công cụ. Còn một chỗ lệch có sẵn ở `idx 5` chưa rõ ảnh hưởng tới CLI (xem backlog).

### 5.2 `drizzle-kit` KHÔNG sinh `FORCE ROW LEVEL SECURITY` lẫn `GRANT`

Cả hai phải viết tay trong migration. Dự án đã quên `GRANT` **hai lần** (0008, 0017), cả hai chỉ lộ ra ở
production. Khuôn đúng: `0019_u37a_tep_hoa_don_goc.sql` (có sẵn khối `DO $$ … IF EXISTS pg_roles … RAISE WARNING`).

### 5.3 Thêm `kind` mới vào `VatSyncQueueMessage` là việc NGUY HIỂM

`phanLoaiMessage` (`fanout.ts`) dùng "cái gì không phải detail/audit/delta thì là header". Thêm một `kind`
mà quên guard ⇒ message mới **âm thầm chạy như job đồng bộ CẢ THÁNG**: không lỗi biên dịch, không lỗi
runtime. Phiên này đã dính và test bắt được (`expected 'header' to be 'hoso'`). Nhớ vá **cả** `dlqConsumer.ts`.

### 5.4 Máy khác dùng chung cây thư mục

Trong phiên có một commit lạ (`70d328c docs(U36)`) chen vào dải push — của phiên khác. **Luôn `git log`
kiểm trước khi push/deploy**, và hỏi "worker nào cần deploy lại" sau mỗi lần lệch nhánh.

---

## 6. Nợ đã ghi, chưa làm

- **`deps.ts` của sync-worker chưa từng có test** — `makeHoSoGocJobDeps` là hàm `deps` đầu tiên mang logic
  có thể sai thật (thứ tự ghi R2→DB, chọn khóa tài nguyên chung, số lần `put`). Gợi ý: R2 giả sẵn có ở
  `apps/api/test/helpers.ts`. *(backlog `[2026-07-28]`)*
- **`_journal.json` lệch `idx 5`** — chưa rõ CLI có bỏ qua `0005` trên DB dựng mới/DR không. *(backlog)*
- **`fetchWithRetry` nhánh lỗi MẠNG dùng `sleep` thật**, bỏ qua `opts.sleepFn` tiêm được — lỗi có sẵn, cố ý
  không sửa vì lạc phạm vi. Chưa ghi backlog.
- **Hạn mức 10 lượt tải/tháng** — link công khai là một dạng "lượt tải" cần đếm. *(backlog `[2026-07-16]`)*
- **`CLAUDE.md` mục "Thứ tự triển khai" dừng ở U16b**, chưa liệt kê U17–U37. Cần một lượt cập nhật lộ trình
  riêng — chủ dự án chưa quyết.
- **`FANOUT_BACKPRESSURE_DELAY_SEC = 180`** (vars đang chạy) vs đề xuất 300 — treo chờ chủ dự án từ phiên trước.

---

## 7. Nghiệm thu U37b khi xong (kế thừa §8 hồ sơ)

1. `make lint && make test` xanh; coverage không tụt dưới 80%.
2. Test cách ly tenant cho bảng chia sẻ mới.
3. `node scripts/kiem-quyen-bang.mjs` không báo thiếu quyền cho bảng mới.
4. **Nghiệm thu thật:** chọn kỳ có hóa đơn cả hai chiều → bấm xuất → theo dõi tiến trình → mở link ở cửa sổ
   ẩn danh (không đăng nhập) tải được → giải nén, **mở `invoice.html` bằng trình duyệt thấy đúng tờ hóa đơn**
   → đối chiếu số hóa đơn/MST/tổng tiền khớp danh sách → bấm thu hồi → link trả 404.
5. `wrangler r2 bucket lifecycle list vat-chia-se` cho thấy đúng một rule 30 ngày theo prefix; `r2.dev` tắt.
6. Review bắt buộc: `dod-auditor` **+ `security-reviewer`**.

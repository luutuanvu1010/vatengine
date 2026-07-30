# Nghiên cứu: loại bỏ tính năng xuất CSV trên toàn hệ thống

- **Ngày:** 2026-07-30
- **Mã commit khi rà soát:** `7accb15` (nhánh làm việc, cây sạch trừ 1 file untracked — xem §7)
- **Loại tài liệu:** nghiên cứu → **đã chốt và ĐÃ THI HÀNH** trong cùng phiên. Kết quả thi hành ở §10 (đọc §10 trước nếu bạn chỉ cần biết hiện trạng).
- **Câu hỏi:** bỏ được tính năng "xuất CSV" khỏi cả backend và frontend không? Bỏ tới đâu, mất gì, vỡ gì?
- **Quyết định của chủ dự án (2026-07-30):** **Phương án A+** — ẩn bằng cờ, giữ lõi mã. Kèm quyết định ẩn luôn trang "Kết xuất & Convert".

---

## 1. Kết luận ngắn (trả lời trước, giải thích sau)

**Bỏ được — nhưng nên bỏ ở *lối vào người dùng*, không nên xoá *lõi mã*.**

Ba phát hiện quyết định:

1. **CSV độc lập hoàn toàn với Excel.** Bỏ CSV không làm vỡ xuất XLSX, không vỡ file kế toán theo profile, không vỡ ZIP hồ sơ gốc. *(Đã kiểm chứng: `packages/export/src/xlsx.ts` không có một lần nhắc "csv"; hai bộ encoder cùng đứng trên `RenderColumn` của `columns.ts`, không ai gọi ai.)*
2. **Không tồn tại luồng NHẬP CSV nào.** Toàn hệ thống không đọc CSV làm dữ liệu vào — đối chiếu trả JSON, không có route import, không có `papaparse`/`csv-parse`/`<input type="file">`. Nên không có nguy cơ vỡ đối chiếu hay nhập liệu. *(Đã kiểm chứng bằng quét toàn repo.)*
3. **⚠️ Nhưng CSV đang bị dùng làm "kính hiển vi" của bộ test backend.** Có **38 lượt** gọi `?format=csv` trong `apps/api/test`, phần lớn **không kiểm CSV** mà kiểm những thứ khác: cách ly tenant, RBAC, mask audit log, trần body, chọn hóa đơn theo `ids`. Chúng chọn CSV vì CSV là **văn bản đọc được từng dòng** (`csvLines()`, `csvOf()` — 15 lượt dùng), còn XLSX là nhị phân nên khó assert.

⇒ Xoá `"csv"` khỏi `ExportFormat` đồng nghĩa **phải viết lại khoảng 40 ca test cách ly/phân quyền sang XLSX nhị phân**. Đó là việc rủi ro cao, dễ làm **yếu đi** đúng những test đang bảo vệ ranh giới tenant — cái đắt nhất của dự án. Lợi ích thu về (bớt 175 dòng `csv.ts`) không tương xứng.

**Đề xuất: Phương án A+ ở §4** — ẩn CSV khỏi giao diện bằng cờ tính năng, dọn văn bản hứa hẹn với khách, giữ lõi CSV làm hạ tầng kiểm thử. Đúng tiền lệ đã dùng cho trang Đối chiếu (`SHOW_RECONCILE`).

---

## 2. Bản đồ điểm chạm (đã kiểm chứng 2026-07-30)

### 2.1 Lối vào của người dùng — chỉ có 2 chỗ

| # | Vị trí | Người dùng thấy gì |
|---|---|---|
| 1 | `apps/web/src/features/invoices/InvoiceExportButtons.tsx:44-46` | Nút **"Xuất CSV"** cạnh "Xuất Excel", trong màn Tra cứu hóa đơn |
| 2 | `apps/web/src/features/exports/ExportsPage.tsx:103-112` | Thẻ chọn **"CSV (.csv)"** ở trang Kết xuất & Convert (+ tóm tắt `:184`, hướng dẫn `:213`) |

Khai báo kiểu ở tầng web: `apps/web/src/types/api.ts:220` — `ExportFormat = "xlsx" | "csv"`.
Luồng tải dùng chung, **không có gì riêng cho CSV**: `taiXuatHoaDon.ts:12-26` → `apiClient.createExport/downloadExport` → `exportFilename.ts:14-24` (`…​.csv`).

### 2.2 Văn bản hứa hẹn với khách (dễ bỏ sót nhất)

Bỏ nút mà không sửa những dòng này ⇒ phần mềm tự nói dối:

- `apps/web/src/features/auth/LoginPage.tsx:45` — "…kết xuất Excel **hoặc CSV**…" (trang đăng nhập, ai cũng đọc)
- `apps/web/src/lib/faq.ts:44` — "…cho kết xuất Excel/CSV…"
- `apps/web/src/features/dashboard/DashboardPage.tsx:96` — thẻ tắt "Xuất **xlsx/csv** theo profile"
- `apps/web/src/features/invoices/InvoicesPage.tsx:267-269` — hướng dẫn "Tùy chỉnh cột và Xuất Excel / CSV"
- `apps/web/src/lib/changelog.ts:50, 72, 85, 96, 116, 171` — 6 mục lịch sử cập nhật. **Lưu ý:** changelog là *lịch sử*, mô tả điều đã đúng vào thời điểm đó → **KHÔNG sửa lại quá khứ**, chỉ thêm một mục mới thông báo việc bỏ CSV.

### 2.3 Backend — tập trung trong một file duy nhất

`apps/api/src/routes/exports.ts`:

| Dòng | Nội dung |
|---|---|
| `:32` | `EXPORT_ID_RE` hardcode `csv` trong danh sách đuôi hợp lệ |
| `:42` | `CONTENT_TYPE.csv = "text/csv; charset=utf-8"` |
| `:109`, `:195` | sinh id/đuôi file `.csv` |
| `:120-124` | nhánh render CSV → `csvStreamWithLines()` |
| `:202-203` | nhánh CSV của convert kế toán → `accountingCsvStream()` |
| `:244` | `GET /exports/:id` fallback định dạng `: "csv"` |
| `:158`, `:213` | ghi `audit_log` với `doiTuong = format` ⇒ **kho audit đang lưu sẵn số lần khách xuất CSV** (dùng được ở §6) |

**Không có schema Zod nào liệt kê `'csv'`** — validate bằng type-guard `isExportFormat` (`packages/export/src/formats.ts:8`). Nguồn sự thật duy nhất: `formats.ts:4,6`.

### 2.4 packages/export — lõi

- `src/csv.ts` (175 dòng) — thuần CSV, xoá được cả file. Hàm sản xuất thật chỉ **một**: `csvStreamWithLines` (`:128`). Bốn wrapper `toCsv/csvStream/csvHeaderLine/csvRowLine` (`:103-118`) **chỉ test gọi**, không nơi nào trong `apps/*` dùng → đã là mã chết ngay hôm nay.
- `src/index.ts:19-27, 42` — re-export 8 ký hiệu CSV.
- `src/accountingFile.ts:6, 31, 35-40` — *nhánh* sang CSV; đường XLSX không đổi một dòng nếu bỏ.
- `src/columns.ts:265` `nhanTram` — chỉ `csv.ts:57` gọi ⇒ **thành mã chết nếu bỏ CSV** (và kéo tụt coverage; ngưỡng 80% ở `packages/export/vitest.config.ts:15`).
- `test/helpers.ts:93-96` `parseCsv()` — parser để test đọc lại file vừa xuất; cũng thành mã chết.

### 2.5 Các định dạng còn lại nếu bỏ CSV

`ExportFormat = "xlsx" | "csv" | "xml.zip" | "html.zip"`.

- **Giao diện chỉ phơi 2 định dạng**: xlsx + csv. `xml.zip` và `html.zip` là **API-only**, khách chưa bao giờ thấy.
- File kế toán theo profile (`/exports/convert`) hỗ trợ **đúng xlsx hoặc csv**; profile khả dụng duy nhất là `reference`.
- **PDF chưa có** (đang bị test khoá là không hợp lệ). ZIP hồ sơ gốc GDT (U37b) là đường riêng, không qua `ExportFormat`.

⇒ Bỏ CSV thì **khách chỉ còn Excel**. Đây là điểm cần chủ dự án cân: người dùng kế toán quen import CSV vào Misa/Fast; nếu profile kế toán chỉ còn XLSX thì luồng "tích hợp kế toán" hẹp lại.

---

## 3. Chi phí test — con số cụ thể

| Nơi | Sẽ đỏ nếu bỏ CSV | Bản chất |
|---|---|---|
| `packages/export/test/unit/csv.test.ts` | **cả file, 12 ca** | thật sự về CSV — xoá kèm là hợp lý |
| `packages/export/test/unit/lineDetail.test.ts` | ~9 ca (`:274, :303, :322, :439-467, :520, :171`) | về **dòng hàng**, chỉ *dùng* CSV để đọc kết quả |
| `packages/export/test/unit/accountingFile.test.ts` | 5 ca (`:72-100`, `:152`) | về **profile kế toán** |
| `packages/export/test/unit/formats.test.ts` | 2 ca (`:7`, `:11`) | danh sách định dạng |
| `packages/export/test/integration/lineDetailExport.test.ts` | 1 ca (`:80`) | **cách ly tenant** |
| `apps/api/test/integration/exports.route.test.ts` | ~20 ca | **cách ly, audit mask, 401, trần body, chọn `ids` (T1–T8b)** — không phải về CSV |
| `apps/api/test/integration/convert.route.test.ts` | ~15 ca | tương tự |
| `apps/api/test/integration/rbac.route.test.ts` | 3 ca (`:45, :55, :73`) | **phân quyền** |
| `apps/web/test/features/*` | 5 ca (`invoiceExportButtons`, `invoiceSummaryStats`, `exportFilename`, `apiClient.methods`) | về nút/tên file |

**Tổng: khoảng 70 ca test phải xử lý.** Trong đó chỉ ~14 ca thật sự nói về CSV; **~50 ca là test cách ly/phân quyền/dòng hàng đang mượn CSV làm phương tiện quan sát.** Đây là con số nói lên mọi thứ về phương án nên chọn.

---

## 4. Ba phương án

### Phương án A+ — Ẩn khỏi người dùng, giữ lõi (ĐỀ XUẤT)

Bỏ CSV khỏi trải nghiệm khách; backend vẫn hiểu `format=csv`; lõi `csv.ts` giữ nguyên làm hạ tầng kiểm thử.

**Việc phải làm** (~5 file mã + 1 file cờ, không đụng backend):

1. Thêm cờ `SHOW_CSV_EXPORT = false` vào `apps/web/src/lib/featureFlags.ts`, kèm **khối lịch sử quyết định** đúng khuôn `SHOW_RECONCILE` (ghi thêm dòng, không xoá dòng cũ).
2. `InvoiceExportButtons.tsx:44-46` — bọc nút CSV bằng cờ.
3. `ExportsPage.tsx:103-112, 184, 213` — bọc thẻ chọn CSV bằng cờ; giữ `xlsx` là mặc định (đã đúng, `:48`).
4. Sửa 4 câu văn: `LoginPage.tsx:45`, `faq.ts:44`, `DashboardPage.tsx:96`, `InvoicesPage.tsx:267-269` → chỉ nói "Excel".
5. `changelog.ts` — **thêm** một mục mới ("Tính năng xuất CSV tạm ngưng; dùng Excel"), không sửa 6 mục cũ.
6. Test: cập nhật 5 ca web (`invoiceExportButtons`, `invoiceSummaryStats`) + **viết mới `apps/web/test/features/csvHidden.test.tsx`** khoá cả hai điểm nối dây, để bật/tắt luôn là thay đổi có chủ đích (đúng khuôn `reconcileHidden.test.tsx`).
7. `types/api.ts:220` — **giữ nguyên** `"xlsx" | "csv"` (còn dùng cho tương lai + đúng với API).

- **Vỡ backend:** không. **Test backend phải sửa:** 0.
- **Đảo lại:** đổi một hằng số.
- **Rủi ro:** nút biến mất nhưng API vẫn nhận `format=csv` — chấp nhận được, đây là API nội bộ, không phải lỗ hổng.

### Phương án B — Xoá hẳn khỏi toàn hệ thống

Bỏ `"csv"` khỏi `ExportFormat`, xoá `csv.ts`, xoá nhánh CSV trong `exports.ts` + `accountingFile.ts`, xoá `nhanTram`, xoá `parseCsv`.

- **Thêm vào việc của A+:** viết lại ~50 ca test backend/package sang XLSX; phải bổ sung helper đọc XLSX trong test (chưa có tương đương `csvLines`); dọn mã chết `nhanTram`/`parseCsv`; sửa `EXPORT_ID_RE`, `CONTENT_TYPE`, fallback `:244`; cập nhật `wrangler.jsonc:42`, `docs/06-BINDING_MAP.md`, `CHECKLIST-NGHIEM-THU.md`.
- **Đảo lại:** phải viết lại từ đầu.
- **Rủi ro chính:** trong lúc chuyển ~50 ca test sang định dạng nhị phân, rất dễ *làm nhẹ* assert về cách ly tenant mà không ai nhận ra. Đây là loại hỏng hóc không kêu.
- **Chỉ nên chọn nếu** có quyết định dứt khoát rằng CSV vĩnh viễn không quay lại, và chấp nhận một đơn vị công việc riêng (U-mới) với review chéo tập trung vào bộ test cách ly.

### Phương án C — Ẩn cả trang Kết xuất

Nếu đằng nào cũng ẩn trang `/exports` (xem §7), thì lối vào CSV thứ hai tự mất, chỉ còn phải xử lý nút trong màn Tra cứu. Rẻ nhất — nhưng **phụ thuộc một quyết định khác chưa chốt**, nên không tự đứng được.

---

## 5. So sánh

| | A+ (ẩn bằng cờ) | B (xoá hẳn) | C (ẩn cả trang Kết xuất) |
|---|---|---|---|
| File mã phải sửa | ~6 | ~15 | ~4 |
| Ca test phải viết lại | ~5 | **~70** | ~5 |
| Nguy cơ làm yếu test cách ly | không | **cao** | không |
| Đảo lại | 1 hằng số | viết lại | 1 hằng số |
| Mã chết còn lại | `csv.ts` (có ích: hạ tầng test) | không | như A+ |
| Phụ thuộc quyết định khác | không | không | **có** |

---

## 6. Trước khi chốt: một phép đo nên làm (nguyên tắc bằng chứng)

**CHƯA KIỂM CHỨNG:** có khách nào đang thực sự dùng CSV không. Toàn bộ nghiên cứu này nói về *mã*, không nói về *hành vi người dùng*.

Nhưng đo được, không cần đoán: `exports.ts:158, 213` ghi `audit_log` với `doiTuong = format`. Truy vấn đếm số lượt `doiTuong='csv'` so với `'xlsx'` theo tenant trong 30–90 ngày là đủ để quyết định có nên bỏ hay không, và bỏ có cần thông báo trước cho khách nào không.

⇒ **Đề nghị chạy phép đo này trước khi thi hành bất kỳ phương án nào.** Nếu CSV chiếm tỷ trọng đáng kể ở một vài tenant, phương án A+ (đảo được) càng đúng; nếu ~0 lượt, phương án B mới đáng cân nhắc.

---

## 7. Vướng mắc phát hiện thêm (ngoài phạm vi, nhưng chặn đường)

`apps/web/test/features/exportsHidden.test.tsx` **đang untracked (chưa commit)** và khẳng định trang `/exports` phải bị ẩn bằng cờ `SHOW_EXPORTS`. Nhưng:

- `apps/web/src/lib/featureFlags.ts` **chỉ có `SHOW_RECONCILE`** — không có `SHOW_EXPORTS`.
- `Sidebar.tsx:23`, `AppRouter.tsx:108-115`, `DashboardPage.tsx:95-97` vẫn phơi `/exports` bình thường.

⇒ Có một việc "ẩn trang Kết xuất" **đang làm dở**, và file test đó **hiện đang ĐỎ độc lập với chuyện CSV**. Phải xử lý (hoàn tất hoặc xoá file) trước khi bắt đầu việc CSV, nếu không sẽ không phân biệt được test đỏ do đâu. Đây cũng là lý do §4-C không tự đứng được: cần biết trang Kết xuất sống hay chết trước.

---

## 8. Quyết định cần chủ dự án chốt

1. **Bỏ tới mức nào?** A+ (ẩn, đảo được) / B (xoá hẳn) / chờ sau khi giải quyết §7.
2. **Có chạy phép đo audit_log ở §6 trước không?**
3. **File kế toán theo profile có bỏ CSV luôn không?** Nếu bỏ, khách chỉ còn XLSX để đưa vào phần mềm kế toán — cần xác nhận đây là điều muốn.
4. **Trang `/exports` (§7): sống hay ẩn?**

---

## 9. Nguồn bằng chứng

Tất cả nhận định ở §2–§3 lấy từ đọc mã trực tiếp tại commit `7accb15` ngày 2026-07-30 (grep toàn repo, loại `node_modules`/`dist`/`coverage`). Các con số 38 lượt `format=csv`, 15 lượt `csvLines/csvOf`, 175 dòng `csv.ts` là kết quả đếm bằng lệnh, tái lập được:

```
grep -rn "format=csv" apps/api/test | wc -l          # 38
grep -rn "csvLines\|csvOf" apps/api/test | wc -l     # 15
wc -l packages/export/src/csv.ts                     # 175
grep -c csv packages/export/src/xlsx.ts              # 0  ← CSV không phải nền của XLSX
```

Chưa kiểm chứng: hành vi người dùng thật (§6).

---

## 10. ĐÃ THI HÀNH — phương án A+ (2026-07-30, cùng phiên)

Chủ dự án chốt **A+** (ẩn bằng cờ, giữ lõi) và chốt **ẩn luôn trang Kết xuất**. Đã làm:

### 10.1 Làm rõ món dở ở §7 trước

`apps/web/test/features/exportsHidden.test.tsx` **không phải việc bị bỏ quên**: chú thích trong file ghi *"tắt 2026-07-30 — chủ dự án ẩn khỏi giao diện người dùng, giữ nguyên mã"* — nó là test viết trước (TDD) trong cùng ngày, phần cài cờ chưa làm. Đã hiện thực để nó xanh, không xoá.

### 10.2 Hai cờ mới trong `apps/web/src/lib/featureFlags.ts`

| Cờ | Giá trị | Điều khiển |
|---|---|---|
| `SHOW_EXPORTS` | `false` | Trang "Kết xuất & Convert": mục menu + route + lối tắt ở Tổng quan |
| `SHOW_CSV_EXPORT` | `false` | Nút "Xuất CSV" ở màn Tra cứu + thẻ chọn CSV trong trang Kết xuất |

Mỗi cờ có **khối lịch sử quyết định** đúng khuôn `SHOW_RECONCILE` (ghi thêm dòng, không xoá dòng cũ). Khối `SHOW_CSV_EXPORT` ghi rõ **vì sao ẩn chứ không xoá mã** (con số 38 lượt `format=csv` là hạ tầng test), để lần sau không ai "dọn cho gọn" mà phá bộ test cách ly.

### 10.3 Điểm nối dây đã sửa

| File | Việc |
|---|---|
| `components/layout/Sidebar.tsx` | mục `/exports` lọc qua `SHOW_EXPORTS` (cờ ở tầng danh sách, RBAC giữ ở `visible`) |
| `routes/AppRouter.tsx` | route `exports` bọc cờ; tắt ⇒ rơi vào catch-all `*` → về Tổng quan |
| `features/dashboard/DashboardPage.tsx` | lối tắt "Kết xuất" bọc cờ; mô tả bỏ chữ "csv" |
| `features/invoices/InvoiceExportButtons.tsx` | nút "Xuất CSV" bọc `SHOW_CSV_EXPORT` |
| `features/exports/ExportsPage.tsx` | thẻ chọn CSV bọc cờ — **vẫn bọc dù cả trang đang ẩn**, để bật lại trang không làm CSV lặng lẽ quay về |
| `features/auth/LoginPage.tsx`, `lib/faq.ts`, `features/invoices/InvoicesPage.tsx` | dọn 3 câu hứa "Excel hoặc CSV" → chỉ "Excel" |
| `lib/changelog.ts` | **thêm** mục `v2.3` (30/07) thông báo bỏ CSV + ẩn trang Kết xuất; **không sửa** 6 mục cũ (changelog là lịch sử) |

**Backend: không sửa một dòng.** `POST /exports?format=csv` vẫn nhận CSV có chủ đích.

### 10.4 Test

- **Mới:** `apps/web/test/features/csvHidden.test.tsx` — 3 ca: nút CSV vắng ở màn Tra cứu, **nút Excel VẪN còn** (chống xanh-giả kiểu "mất cả hai nút mà test vẫn xanh"), thẻ CSV vắng ở trang Kết xuất.
- **Sửa vì đổi ý đồ hiển thị:** `invoiceExportButtons` (bỏ ca "bấm Xuất CSV" — không còn nút; độ phủ `format` vẫn ở `apiClient.methods.test.ts`), `invoiceSummaryStats`, `auth`, `dashboardSettings`.
- **Ghi nhận trung thực một chỗ YẾU ĐI:** hai ca trong `auth.test.tsx` khẳng định vai `ke_toan` không thấy nav "Kết xuất" — nay mục đó vắng với **mọi** vai nên hai ca đó xanh kể cả khi RBAC hỏng. Đã ghi cảnh báo ngay trên đầu ca test. Phần RBAC còn khoá thật ở "Kết nối tài khoản thuế" và `test/lib/rbac.test.ts`.

### 10.5 Kiểm chứng (tái lập được)

```
make lint                      # exit 0 — Biome 542 file sạch + tsc --noEmit toàn workspace
npx vitest run <apps/web>      # 59/59 file, 447/447 ca XANH (chạy chia 3 lượt do trần thời gian)
```

Không chạy lại `apps/api` / `packages/*`: không file nào trong hai nhóm đó bị sửa.

### 10.6 Còn nợ

- **Chưa commit** — để chủ dự án xem diff trước.
- **Chưa đo `audit_log`** (§6). Vẫn nên đo: nếu có tenant dùng CSV nhiều thì cân nhắc thông báo riêng cho họ. Đảo lại chỉ mất một hằng số.
- **Tính năng file kế toán theo profile hiện không có lối vào nào** cho khách (đi theo trang Kết xuất). Đã ghi vào `docs/BACKLOG-y-tuong-va-de-xuat.md` đề xuất chuyển sang màn Tra cứu.

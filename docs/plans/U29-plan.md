# U29 — Lát A: Xuất đủ field nghiệp vụ (header + dòng hàng)

> **Mục tiêu cao nhất của đơn vị này:** người dùng tải file kết xuất và **không phải mở
> lại cổng thuế** để tra những trường nghiệp vụ đã có sẵn trong CSDL.
>
> Trạng thái: ✅ ĐÃ HIỆN THỰC 2026-07-20 — `make lint` EXIT=0, `make test` EXIT=0
> (toàn workspace xanh; riêng `@vat/export` 109/109, đi từ 21 test ĐỎ → xanh theo TDD).
> Cổng review chéo (§bước 6 `start-unit`) và nghiệm thu bằng mắt §5.4 chờ xử lý.
> Lập theo `.claude/skills/plan-unit`. Ngày lập: 2026-07-20.
> Nền: worktree `feat/export-du-field`, trunk `b37e97c` (sau PR #20 "fix lọc theo ngày").

## 0. Vì sao cần U29 (bằng chứng đọc từ mã, không suy đoán)

Khảo sát 2026-07-20 trên trunk `b37e97c`: một số trường **đã đồng bộ và đã nằm trong CSDL**
nhưng **không xuất hiện trong file kết xuất**. Người dùng có dữ liệu mà không lấy ra được.

| Trường | Có trong CSDL? | Có trong file xuất? | Bằng chứng |
|---|---|---|---|
| `ttcktmai` (chiết khấu) | ✅ | ❌ | `packages/db/src/schema/hoaDon.ts:43` vs `columns.ts:15-32` |
| ~~`tgia` (tỷ giá)~~ | ✅ | ❌ | **LOẠI khỏi U29** — xem M3 |
| `ncnhat` (ngày cập nhật) | ✅ | ❌ | `hoaDon.ts:38` vs `columns.ts:15-32` |
| `ltsuat` (mã thuế suất dòng) | ✅ | ⚠️ chỉ xml/html | `lineRows.ts:39` nạp rồi, `columns.ts:87-98` không render |
| `tsuatTien` (tiền thuế dòng) | ✅ | ⚠️ chỉ xml/html | `lineRows.ts:41` nạp rồi, `columns.ts:87-98` không render |
| `tenHangDau`/`soDongHang`/`tongSoLuong` | ✅ (tính được) | ❌ | `listInvoices.ts:53-59` có, `rows.ts:12` không |

`ltsuat`/`tsuatTien` là ca rõ nhất: `fetchLinesForInvoices` **đã đọc lên khỏi DB** rồi bỏ
không render ở xlsx/csv — chi phí thêm bằng 0.

**Quyết định chủ dự án 2026-07-20** (chốt trong phiên khảo sát):
- Độ đầy đủ = **"đầy đủ nghiệp vụ"** — cả 8 trường trên.
- Cách lấy 3 trường tóm tắt = **phương án 3a**: mở rộng truy vấn export bằng sub-select,
  **tái dùng đúng logic `listInvoices`**, để file xuất và bảng danh sách nói cùng một con số.

## 1. Phạm vi

**Trong phạm vi:** bổ sung **5** cột cấp hóa đơn và 2 cột cấp dòng hàng vào mẫu cột kết
xuất chuẩn, mở rộng truy vấn export để cấp dữ liệu cho 3 cột tóm tắt, và thêm
`ColumnKind = "num"` để số thập phân hiện đủ (M1).

**NGOÀI phạm vi (đã chốt, không được nở):**
- ❌ Checkbox chọn dòng để xuất (lát B) — export vẫn chạy **theo bộ lọc**, không theo dòng chọn.
- ❌ Nhóm theo khách hàng (lát C) / nhóm theo sản phẩm (lát D).
- ❌ Đụng profile ánh xạ kế toán `reference` (U11).
- ❌ Đổi endpoint/hợp đồng API kết xuất (`apps/api/src/routes/exports.ts` không đổi chữ ký).
- ❌ Đổi bảng UI `InvoiceTable.tsx` — xem §6 phát hiện 1.

## 2. File sẽ tạo/sửa

**Sửa:**
- `packages/query/src/listInvoices.ts` — **tách** 3 sub-select thành helper dùng chung (xem §3.1).
- `packages/query/src/index.ts` — export helper mới.
- `packages/export/src/rows.ts` — `iterateInvoices` chọn thêm 3 cột tóm tắt; `ExportRow` nới kiểu.
- `packages/export/src/columns.ts` — `EXPORT_COLUMNS` +6 mục; `lineDetailRenderColumns()` +2 cột;
  `ExportColumn.key` nới từ `keyof HoaDonRow` sang `keyof ExportRow`.

**Tạo (test):**
- `packages/query/test/unit/lineSummary.test.ts` *(hoặc gộp vào test listInvoices sẵn có)*
- bổ sung ca vào `packages/export/test/unit/columns.test.ts`,
  `packages/export/test/unit/lineDetail.test.ts`,
  `packages/export/test/integration/rows.test.ts`.

**Không sửa (nhưng bị ảnh hưởng — phải còn xanh):** `csv.ts`, `xlsx.ts`, `invoiceDoc.ts`
đều đọc `EXPORT_COLUMNS` nên tự nhận cột mới; đây là đích đến, không phải tác dụng phụ.

## 3. Thiết kế

### 3.1 Chống nguồn sự thật thứ hai (ràng buộc cứng của Hiến pháp)

3 sub-select tóm tắt hiện nằm **inline** trong `listInvoices.ts:53-59`. Nếu chép sang
`rows.ts` sẽ có **hai bản cùng một phép tính** — đúng thứ Hiến pháp cấm ("không nhân đôi
danh sách cột", `columns.ts:2`). Vì vậy 3a hiện thực bằng cách **tách helper**:

```ts
// packages/query/src/lineSummary.ts (mới) — nguồn DUY NHẤT của 3 phép tóm tắt.
export function lineSummarySelect(tenantId: string) {
  return {
    tenHangDau: sql<string | null>`(select d.ten from ${dongHangHoa} d
      where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId}
      order by d.stt asc nulls last, d.id asc limit 1)`,
    soDongHang: sql<number>`(select count(*)::int from ${dongHangHoa} d
      where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId})`,
    tongSoLuong: sql<string | null>`(select sum(d.sluong) from ${dongHangHoa} d
      where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId})`,
  };
}
```

`listInvoices` và `iterateInvoices` cùng spread helper này. Đổi logic một lần, hai nơi theo.

> ⚠️ **Bẫy drizzle đã ghi ở `listInvoices.ts:50-52`:** `${hoaDon.id}` trong sub-select render
> thành `"id"` TRẦN → tự khớp `d.id`, **sai âm thầm**. Phải giữ nguyên chuỗi `hoa_don.id`
> viết tay. Điều kiện dùng lại: câu ngoài `FROM hoa_don` **không alias** — `iterateInvoices`
> (`rows.ts:41-46`) thỏa. Test §4 có ca canh chính xác cái bẫy này.

### 3.2 Kiểu `ExportRow`

`rows.ts:12` hiện là `typeof hoaDon.$inferSelect` — **trùng khít** `HoaDonRow`
(`listInvoices.ts:15`). Sau U29:

```ts
export type ExportRow = HoaDonRow & {
  tenHangDau: string | null;
  soDongHang: number;
  tongSoLuong: string | null;
};
```

(tức bằng `InvoiceListRow`; cân nhắc tái dùng thẳng `InvoiceListRow` để khỏi khai hai lần.)
Kéo theo `ExportColumn.key` phải nới `keyof HoaDonRow` → `keyof ExportRow`, và
`nativeRenderColumns()`/`cellFor()` đổi tham số theo. `cellFor` **không cần logic mới**:
`soDongHang` (number) và `tongSoLuong` (string) đều đi nhánh `int`, `ncnhat` (Date) đi nhánh
`date`, `ttcktmai` (numeric→string) đi nhánh `money`. Riêng nhánh `num` là **mới** (M1).

### 3.3 Cột thêm

Cấp hóa đơn — chèn theo trật tự nghiệp vụ, không nối đuôi:

**5 cột** (16 → **21**). `tgia` đã bị **loại khỏi phạm vi** — quyết định chủ dự án 2026-07-20, xem M3.

| key | label | kind | chèn sau |
|---|---|---|---|
| `ttcktmai` | Chiết khấu | `money` | `tgtcthue` |
| `ncnhat` | Ngày cập nhật | `date` | `tdlap` |
| `tenHangDau` | Tên hàng (dòng đầu) | `text` | `nmten` |
| `soDongHang` | Số dòng hàng | `num` | `tenHangDau` |
| `tongSoLuong` | Tổng số lượng | `num` | `soDongHang` |

Cấp dòng hàng (`lineDetailRenderColumns`): `Mã thuế suất` (`ltsuat`, text) chèn **trước**
`Thuế suất`; `Tiền thuế dòng` (`tsuatTien`, money) chèn **sau** `Thuế suất`.

## 4. Test viết trước (TDD)

| # | Test | Nhóm | Khẳng định |
|---|---|---|---|
| T1 | `EXPORT_COLUMNS` đủ **21** key đúng thứ tự; **không** có `tgia` | unit | mở rộng `columns.test.ts:45` |
| T2 | `ttcktmai` kind `money`; `ncnhat` kind `date`; `tongSoLuong`/`soDongHang` kind `num` | unit | numFmt/định dạng đúng |
| T2b | `tongSoLuong = "62.925"` xuất ô `{t:"num", v:"62.925"}` — **giữ nguyên 3 chữ số thập phân**, và ô xlsx **không** mang `s="2"` (không numFmt tiền) | unit | canh yêu cầu "đầy đủ thập phân" (M1); dữ liệu thật E4 |
| T3 | `lineDetailRenderColumns()` có `Mã thuế suất` + `Tiền thuế dòng` đúng vị trí | unit | `lineDetail.test.ts` |
| T4 | ba dòng `ltsuat="KCT"` / `"KKKNT"` / `"0%"` — cùng `tsuat=0` — xuất ra **ba giá trị phân biệt được** | unit | ca hồi quy cốt lõi: E3 chứng minh hiện đang gộp thành một chữ số `0` |
| T4b | dòng `ltsuat="KCT"` xuất **chuỗi** `KCT`, không rỗng/không `NaN` | unit | ép số làm mất mã chữ (`dongHangHoa.ts:25`) |
| T5 | HĐ có `ttcktmai` → csv & xlsx có ô đúng; HĐ `ttcktmai=null` → ô **trống**, không `0` | unit | `cellFor` trả `BLANK`; phân biệt "không chiết khấu" với "chưa có dữ liệu" |
| T5b | HĐ điều chỉnh giảm (`ttcktmai>0`, `tgtcthue<0`) xuất đủ cả hai giá trị, dấu âm giữ nguyên | unit | ca thật E2 (8 HĐ tới 60 triệu) |
| T6 | `iterateInvoices` trả `tenHangDau`/`soDongHang`/`tongSoLuong` khớp dữ liệu gieo | integration (PGlite) | 3a chạy thật |
| T7 | HĐ **không có** dòng hàng → `soDongHang=0`, `tenHangDau=null`, `tongSoLuong=null` | integration | biên |
| T8 | **Bẫy `hoa_don.id`:** hai HĐ khác nhau không nhận nhầm dòng hàng của nhau | integration | canh `listInvoices.ts:50-52` |
| T9 | **Cách ly tenant:** tóm tắt của tenant A không đếm dòng hàng tenant B | integration | `multi-tenant.md` |
| T10 | `iterateInvoices` và `listInvoices` trả **cùng** 3 số trên cùng bộ lọc | integration | chứng minh "một nguồn sự thật" |
| T11 | xml/html vẫn render đủ cột sau khi `EXPORT_COLUMNS` nở | unit | không vỡ `invoiceDoc.ts` |

## 5. Tiêu chí nghiệm thu

1. `make lint` sạch, `make test` xanh toàn bộ, coverage tầng nghiệp vụ không tụt dưới 80%.
2. T1–T11 xanh; T6–T10 chạy trên PGlite thật, không mock.
3. File xlsx tải về từ dev có đủ **21** cột sheet 1 và 10 cột sheet "Chi tiết dòng hàng".
4. Mở file xlsx bằng Excel/LibreOffice thật: ô "Tổng số lượng" của một HĐ xăng dầu hiện
   **`62.925`**, không phải `63` — nghiệm thu bằng mắt cho yêu cầu M1.
5. Không đổi chữ ký endpoint `/exports` — client cũ vẫn chạy.
6. Commit nhỏ, tách: (a) helper `lineSummary`, (b) cột header, (c) cột dòng hàng.

## 6. Phát hiện làm hẹp phạm vi (đã kiểm chứng 2026-07-20)

1. **`InvoiceTable.tsx` KHÔNG sinh cột từ `EXPORT_COLUMNS`** — comment dòng 1 nói "= EXPORT_COLUMNS"
   nhưng thân hàm viết tay 14 `<th>` cứng (`InvoiceTable.tsx:43-56`). ⇒ U29 **không đổi UI**,
   không cần đụng frontend. *(Lệch giữa comment và mã — ghi vào BACKLOG, không sửa ở U29.)*
2. **`EXPORT_COLUMNS` nuôi 4 định dạng**, không phải 2: csv (`csv.ts:97`), xlsx (`xlsx.ts:160`),
   **xml + html** (`invoiceDoc.ts:59,78`). 5 cột mới lan sang cả 4 — đúng ý đồ, nhưng T11 phải canh.

## 7. Ràng buộc bắt buộc chạm tới

- ✅ **`tenant_id` tường minh** — 3 sub-select đều có `d.tenant_id = ${tenantId}` cạnh RLS (T9).
- ✅ **Chỉ ĐỌC, không gọi GDT** — `packages/gdt-client`/`GdtTransport` không bị đụng.
- ✅ **Không ép float** — `tongSoLuong`/`ttcktmai` giữ **chuỗi** qua `String()` (`columns.ts:34-35`);
  đây cũng là thứ bảo toàn `62.925` không thành `62.92` (M1).
- ➖ Khóa tự nhiên/idempotent, xử lý 401, captcha: không áp dụng (đơn vị thuần đọc).

## 8. Rủi ro & phụ thuộc

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Hiệu năng 3a trên tập lớn.** ~~3 sub-select tương quan × toàn bộ tập export~~ | ~~🔴 cao~~ → 🟢 **thấp** | **ĐÃ ĐO 2026-07-20 (production):** 22.350 HĐ / 48.134 dòng, **trung bình 2,15 dòng/HĐ**, tối đa 17; `dong_hang_hoa` chỉ **49 MB** (nằm gọn trong RAM). 3 sub-select × 22k hàng ≈ 67k tra index trên `dong_hang_hoa_hoadon_idx(hoadon_id)`, khóa có độ chọn lọc 2,15 hàng ⇒ rẻ. **Không cần thêm index, không cần migration.** Đường lui `LEFT JOIN LATERAL` giữ trong túi nhưng chưa cần. Ngưỡng xem lại: khi một tenant vượt ~200k hóa đơn. |
| Cột mới làm lệch chỉ số cột ở tiêu dùng hạ nguồn | 🟡 | Test hiện dùng `findIndex(key)` chứ không chỉ số cứng (`csv.test.ts:78`, `xlsx.test.ts:44`) ⇒ an toàn. Nhưng **người dùng có macro Excel theo cột cứng sẽ vỡ** — cần ghi chú phát hành. |
| Nới `ExportColumn.key` gây lỗi kiểu lan rộng | 🟢 | `tsc --noEmit` bắt hết tại `make lint`. |
| Sub-select trả `sum(numeric)` → drizzle/PGlite kiểu chuỗi vs pg thật | 🟡 | T6 canh **kiểu** trả về là `string`, không chỉ giá trị. |

## 8b. Bằng chứng production 2026-07-20 (đã đo, không suy đoán)

Truy vấn chỉ-đọc trên Neon production (`default_transaction_read_only=on`), 1 tenant,
22.350 hóa đơn / 48.134 dòng hàng. **Cảnh báo diễn giải: mẫu n=1 tenant, hồ sơ cây xăng
bán lẻ — 99,5% hóa đơn `sco` (máy tính tiền). KHÔNG đại diện cho tập khách hàng.**

### E1. Ba trường "thưa" là do NGUỒN, không do nghiệp vụ hiếm

| `nguon` | số HĐ | có `dvtte` | có khóa `tgia` |
|---|---|---|---|
| `sco` (purchase+sold) | 22.229 | **0** | **0** |
| `normal` (purchase) | 121 | **121 = 100%** | **121 = 100%** |

`dvtte`/`tgia` hiện diện ở **100%** hóa đơn `normal` và **0%** hóa đơn `sco` — họ endpoint
máy tính tiền không trả hai trường này (Hiến pháp dòng 54). `tsuatTien` cùng dạng: cả 45
dòng đều thuộc `normal/purchase`. ⇒ Với tenant B2B dùng chủ yếu `normal`, ba trường này
sẽ **đầy 100%**. Kết luận "hiếm ⇒ bỏ" từ tenant này là **ngoại suy sai**.

### E2. `ttcktmai` — 8 dòng, nhưng là 8 dòng giá trị nhất

Toàn bộ 8 HĐ có `ttcktmai ≠ 0` đều có `tgtcthue` **ÂM** và **bằng đúng `-ttcktmai`**:
`8.944.444 → -8.944.444 / -9.660.000` … `60.257.129 → -60.257.129 / -65.077.699`.
Đây là **hóa đơn điều chỉnh giảm / chiết khấu thương mại**, tới 60 triệu đồng — dòng tiền
lớn nhất tập dữ liệu. Hiện file xuất chỉ hiện **số âm không lời giải thích**. Cân theo
**giá trị và tính không thay thế được**, không theo số dòng.

### E3. `ltsuat` — mất thông tin đã được chứng minh

| `ltsuat` | n | `tsuat` |
|---|---|---|
| `KCT` (không chịu thuế) | 14 | **0** |
| `KKKNT` (không kê khai khấu trừ) | 32 | **0** |
| `8%` / `10%` | 48.017 | 0.08 / 0.1 |

`tsuat` **không NULL** như từng phỏng đoán — nó bằng `0`. ⇒ File xuất hiện đang **gộp ba
nghiệp vụ khác nhau (KCT, KKKNT, và 0% thật) thành cùng chữ số `0`**, không phân biệt nổi.

### E4. `tongSoLuong` có phần thập phân thật

32/48.134 dòng có `sluong` thập phân, `max(scale)=3`: `62.925 Lít` dầu Điêzen,
`42.492 Lít` xăng E10. ⇒ Áp `#,##0` sẽ hiển thị `63`/`42` — **sai số lượng trên hóa đơn
nhiên liệu**. Quyết định M1 dưới đây dựa thẳng vào con số này.

### E5. Việc phát sinh — GHI BACKLOG, KHÔNG làm ở U29

`dvtte` NULL ở **toàn bộ 22.229** hóa đơn `sco`, nhưng mọi hóa đơn đều **phải** có đơn vị
tiền tệ. Cột "Tiền tệ" (đã có sẵn trong `EXPORT_COLUMNS` từ U7) vì thế trống 99,5% —
**lỗi sẵn có, không do U29 gây ra**. Nghi vấn: adapter có nên mặc định `sco → 'VND'` không?
Hóa đơn máy tính tiền gần như chắc chắn nội địa, nhưng **"gần như chắc chắn" không phải
bằng chứng** ⇒ ghi `docs/BACKLOG-y-tuong-va-de-xuat.md`, để tầng adapter quyết, không tự
suy ở tầng export.

## 9. Điểm mơ hồ — ĐÃ QUYẾT (dựa trên §8b)

**M1 — `tongSoLuong` hiển thị ĐẦY ĐỦ phần thập phân. Thêm `ColumnKind = "num"`.** ✅ CHỐT
*(Quyết định chủ dự án 2026-07-20: "hiển thị đầy đủ cả phần thập phân".)*

Căn cứ E4: `sluong` có thập phân thật tới 3 chữ số (`62.925 Lít`). `money` áp `#,##0` là
phép biến đổi **hiển thị có mất mát** — `62.925` hiện thành `63`.

**Đã kiểm chứng cơ chế (đọc `xlsx.ts:107`, 2026-07-20):** `styles.xml` chỉ khai 3 style;
style mặc định là `numFmtId="0"` = **General**. Ô không phải tiền **không** mang thuộc tính
`s` (`xlsx.ts:58`) ⇒ rơi vào General, và General **hiện đủ phần thập phân**, không làm tròn.
⇒ Yêu cầu "đầy đủ thập phân" đạt được bằng đúng cách **không áp numFmt**. CSV vốn ghi chuỗi
thô nên luôn đủ.

**Thêm `"num"` vào `ColumnKind` ngay trong U29** thay vì tái dùng `int`:
- Chi phí thật: **2 dòng** — thêm `"num"` vào union (`columns.ts:7`) và thêm `case "num":`
  cạnh `money`/`int` trong `cellFor` (`columns.ts:104`).
- ⚠️ **Bắt buộc thêm `case`**: `cellFor` có nhánh `default` trả `{t:"str"}`. Nếu chỉ nới
  union mà quên `case`, số sẽ âm thầm xuất thành **chuỗi** — lỗi im lặng.
- Lý do không hoãn: `int` dùng cho giá trị thập phân là **tên nói dối**, đúng trên chính
  cột mà chủ dự án vừa yêu cầu chính xác. Sửa sau đắt hơn sửa bây giờ.
- Không đụng profile kế toán `reference`: nới union chỉ **mở rộng** miền giá trị, không đổi
  hành vi profile hiện có (`profiles/types.ts:13`).

`ttcktmai` và `tsuatTien` **giữ `money`** — E2 xác nhận là tiền VND, `scale=0`; `#,##0`
đúng và giúp đọc con số 60 triệu.

**M2 — Chèn giữa theo trật tự nghiệp vụ.** ✅ CHỐT

Lý do quyết định: **hiện có đúng 1 tenant** (`so_tenant = 1`). Đây là thời điểm **rẻ nhất
trong toàn bộ vòng đời sản phẩm** để sắp lại thứ tự cột — chi phí gần bằng 0 hôm nay, và
tăng đơn điệu theo từng khách hàng mới. Hoãn sang sau là tự chọn một cái giá đắt hơn.
Lợi ích (file kế toán đọc được theo trật tự nghiệp vụ) thì **vĩnh viễn**.

Rủi ro "vỡ macro Excel" gần như bằng không ở quy mô hiện tại; ngoài ra thêm cột **luôn**
làm lệch chỉ số dù chèn ở đâu, nếu macro tham chiếu sau điểm chèn. Test nội bộ dùng
`findIndex(key)` nên an toàn (`csv.test.ts:78`, `xlsx.test.ts:44`).

**M3 — LOẠI `tgia` khỏi phạm vi U29.** ✅ CHỐT
*(Quyết định chủ dự án 2026-07-20: "không quan tâm đến tỷ giá vì không cần thiết".)*

Truy vấn đã chạy. Kết quả: **0 hóa đơn ngoại tệ**; 79 giá trị `tgia` **toàn bộ = 1**,
phương sai bằng 0. ⇒ Không thể nâng ngữ nghĩa tỷ giá-ngoại tệ lên "đã kiểm chứng", và
với dữ liệu hiện có cột này **không mang thông tin nào**.

Quyết định: **không thêm cột `tgia`**. Đây là lựa chọn YAGNI hợp lệ — không xây cho một
nhu cầu chưa tồn tại và chưa kiểm chứng được.

*Ghi lại để không mất dấu (đã trình bày và chủ dự án vẫn quyết loại):* E1 cho thấy sự hiện
diện của `tgia` do `nguon='normal'` quyết định 100%, không do nghiệp vụ — tenant B2B dùng
hóa đơn `normal` sẽ có trường này đầy đủ. ⇒ **Điều kiện xem lại:** khi có tenant đầu tiên
với `dvtte≠'VND'`, mở lại quyết định này, kiểm chứng `raw_json->>'tgia'` bằng dữ liệu thật
rồi mới thêm cột. Ghi vào `docs/BACKLOG-y-tuong-va-de-xuat.md`.

Hệ quả thu hẹp: 6 cột header → **5**; §5 không còn tiêu chí ngoại tệ; không có test nào
khẳng định hành vi tỷ giá (không bịa bằng chứng).

### Đính chính hai phỏng đoán sai trong bản kế hoạch đầu (giữ lại để truy vết)

1. ~~"`tsuat` NULL ở dòng mã chữ"~~ → **SAI**. `tsuat = 0` (E3). Kết luận vẫn giữ nhưng lý do
   đổi: vấn đề là **gộp nhầm** KCT/KKKNT/0%-thật, không phải thiếu dữ liệu.
2. ~~"`ttcktmai` yếu, chỉ 0,036% số dòng"~~ → **SAI về trọng số**. Cân theo số dòng là sai
   phép; 8 dòng đó là các HĐ điều chỉnh giảm tới 60 triệu (E2). `ttcktmai` là trường
   **mạnh nhất** trong 6, không phải yếu nhất.

---

**Kết luận: 5 trường header + 2 trường dòng hàng.** So với "đầy đủ nghiệp vụ" ban đầu, chỉ
`tgia` bị loại — theo quyết định chủ dự án, và là lựa chọn YAGNI hợp lệ vì không có dữ liệu
nào kiểm chứng được nó. Bốn trường còn lại đều có bằng chứng production chống lưng (§8b);
riêng `ttcktmai` và `ltsuat` là **sửa mất mát thông tin có thật**, không phải thêm cho đủ.

**Bước kế tiếp:** `/write-prompt U29` (sinh prompt thực thi) hoặc `/start-unit U29`
(thực thi trực tiếp theo TDD §4). Không còn điểm chặn.

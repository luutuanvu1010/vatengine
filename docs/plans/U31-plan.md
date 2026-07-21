# U31 — Lọc & sắp xếp theo cột (kiểu Excel), server-side

> **Mục tiêu:** người dùng lọc và sắp xếp ngay trên đầu mỗi cột của bảng hóa đơn, quen
> tay như Excel — và kết quả áp trên **toàn bộ** dữ liệu khớp, không chỉ trang đang xem.
>
> Trạng thái: ✅ ĐÃ HIỆN THỰC 2026-07-20 — `make lint` EXIT=0, `make test` EXIT=0.
> Review chéo (bảo mật + DoD) đã xử lý findings; §1 đã ĐÍNH CHÍNH phạm vi lọc chọn-giá-trị.
> Lập theo `.claude/skills/plan-unit`.
> Ngày lập: 2026-07-20. Nền: `f8452c0` (sau U29/U30/U32).

## 0. Hiện trạng (đã kiểm chứng 2026-07-20)

| | Hiện có | Bằng chứng |
|---|---|---|
| Bộ lọc | 7 thứ, gom trong MỘT thanh phía trên bảng: kỳ nhanh, từ/đến ngày, chiều, nguồn, MST bán, MST mua | `FilterBar.tsx:19-129` |
| Lọc theo cột | **KHÔNG** — `<th>` là text tĩnh | `InvoiceTable.tsx:103-117` |
| Sắp xếp | **KHÔNG** — không `onClick`, không tham số sort gửi lên | `InvoiceTable.tsx:103-117`, `apiClient.ts:112-125` |
| Tìm theo tên đối tác / số HĐ | **KHÔNG** — và mã ghi rõ lý do: *"backend không hỗ trợ"* | `FilterBar.tsx:1-3` |
| `ttxly`/`tthai` | Có trong schema + có gửi lên, **nhưng KHÔNG có UI** | `filters.ts:20-21`, `apiClient.ts:118-119` |
| Thứ tự trả về | Cứng: `tdlap desc, id desc` | `listInvoices.ts:65` |

⇒ U31 **không phải việc frontend**. Backend hiện không có khả năng tìm theo tên/số HĐ,
cũng không nhận tham số sắp xếp. Phải mở rộng thật ở `packages/query` trước.

## 1. Phạm vi

**Trong phạm vi:**
- Sắp xếp server-side theo cột, đổi chiều tăng/giảm.
- Lọc theo cột: **văn bản chứa** (số HĐ, tên người bán, tên người mua), **chọn giá trị**
  (chiều, nguồn), **khoảng số tiền** (tổng thanh toán).
- UI: menu nhỏ trên đầu cột (sắp xếp + ô lọc), dấu hiệu cột đang có lọc/sắp xếp, nút xóa lọc.
- Giữ nguyên `FilterBar` cho khoảng ngày và kỳ nhanh — **không** chuyển ngày vào header.

**NGOÀI phạm vi:**
- ❌ Lọc theo danh sách giá trị phân biệt kiểu Excel ("chọn trong 500 tên người bán") — cần
  endpoint đếm distinct trên toàn tập, là đơn vị riêng. Xem §7-M2.
- ❌ Lọc cột tóm tắt dòng hàng (`tenHangDau`/`tongSoLuong`) — chúng là sub-select, lọc theo
  chúng cần HAVING hoặc bảng dẫn xuất; để sau khi có nhu cầu thật.
- ❌ **Lọc chọn-giá-trị cho `ttxly` / `tthai`** — ĐÍNH CHÍNH so với bản kế hoạch đầu, bản
  đầu liệt kê chúng trong phạm vi. Lý do bỏ: dự án đã chốt (nguyên tắc bằng chứng B1,
  `apps/web/src/features/invoices/chips.tsx:1-2`) rằng **các mã `ttxly`/`tthai` CHƯA KIỂM
  CHỨNG** — chip còn phải hiển thị trung tính kèm "(chưa rõ)". Dựng dropdown cho chúng
  đồng nghĩa **bịa ra danh sách mã hợp lệ**, đúng thứ Hiến pháp cấm. Backend đã hỗ trợ lọc
  hai trường này từ trước U31; khi nào có danh sách mã kiểm chứng được từ nguồn sơ cấp thì
  mở UI, không sớm hơn.
- ❌ **Lọc chọn-giá-trị cho `dvtte`** — cũng đính chính. Bằng chứng production 2026-07-20
  (U29 §8b-E1): `dvtte` NULL ở **22.229/22.350** hóa đơn, phần còn lại chỉ có đúng một giá
  trị `"VND"`. Một dropdown một-lựa-chọn trên cột trống 99,5% không giải quyết vấn đề gì.
  Backend vẫn nhận `dvtte` (đã hiện thực + có test) để sẵn sàng khi dữ liệu đa tiền tệ
  xuất hiện; chỉ UI là hoãn.
- ❌ Nhóm/tổng theo cột, ghim cột, đổi thứ tự cột.
- ❌ Đụng `iterateInvoices` (kết xuất giữ nguyên thứ tự keyset — xem §3.4).
- ❌ Đụng lựa chọn dòng U30 ngoài việc xóa lựa chọn khi đổi lọc (đã có).

## 2. File sẽ tạo/sửa

- `packages/query/src/filters.ts` — thêm trường lọc mới + `sortSchema` (allowlist).
- `packages/query/src/listInvoices.ts` — áp `ORDER BY` động theo allowlist.
- `packages/query/src/index.ts` — export.
- `apps/api/src/routes/invoices.ts` — parse thêm tham số sắp xếp.
- `apps/web/src/types/api.ts` — mirror kiểu.
- `apps/web/src/lib/apiClient.ts` — `filterQuery` gửi trường mới + sort.
- `apps/web/src/features/invoices/InvoiceTable.tsx` — menu đầu cột.
- `apps/web/src/features/invoices/ColumnMenu.tsx` (mới) — menu sắp xếp + lọc.
- `apps/web/src/features/invoices/InvoicesPage.tsx` — nối state sort.

## 3. Thiết kế

### 3.1 ⚠️ Sắp xếp = ALLOWLIST, tuyệt đối không nội suy chuỗi vào ORDER BY

Đây là rủi ro an toàn lớn nhất của đơn vị này. Tên cột sắp xếp đến từ client. **Không**
được ghép chuỗi đó vào SQL. Phải ánh xạ qua bảng tra cứu cố định:

```ts
const SORT_COLUMNS = {
  tdlap: hoaDon.tdlap, shdon: hoaDon.shdon, nbten: hoaDon.nbten,
  nmten: hoaDon.nmten, tgtcthue: hoaDon.tgtcthue, tgtthue: hoaDon.tgtthue,
  tgtttbso: hoaDon.tgtttbso, ttxly: hoaDon.ttxly, tthai: hoaDon.tthai,
} as const;
export const sortSchema = z.object({
  sortBy: z.enum(Object.keys(SORT_COLUMNS) as [string, ...string[]]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
```

Giá trị lạ ⇒ Zod từ chối ⇒ 400. Không có đường nào chuỗi client chạm vào câu lệnh.

**Tie-breaker bắt buộc:** mọi thứ tự phải kết thúc bằng `, id desc`. Lý do đã ghi ở
`listInvoices.ts:62-63`: `tdlap` chỉ tới giây nên có lô hóa đơn trùng giá trị; thiếu khóa
phụ thì phân trang limit/offset **bỏ hoặc lặp bản ghi**. Sắp theo cột khác (vd `nbten`,
trùng rất nhiều) làm rủi ro này **nặng hơn**, không nhẹ đi.

### 3.2 Lọc văn bản — `contains`, không phân biệt hoa thường

Dùng `ilike` của Drizzle với tham số bind. **Phải escape ký tự đại diện** `%` và `_` trong
chuỗi người dùng nhập, nếu không "50%" sẽ thành ký tự đại diện và trả kết quả sai âm thầm:

```ts
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
conds.push(ilike(hoaDon.nbten, `%${escapeLike(filter.nbten)}%`));
```

Trường mới: `shdon`, `nbten`, `nmten` (contains) · `dvtte` (bằng đúng) ·
`ttbsoTu`/`ttbsoDen` (khoảng `tgtttbso`).

### 3.3 Lọc ≠ bộ lọc cũ về mặt vị trí, nhưng CÙNG một `InvoiceFilter`

Trường lọc theo cột đi chung `invoiceFilterSchema` với bộ lọc thanh trên. Một nguồn sự
thật cho "tập hóa đơn đang xem" ⇒ `summarizeInvoices` (tổng tiền) và U30 (xuất theo bộ
lọc) **tự động khớp** với những gì bảng đang hiện. Nếu tách hai hệ lọc, con số tổng dưới
bảng sẽ nói khác bảng — lỗi niềm tin nghiêm trọng với phần mềm kế toán.

### 3.4 Kết xuất KHÔNG đổi thứ tự

`iterateInvoices` duyệt keyset theo `(tdlap, id) desc` — đó là cơ chế phân lô ổn định, không
phải lựa chọn thẩm mỹ. Đổi nó theo `sortBy` sẽ phá keyset (con trỏ dựng trên `tdlap`).
U31 **không** đụng tới. Hệ quả chấp nhận được: file xuất luôn theo ngày lập giảm dần, kể cả
khi bảng đang sắp theo cột khác. Ghi rõ vào tài liệu; nếu sau này cần, làm đơn vị riêng.

### 3.5 UI — menu đầu cột

Mỗi `<th>` lọc được có nút mở `ColumnMenu`: "Sắp xếp tăng / giảm", ô nhập (hoặc select)
tương ứng kiểu cột, nút "Xóa lọc cột này". Cột đang lọc hoặc đang sắp có dấu hiệu thị giác
(mũi tên + chấm). Áp lọc → reset `offset` về 0 và **xóa lựa chọn dòng** (dùng lại
`applyFilter` của U30 — cùng lý do: không xuất nhầm dòng không còn thấy).

## 4. Test viết trước (TDD)

**Truy vấn (unit + integration):**

| # | Test | Nhóm |
|---|---|---|
| T1 | `sortSchema` từ chối tên cột ngoài allowlist (`"id; drop table"`) → lỗi | unit |
| T2 | Mọi `ORDER BY` đều kết thúc bằng tie-breaker `id` | unit (render SQL thật) |
| T3 | Tên cột sắp xếp KHÔNG bao giờ xuất hiện dưới dạng chuỗi nối trong SQL | unit |
| T4 | `nbten` contains không phân biệt hoa thường | integration |
| T5 | **Ký tự `%`/`_` trong chuỗi tìm được escape** — tìm `"50%"` không khớp mọi bản ghi | integration |
| T6 | Khoảng tiền `ttbsoTu`/`ttbsoDen` bao gồm hai đầu mút | integration |
| T7 | Sắp theo `nbten` asc/desc trả đúng thứ tự | integration |
| T8 | Sắp theo cột có nhiều giá trị TRÙNG: phân trang 2 trang không bỏ/lặp bản ghi | integration |
| T9 | **Cách ly tenant** giữ nguyên với mọi bộ lọc/sắp xếp mới | integration |
| T10 | `summarizeInvoices` và `listInvoices` khớp trên cùng bộ lọc cột | integration |

**API:** T11 sortBy lạ → 400 · T12 không truyền sort → thứ tự cũ (`tdlap desc`) không đổi.

**Web:** T13 click header → gửi `sortBy`/`sortDir` · T14 nhập lọc cột → gửi đúng tham số +
reset offset · T15 áp lọc cột → xóa lựa chọn dòng (U30) · T16 cột đang lọc có dấu hiệu.

## 5. Tiêu chí nghiệm thu

1. `make lint` sạch, `make test` xanh, coverage không tụt dưới 80%.
2. T1–T16 xanh; T4–T10 chạy PGlite thật.
3. Không truyền tham số sắp xếp ⇒ hành vi y hệt hôm nay (tương thích ngược, T12).
4. Tìm chuỗi chứa `%` trả kết quả đúng nghĩa đen (T5).
5. Tổng tiền dưới bảng khớp với bộ lọc cột đang áp (T10).

## 6. Ràng buộc bắt buộc chạm tới

- ✅ **Không nội suy chuỗi vào SQL** — allowlist cho ORDER BY, bind cho mọi giá trị (§3.1, §3.2).
- ✅ **`tenant_id` tường minh** — `buildWhere` giữ nguyên điều kiện đầu tiên (T9).
- ✅ **Tie-breaker phân trang** — §3.1, T8.
- ✅ **RBAC** — `/invoices` vẫn cho cả 3 vai (`invoices.ts:23`), U31 không đổi quyền.
- ➖ Không gọi GDT, không đụng adapter, không đụng khóa tự nhiên.

## 7. Điểm mơ hồ

**M1. Hiệu năng `ilike '%x%'`.** Không dùng được index B-tree thường ⇒ quét tuần tự.
Ở quy mô đo được (22.350 hóa đơn / tenant, bảng 58MB) là chấp nhận được. **CHƯA KIỂM CHỨNG**
ở quy mô lớn hơn. Không thêm index GIN/pg_trgm trong U31 (migration + phụ thuộc extension
là quyết định riêng); ghi ngưỡng xem lại: khi một tenant vượt ~200k hóa đơn.

**M2. Lọc theo danh sách giá trị phân biệt** (đúng kiểu Excel "tick chọn trong danh sách")
để NGOÀI phạm vi: cần endpoint trả distinct trên toàn tập + phân trang cho danh sách dài.
U31 làm dạng "ô nhập chứa" trước vì rẻ hơn nhiều và giải quyết đúng nhu cầu tìm nhanh.
Ghi BACKLOG.

---

**Bước kế tiếp:** `/start-unit U31` theo TDD §4. Thứ tự commit: (a) truy vấn, (b) API, (c) UI.

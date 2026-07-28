# U36 — Trạng thái hóa đơn trong tổng hợp và kết xuất

> Ngày: 2026-07-28 · Trạng thái: **CHỐT — SẴN SÀNG THỰC THI**
> Đã qua **2 vòng review chéo độc lập** (subagent), vá **19 lỗi chặn**. Mọi trích dẫn `file:dòng` đã đối chiếu với mã thật ngày 2026-07-28.
> Nguồn quy tắc: `CLAUDE.md` (Hiến pháp), `.claude/rules/{ui,testing,multi-tenant,security}.md`.
> **Nguồn bằng chứng: `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md`**.

---

## 1. Vì sao làm

Hệ thống cộng **mọi** hóa đơn vào tổng, kể cả hóa đơn đã bị thay thế. Đo trên production 2026-07-28: **doanh thu bán ra dôi 274.535.000đ, thuế đầu ra dôi 20.335.925đ**.

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| **QĐ-1** | File tải về thêm **3 cột**: `Trạng thái HĐ (mã)` · `Trạng thái` · `Tính vào tổng`, đặt **ngay sau `Tổng tiền (sau thuế)`**, **bật mặc định** |
| **QĐ-2** | Thông báo hiện **hai con số chính xác** thay cho "mức ròng" — §2.1 |
| **QĐ-3** | Loại `tthai=4` khỏi **mọi phép cộng TIỀN** |
| **QĐ-4** | **Chỉ loại `tthai=4`.** Giữ `1`, `2`, `3`, `5` |
| **QĐ-5** | Hóa đơn `tthai=4` **vẫn xuất ra file**, chỉ không cộng vào tổng |
| **QĐ-6** | Mã ngoài `1–5` → `"<mã> (chưa rõ)"`, **VẪN tính vào tổng**, **và phải hiện cảnh báo** |
| **QĐ-7** | **`count` "hóa đơn khớp bộ lọc" GIỮ NGUYÊN** — §2.2 |
| **QĐ-8** | **Quy ước dấu:** API trả số **DƯƠNG**; giao diện tự thêm dấu trừ. Ký tự dấu trừ dùng **`-` ASCII** (không đổi `format.ts`) |
| **QĐ-9** | **Không thêm mảng `thayDoi` top-level.** Nhồi các trường mới vào `ChieuSummary` (đã có sẵn `byChieu[]`) — §4 Gói 3 |
| **QĐ-10** | `tongTcthue/tongTthue/tongTtbso` **giữ nullable** (không COALESCE) để không đổi hành vi `—` hiện có. Chỉ COALESCE các trường tiền MỚI |
| **QĐ-11** | Chip trạng thái: mã `1` giữ **success**; mã `2,3,4,5` dùng **neutral** — không tô xanh cho "Bị thay thế". *(Chủ dự án xác nhận 2026-07-28)* |
| **QĐ-12** | **CÓ** hiện dòng "Thuế phải nộp thay đổi" — dẫn xuất **client-side**, không đổi hợp đồng API. *(Chủ dự án xác nhận 2026-07-28)* — §2.3 |

### 2.1 QĐ-2 — vì sao bỏ công thức "mức thay đổi ròng"

Công thức `Σ(mã 2) − Σ(mã 4) + Σ(mã 3)` **không tính đúng** vì:

- **(a) Cặp hóa đơn vắt qua kỳ.** Hệ thống lọc theo **ngày lập**; hóa đơn thay thế có thể lập ở kỳ khác bản gốc (biên bản §6.4: gốc 23/06 ↔ điều chỉnh 09/07; §6.5 ca B: gốc 09/03 ↔ thay thế 11/04; §6.3: đuôi tới 26 ngày). Con số ra là **phần dư ngẫu nhiên của cửa sổ lọc**.
- **(b) Chuỗi nhiều đời.** Ca A→B→C (A=4, B=4, C=2) làm `Σ(2) − Σ(4)` **trừ hai lần** — §8.3.

**Thay bằng hai con số chính xác tuyệt đối trong mọi cửa sổ lọc, tách theo chiều:**

| Con số | Nguồn | Ý nghĩa |
|---|---|---|
| **Đã loại khỏi tổng** | `Σ(tgtthue WHERE tthai=4)` — dương | Giải thích *vì sao tổng đổi so với trước* |
| **HĐ thay thế / điều chỉnh lập trong kỳ** | `Σ(tgtthue WHERE tthai IN (2,3))` — dương | Quy mô cần rà soát, đã nằm trong tổng |

Mức thay đổi ròng thật cần ghép cặp gốc↔mới bất kể kỳ ⇒ **U37**.

### 2.3 QĐ-12 — dòng "Thuế phải nộp thay đổi"

Ý định gốc của chủ dự án là xem **thuế phải nộp** đổi thế nào. Vì `Thuế phải nộp = Thuế đầu ra − Thuế đầu vào được khấu trừ`, con số này **dẫn xuất hoàn toàn ở client** từ `byChieu` — **không đổi hợp đồng API**.

**Công thức và dấu:**

```
Δ thuế phải nộp = − thueDaLoai(sold) + thueDaLoai(purchase)
```

Diễn giải: loại hóa đơn mã 4 ở chiều **bán ra** làm thuế đầu ra giảm ⇒ thuế phải nộp **giảm**. Loại ở chiều **mua vào** làm thuế được khấu trừ giảm ⇒ thuế phải nộp **tăng**. Hai chiều ngược dấu nhau — đây chính là chỗ bản kế hoạch đầu làm sai khi cộng thẳng.

Kiểm chứng với dữ liệu thật kỳ 07/2026: `−1.711.111 + 0 = −1.711.111` ⇒ *"Thuế phải nộp trên báo cáo giảm 1.711.111 ₫"*.

⚠️ **Bắt buộc tính bằng BigInt trên chuỗi** (`06-BINDING_MAP.md`: CẤM `Number()`/`parseFloat` cho tiền). Cần một helper trừ hai chuỗi tiền — **kiểm `apps/web/src/lib/format.ts` và `packages/**` xem đã có chưa trước khi tự viết**; nếu viết mới thì đặt ở một nơi dùng chung, có unit test ca số > 2^53.

**Cách đọc phải ghi rõ trên giao diện:** số thuế phải nộp **thật không đổi** — chỉ là trước đây phần mềm tính dư. Không được để kế toán hiểu nhầm là nghĩa vụ thuế thay đổi.

### 2.2 QĐ-7 — vì sao `count` phải giữ nguyên

`apps/web/src/features/invoices/InvoicesPage.tsx:92-107` (đã đối chiếu mã thật):

```ts
const count = summary.data?.total.count ?? 0;
const khongCoHoaDon = summary.isSuccess && count === 0;
const backfill = useRangeBackfill({ …, auto: khongCoHoaDon && canSync });
```

Trừ mã 4 khỏi `count` ⇒ kỳ **chỉ chứa hóa đơn mã 4** cho `count = 0` ⇒ trang **tự gọi đồng bộ lên Tổng cục Thuế**. GDT đã phạt 429 nguồn của ta ngày 2026-07-27.

Bằng chứng ủng hộ thêm: `packages/query/test/integration/listInvoices.test.ts:277` khẳng định bất biến `ds.total === tong.total.count` — giữ `count` nguyên thì bất biến này vẫn xanh, không phải sửa `listInvoices.ts`.

---

## 3. Phạm vi

**TRONG:** gỡ khóa bảng mã `tthai` (+ hệ quả màn Đối chiếu và chip) · quy tắc "tính vào tổng" khai một lần ở `packages/domain` · 3 cột mới trong file tải về · `/invoices/summary` loại mã 4 + số liệu thay đổi theo chiều · thông báo trên trang Danh sách · đồng bộ tài liệu **và luật**.

**NGOÀI:**

- ❌ Mã **"hủy"** thật — `STATUS_CODE_MAP.huy` giữ RỖNG
- ❌ Ý nghĩa `ttxly` — giữ RỖNG
- ❌ Liên kết cặp gốc ↔ thay thế và **mức ròng thật** — **U37**
- ❌ Mở rộng `FindingKind` sang `dieu_chinh`/`bi_dieu_chinh` — chuỗi map→classify→summary→UI→`api.ts` quá rộng ⇒ **BACKLOG**
- ❌ Kỳ kê khai / chốt kỳ / khai bổ sung · lưu ảnh chụp `raw_json` cũ · backfill tháng 3
- ❌ Bật cờ `SHOW_RECONCILE` — vẫn để `false`
- ❌ Sửa `apps/web/src/lib/format.ts` (QĐ-8)
- ❌ Sửa các kế hoạch lịch sử `U10-plan.md`, `U15-*.md` — **cố ý không sửa**, chúng là hồ sơ thời điểm

---

## 4. Thiết kế theo gói

> ⚠️ **Thứ tự bắt buộc: Gói 1 → 0 → 0b → 2 → 3 → 4 → 5.** Gói 0 phụ thuộc `@vat/domain` do Gói 1 tạo.

### Gói 1 — `packages/domain`: nhãn + quy tắc tính tổng (nguồn sự thật duy nhất)

`packages/domain` là **lá** (không phụ thuộc gói nào) ⇒ không tạo phụ thuộc vòng. `@vat/export`, `@vat/query`, `apps/web` đều đã phụ thuộc nó.

```ts
// packages/domain/src/trangThaiHoaDon.ts  (MỚI)
// Nguồn bằng chứng: docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md

/** Nhãn tthai ĐÃ KIỂM CHỨNG (20 cặp thật, 0 ngoại lệ). */
export const TTHAI_NHAN: Readonly<Record<number, string>> = {
  1: "Gốc", 2: "Thay thế", 3: "Điều chỉnh", 4: "Bị thay thế", 5: "Bị điều chỉnh",
};

/** Mã tthai bị LOẠI khỏi mọi phép cộng TIỀN. Chỉ 4 — QĐ-4. */
export const TTHAI_LOAI_KHOI_TONG: readonly number[] = [4];

/** Chuỗi nhãn — MỘT NGUỒN cho cả web lẫn file xuất. null → "". Mã lạ → "<mã> (chưa rõ)". */
export function nhanTthai(code: number | null | undefined): string {
  if (code == null) return "";
  return TTHAI_NHAN[code] ?? `${code} (chưa rõ)`;
}

/** Mã đã kiểm chứng chưa — quyết định `verified` của chip và màu. */
export function daKiemChungTthai(code: number | null | undefined): boolean {
  return code != null && code in TTHAI_NHAN;
}

/** Hóa đơn có được cộng TIỀN vào tổng không. null/mã lạ → true (không tự ý loại). */
export function tinhVaoTong(tthai: number | null | undefined): boolean {
  return tthai == null || !TTHAI_LOAI_KHOI_TONG.includes(tthai);
}
```

**Bắt buộc kèm:** `packages/domain/src/index.ts` hiện chỉ export `registry` và `flatExport` → **thêm `export * from "./trangThaiHoaDon";`**. Không có dòng này thì mọi gói sau không import được.

Unit test cho 4 hàm, gồm ca `null`, mã lạ, và `TTHAI_LOAI_KHOI_TONG` rỗng.

### Gói 0 — Gỡ khóa bằng chứng

| File | Việc |
|---|---|
| `apps/web/src/lib/statusLabels.ts` | `labelTthai` thành wrapper: `{ text: nhanTthai(c), verified: daKiemChungTthai(c) }`. `TTXLY_VERIFIED` **giữ rỗng**. Xóa khối chú thích "chỉ `1` = trạng thái gốc" (dòng 2-4, 12, 17), dẫn biên bản |
| `apps/web/test/lib/statusLabels.test.ts:9` | Đang khẳng định `labelTthai(5) → "5 (chưa rõ)"` → **sẽ đỏ**, cập nhật |
| **`apps/web/src/features/invoices/chips.tsx`** ⚠️ | `TthaiChip:30` tô **XANH LÁ** (`--success-50/700`) cho **mọi** mã `verified`. Sau khi điền nhãn, "Bị thay thế" sẽ hiện màu "tốt" — sai nghiệp vụ, vi phạm token doc (`--success-*` = số dương). **Theo QĐ-11: mã `1` giữ success; `2,3,4,5` dùng `--neutral-chip-*`.** Xóa chuỗi/chú thích "chưa được kiểm chứng" ở dòng 1-3, 36, 49 |
| `packages/reconcile/src/statusCodes.ts` | `STATUS_CODE_MAP.thayThe.tthai = [4]`. `huy` giữ `{}`. `ttxly` giữ rỗng. Thay khối chú thích dòng 5-13 |
| `packages/reconcile/test/contract/statusCodes.contract.test.ts:32` | `expect(codes).toEqual([4])` + dẫn nguồn. **Giữ vai trò cổng** |
| Chú thích lỗi thời trong mã | `packages/reconcile/src/statusAnomaly.ts:4,42` · `reconcile.ts:17` · `types.ts:5` · `apps/api/src/routes/reconcile.ts:4-5` · `apps/web/src/features/invoices/InvoiceChangesBadge.tsx:28` |
| Chú thích lỗi thời trong test | `packages/reconcile/test/unit/statusAnomaly.test.ts:3-6,37` · `test/integration/reconcile.test.ts:10,89` · `apps/api/test/integration/reconcile.route.test.ts:55` |
| `docs/adr/0001-nen-tang-cloudflare.md:31, :45` | Bảng bằng chứng ghi `tthai | 1` và dòng "chỉ quan sát `tthai=1`" — **cả hai** lỗi thời |

### Gói 0b — Hệ quả: hành vi `GET /reconcile` đổi

Điền `STATUS_CODE_MAP` khiến `findStatusAnomalies` (`packages/reconcile/src/statusAnomaly.ts:43`) thoát nhánh "map rỗng → không truy vấn". Trên **production** sẽ trả 17 finding `thay_the`.

⚠️ **Nhưng bộ test hiện có KHÔNG đỏ**: `apps/api/test/integration/reconcile.route.test.ts:31-45` seed toàn `tthai:1` (mặc định `apps/api/test/helpers.ts`) nên `:57 expect(thayThe).toBe(0)` vẫn xanh. Con số "17" là dữ liệu production, **không kiểm được bằng test hiện có**.

⇒ **Bắt buộc thêm seed `tthai:4`** vào test hợp đồng rồi khẳng định `thayThe === 1`. Không làm bước này thì thay đổi hành vi API đi vào production **không có test nào phủ**.

Kèm: `apps/web/src/features/reconcile/ReconcilePage.tsx:5` (chú thích "chỉ shdon + mã (chưa rõ)") và `:92` (`tone="neutral"` — nay có thể giữ, xem QĐ-11).

### Gói 2 — Ba cột mới trong file tải về (QĐ-1)

Sửa **`packages/domain/src/flatExport.ts`** (catalog 29 cột — đường sinh file thật, **không phải** `registry.ts`).

Chèn 3 mục **ngay sau `tongSauThue`** (`flatExport.ts:54`), đẩy `dvtte` (`:60`) xuống:

| Vị trí | key | nhãn | nhóm | kiểu | `macDinhHien` |
|---|---|---|---|---|---|
| 23 | `tthai` | **giữ nguyên `"Trạng thái HĐ (mã)"`** | `trangthai` | `ma` | ✅ bật |
| 24 | `tthaiNhan` | Trạng thái | `trangthai` | `text` | ✅ bật |
| 25 | `tinhVaoTong` | Tính vào tổng | `trangthai` | `text` | ✅ bật |

- **Không đổi nhãn `tthai` thành "Mã TT"** — trùng nhãn với `registry.ts:161`; đổi một nơi sinh hai nhãn cho một trường (vi phạm `ui.md` "Nhãn một nguồn") và làm đỏ `xlsxMapping.test.ts:87`.
- `tthai` đang ở `flatExport.ts:68` và **tắt** → **chuyển vị trí**, không tạo key trùng.
- `ttxly` (`:62`) giữ vị trí và **giữ tắt**.
- Catalog 29 → **31**; mặc định 16 → **19**.

Gắn ô ở `O_THEO_KEY` (`packages/export/src/columns.ts:326`) — helper thật tên **`strCell`** (không phải `textCell`):

```ts
tthai:       (r) => numCell(r.tthai),                                  // đã có
tthaiNhan:   (r) => strCell(nhanTthai(r.tthai)),                       // "" khi null
tinhVaoTong: (r) => strCell(r.tthai == null ? "Có" : (tinhVaoTong(r.tthai) ? "Có" : "Không")),
```

`tthai = null` → cột Mã TT trống, Trạng thái trống, Tính vào tổng = `"Có"` (nhất quán `06-BINDING_MAP.md` "null → trống").

**Kèm hai việc bắt buộc:**

1. `apps/web/src/features/invoices/ChonCotXuat.tsx:73` — chuỗi cứng `Về mặc định (16 cột)` → dẫn xuất `FLAT_EXPORT_DEFAULT_KEYS.length`.
2. ⚠️ **`apps/web/src/lib/exportColsStore.ts:6`** — khóa `vat.exportCols.v1` chỉ **lọc** key lạ, **không bổ sung key mới**. Người dùng từng bấm "Tùy chỉnh cột" sẽ **không bao giờ thấy 3 cột mới** ⇒ QĐ-1 "bật mặc định" vô hiệu với họ. **Bump khóa lên `vat.exportCols.v2`.**

Chú thích lạc hậu: `apps/web/src/lib/apiClient.ts:243`, `InvoiceExportButtons.tsx:18`.

### Gói 3 — `/invoices/summary` (QĐ-3, QĐ-7, QĐ-9, QĐ-10)

**3a. Hợp đồng mới** — không thêm mảng top-level (QĐ-9); nhồi vào `ChieuSummary` đã có:

```ts
// packages/query/src/summarize.ts  +  apps/web/src/types/api.ts:103-115
export interface MoneyTotals {
  count: number;              // QĐ-7 — khớp bộ lọc, KHÔNG trừ mã 4
  countTinhTong: number;      // MỚI
  soLoaiKhoiTong: number;     // MỚI
  tongTcthue: string | null;  // đã loại mã 4 · QĐ-10 giữ nullable
  tongTthue: string | null;
  tongTtbso: string | null;
}

/** Khối "thay đổi" CHỈ ở cấp chiều — không có ở `total` (không trộn mua vào với bán ra). */
export interface ChieuSummary extends MoneyTotals {
  chieu: Chieu;
  soDuocDieuChinh: number;        // tthai=5
  soHdThayThe: number;            // tthai=2
  soHdDieuChinh: number;          // tthai=3
  soMaLa: number;                 // tthai ngoài 1–5 — QĐ-6
  thueDaLoai: string;             // Σ tgtthue  WHERE tthai=4  · DƯƠNG, COALESCE 0
  ttbsoDaLoai: string;            // Σ tgtttbso WHERE tthai=4
  thueThayTheDieuChinh: string;   // Σ tgtthue  WHERE tthai IN (2,3)
  ttbsoThayTheDieuChinh: string;
}
```

`soLoaiKhoiTong` ở cấp chiều **chính là** số hóa đơn bị thay thế của chiều đó — không khai trùng thêm `soBiThayThe`.

**3b. Mã đã kiểm chứng chạy được** (`drizzle-orm` 0.45.2 không có API `FILTER`; dựng bằng `sql` template — đã chạy thử):

```ts
import { TTHAI_LOAI_KHOI_TONG } from "@vat/domain";
import { count, sql } from "drizzle-orm";

// Nhánh bảo vệ: `NOT IN ()` là lỗi cú pháp SQL.
const dungTinh =
  TTHAI_LOAI_KHOI_TONG.length === 0
    ? sql`true`
    : sql`(${hoaDon.tthai} is null or ${hoaDon.tthai} not in (${sql.join(
        TTHAI_LOAI_KHOI_TONG.map((v) => sql`${v}`), sql`, `)}))`;

const moneyCols = {
  count: count(),                                                                  // QĐ-7
  countTinhTong:  sql`count(*) filter (where ${dungTinh})`.mapWith(Number),
  soLoaiKhoiTong: sql`count(*) filter (where not ${dungTinh})`.mapWith(Number),
  tongTcthue: sql`sum(${hoaDon.tgtcthue}) filter (where ${dungTinh})`.mapWith(String),
  tongTthue:  sql`sum(${hoaDon.tgtthue})  filter (where ${dungTinh})`.mapWith(String),
  tongTtbso:  sql`sum(${hoaDon.tgtttbso}) filter (where ${dungTinh})`.mapWith(String),
};
```

> Drizzle **không sinh `AS "alias"`** cho biểu thức `sql` — nó map kết quả **theo vị trí**. Không viết `AS` trong template.
> Các trường `thueDaLoai`/`ttbsoDaLoai`/`thueThayTheDieuChinh`/`ttbsoThayTheDieuChinh` **có** `coalesce(…, 0)` (QĐ-10) vì luôn hiển thị dạng số.

**Bốn bẫy SQL bắt buộc xử lý:**

| Bẫy | Xử lý |
|---|---|
| `NOT IN` + `NULL` → loại nhầm | `(tthai is null or tthai not in (…))` |
| `sum()` tập rỗng → `NULL` lan cả biểu thức | `coalesce(…, 0)` **từng số hạng** cho trường MỚI |
| `count(col)` đếm non-null ≠ số dòng | `count(*) filter (…)` |
| Loại trừ đặt vào `WHERE` làm **biến mất cả nhóm** khỏi `group by chieu` | Đặt vào **aggregate**, giữ nguyên `WHERE` |

Truy vấn gộp **một lượt quét** vào `moneyCols` hiện có (không tách truy vấn riêng), đi qua `buildWhere(tenantId, filter)` **và** nằm trong `withTenant`.

**3c. `GET /invoices` KHÔNG sửa.** `packages/query/src/listInvoices.ts:49` trả `total = count()` trên cùng `buildWhere`; theo QĐ-7 `count` giữ nguyên ⇒ bất biến `listInvoices.test.ts:277` vẫn xanh. Đã cân nhắc, cố ý không đụng.

**3d. `packages/reconcile` GIỮ NGUYÊN — không áp loại trừ** ⚠️

Reconcile **không có phép cộng tiền nào**. Loại `tthai=4` khỏi truy vấn của nó sẽ gây hại:

- `sequenceGaps.ts`: 17 số hóa đơn bị loại hiện thành **"thiếu số đầu ra" giả**
- `taxIntegrity.ts`: hóa đơn mã 4 lệch thuế bị **giấu**

⇒ Loại trừ **CHỈ** áp cho `summarize.ts`. **Không** thêm `@vat/domain` vào `packages/reconcile/package.json`.

### Gói 4 — Giao diện trang "Danh sách hóa đơn"

`apps/web/src/features/invoices/InvoicesPage.tsx`.

**4a. Bốn thẻ số** — ⚠️ **ba số TIỀN** đã loại mã 4; **số đếm hóa đơn GIỮ NGUYÊN** (QĐ-7), giải thích bằng dòng phụ khi `soLoaiKhoiTong > 0`:

```
1.234 hóa đơn khớp bộ lọc
(3 hóa đơn bị thay thế - không tính vào tổng)
```

**4b. Thông báo** — primitive `Alert` tone `info` (`primitives.tsx:396`), tách **theo chiều**, chỉ hiện khi chiều đó có thay đổi. Dấu trừ dùng **`-` ASCII** (QĐ-8):

> **Kỳ 01/07/2026 - 31/07/2026 · Bán ra**
> 3 hóa đơn **bị thay thế** - đã loại khỏi tổng: thuế **-1.711.111 ₫**, tổng thanh toán **-23.100.000 ₫**
> 3 hóa đơn thay thế và 1 hóa đơn điều chỉnh lập trong kỳ - đã tính vào tổng
>
> **Thuế phải nộp trên báo cáo giảm -1.711.111 ₫** *(số thuế phải nộp thật không đổi - trước đây phần mềm tính dư)*
>
> *Từ 28/07/2026, hóa đơn bị thay thế không còn được cộng vào tổng.*

Dòng "Thuế phải nộp" (QĐ-12) đặt **một lần cho cả hai chiều**, không lặp trong từng khối chiều — vì bản thân nó đã là phép trừ giữa hai chiều. Ẩn khi cả hai chiều đều không có mã 4.

Dòng cuối **bắt buộc** (§7.2). Ghi cùng nội dung vào `apps/web/src/lib/changelog.ts`.

**4c. Cảnh báo mã lạ** (QĐ-6, bắt buộc): `soMaLa > 0` → *"Có N hóa đơn mang mã trạng thái chưa xác định - cần kiểm tra."*

**4d. Chịu được dữ liệu shape CŨ.** `queryKey: ["invoices-summary", filter]` (`InvoicesPage.tsx:83`) **không đổi** sau deploy ⇒ tab đang mở giữ dữ liệu cũ tới lần refetch. Mọi trường mới phải xử lý `undefined`, không chỉ mảng rỗng. Tenant chưa có dữ liệu → `byChieu = []` ⇒ ẩn toàn bộ khối thông báo.

**4e. Trình bày:** tiền dùng class `.tabular` + `formatMoney` (chuỗi/BigInt) + ` ₫`; ngày giờ VN `dd/MM/yyyy` lấy từ kỳ đang lọc; **cấm hardcode hex/px**; không tô kiểu nội tuyến trong `features/`.

**4f. Token.** `--info-700/50/200` đã có sẵn (`apps/web/src/styles/tokens.css:15-18`) và `Alert` đã map đúng bộ ba ⇒ **không cần thêm token**, chỉ thêm **một dòng ánh xạ ngữ nghĩa** vào tài liệu:

> Thay đổi trạng thái **đã kiểm chứng**, cần rà soát (không phải lỗi) → `--info-700` / nền `--info-50` / viền `--info-200`

**4g. Bốn trạng thái** (`ui.md`): rảnh / đang tải / rỗng / lỗi — `summary` lỗi không được gây màn trắng.

### Gói 5 — Đồng bộ tài liệu và luật

| File:dòng | Việc |
|---|---|
| `.claude/rules/ui.md:19` | *"nhãn mã trạng thái lấy từ `statusLabels.ts`"* → `@vat/domain` |
| `docs/06-BINDING_MAP.md:91, :104, :143` | Hợp đồng `/invoices/summary` (3 số đếm + khối thay đổi ở `ChieuSummary`); §4.2 nhãn `tthai` 1–5; **§4.4 (`:104`)** catalog cột phẳng 29→31 (KHÔNG phải §4.1 `:81-83` — đó là `EXPORT_COLUMNS` cấp hóa đơn). Sửa 3 chỗ doc lệch mã: `lineDetailRenderColumns` → `flatRenderColumns`; "xlsx 2 sheet – csv 2 khối" → **một sheet phẳng**; `POST /exports` thiếu `cols` |
| `docs/07-DESIGN_TOKENS.md:12, :56, :137` | Ánh xạ mới (4f); "trạng thái chưa kiểm chứng = trung tính" → "**mã ngoài tập 1–5**"; QĐ-11 |
| `README.md:30` · `docs/CHECKLIST-NGHIEM-THU.md:44, :208, :212, :247` | Gỡ nhãn "CHƯA KIỂM CHỨNG / map RỖNG"; thêm mục nghiệm thu U36 |
| `docs/plans/EXPORT-cot-tuy-chon-2026-07-23.md` | 29→31 cột, mặc định 16→19, khóa localStorage v2 |
| `docs/BANG-CHUNG-…-2026-07-28.md` | Đánh dấu §8.1 đã thực hiện |
| `docs/BACKLOG-y-tuong-va-de-xuat.md` | Ghi mục `FindingKind` mở rộng (đẩy khỏi U36) |

---

## 5. Tiêu chí nghiệm thu

| # | Tiêu chí | Cách kiểm |
|---|---|---|
| 1 | Tổng **tiền** không cộng hóa đơn `tthai=4` | Tích hợp: 1 HĐ mã 4 + 1 HĐ mã 2 → tổng = chỉ mã 2 |
| 2 | `tthai = NULL` **vẫn được cộng** | Test bẫy `NOT IN` + `NULL` |
| 3 | `tthai=5` **vẫn được cộng** (QĐ-4) | Test cặp 3/5 → tổng = 0 |
| 4 | Kỳ chỉ có mã 4 → `thueDaLoai` là **số, KHÔNG null** | Test bẫy `SUM` tập rỗng |
| 5 | Kỳ chỉ có mã 4 → `count > 0` ⇒ **KHÔNG tự kích hoạt đồng bộ** (QĐ-7) | Test `apps/web` |
| 6 | Một `chieu` toàn mã 4 vẫn **còn trong `byChieu`**, `countTinhTong = 0` | Test group-by |
| 7 | Tenant **chưa có dữ liệu** → `byChieu = []` ⇒ ẩn thông báo, không crash | Test `apps/web` |
| 8 | Client chịu được shape CŨ (`soMaLa === undefined`) không ném | Test `apps/web` |
| 9 | File tải về đúng **19 cột mặc định**, 3 cột trạng thái ngay sau `Tổng tiền (sau thuế)` | `flatExport.test.ts` + `lineDetail.test.ts` |
| 10 | Không cột nào thiếu hàm sinh ô (fail-loud) | **`xlsxMapping.test.ts`** phải XANH — dựng `HEADERS` động, chỉ đỏ khi quên gắn ô |
| 11 | `Tính vào tổng` = "Không" cho mã 4; "Có" cho 1/2/3/5/null/mã lạ | Unit `O_THEO_KEY` |
| 12 | Nhãn trạng thái **một nguồn** — `apps/web` và `packages/export` cho cùng chuỗi | Test đối chiếu, cùng gọi `nhanTthai` |
| 13 | Người dùng **đã lưu cột cũ** vẫn thấy 3 cột mới | Test `exportColsStore` với khóa v1 tồn tại |
| 14 | Chip mã 4/5 **không tô xanh** (QĐ-11) | Test `chips.tsx` |
| 15 | Thông báo đúng số + tiền **theo từng chiều**, ẩn khi không có thay đổi, **luôn kèm dòng giải thích §8.2** | Test `apps/web` |
| 16 | `soMaLa > 0` → hiện cảnh báo mã chưa xác định (QĐ-6) | Seed HĐ `tthai=9` |
| 17 | Số **tiền** không đi qua `Number()`/`parseFloat` (số đếm được phép) | Rà mã + test số > 2^53 |
| 17b | **Thuế phải nộp** đúng dấu: bán ra làm **giảm**, mua vào làm **tăng** (QĐ-12) | Unit: dựng mã 4 ở cả hai chiều, kiểm dấu; ca số > 2^53 bằng BigInt |
| 17c | Dòng "Thuế phải nộp" **ẩn** khi cả hai chiều không có mã 4 | Test `apps/web` |
| 18 | Chuỗi nhiều đời A→B→C: loại mã 4 vẫn đúng | Unit dựng 3 đời — §8.3 |
| 19 | Cách ly tenant giữ nguyên | Tích hợp đa tenant |
| 20 | `GET /reconcile` trả finding `thay_the` khi có mã 4 | **Thêm seed `tthai:4`** vào `reconcile.route.test.ts` → `thayThe === 1` |
| 21 | Cổng bằng chứng vẫn chặn mã chưa kiểm chứng | Thử điền mã 6 → phải đỏ |
| 22 | `make lint` sạch, `make test` xanh, coverage ≥ 80% mọi gói chạm | Lệnh chuẩn |

### 5.1 Số liệu nghiệm thu thủ công — đo thật 2026-07-28

⚠️ **20.335.925đ là tổng TOÀN BỘ dữ liệu (3 tenant, 5 tháng) — KHÔNG dùng nghiệm thu một kỳ.** Số đúng theo kỳ, tenant MST `4201969169`, chiều **bán ra**:

| Kỳ | Số HĐ mã 4 | Thuế phải giảm | Tổng thanh toán phải giảm |
|---|---|---|---|
| 2026-04 | 6 | 7.787.702 ₫ | 105.134.000 ₫ |
| 2026-05 | 5 | 9.257.482 ₫ | 124.976.000 ₫ |
| 2026-06 | 3 | 1.579.630 ₫ | 21.325.000 ₫ |
| **2026-07** | **3** | **1.711.111 ₫** | **23.100.000 ₫** |

Chiều **mua vào**: mọi kỳ hiện **0 hóa đơn mã 4**. ⚠️ **Không coi là quy luật** — chỉ có đúng 1 ca thay thế ở chiều mua vào trong toàn bộ dữ liệu, và biên bản §6.5 **đã rút** kết luận "GDT không trả bản gốc cho bên mua". Mã 4 ở chiều mua vào có thể xuất hiện bất cứ lúc nào ⇒ **mã và test phải xử lý hai chiều như nhau**.

Nghiệm thu: mở kỳ 07/2026, chiều Bán ra → tổng thuế giảm **đúng 1.711.111 ₫**.

---

## 6. Golden test sẽ ĐỎ (chủ đích)

| Test | Vì sao |
|---|---|
| `packages/domain/test/unit/flatExport.test.ts:17, :29, :60, :127, :157, :195` | `length===29` · `Set.size===29` · `FLAT_EXPORT_COLUMNS[28]` · `FLAT_EXPORT_KEYS.size===29` · `DEFAULT_KEYS.length===16` · `not.toContain("tthai")`. Sửa `[28]` → `.at(-1)` để không cột-hoá chỉ số lần nữa. Sửa cả chữ ở `:2, :15, :154, :165` |
| `packages/export/test/unit/lineDetail.test.ts:109-127` | `DEFAULT_HEADERS` 16 nhãn cứng → 19 |
| `apps/web/test/lib/statusLabels.test.ts:9` | `labelTthai(5)` không còn "(chưa rõ)" |
| `packages/reconcile/test/contract/statusCodes.contract.test.ts:32` | Map không còn rỗng — **cổng, sửa kèm bằng chứng** |
| `apps/api/test/integration/invoices.route.test.ts` | Hợp đồng `summary` thêm trường |
| **Mock summary** (không phải golden — sẽ **crash** nếu không sửa) | `apps/web/test/helpers/renderApp.tsx:62-66` (dùng chung MỌI test web) · `invoicesUK4.test.tsx:25-30` · `invoiceSummaryStats.test.tsx:61-63` |

**KHÔNG đỏ** (bản trước ghi nhầm): `exportCols.test.tsx:36,42` (matcher `/Về mặc định/` không chứa số; `:43` dùng hằng động) · `lineDetail.test.ts:140-150` (khẳng định tương đối) · `flatExport.test.ts:52, :167` · `xlsxMapping.test.ts:87,112-113` (dựng động) · `reconcile.route.test.ts` (seed toàn `tthai:1` — phải **chủ động thêm seed** mới kiểm được, xem tiêu chí #20).

Mỗi lần sửa golden ghi **"đổi có chủ đích + lý do + dẫn chiếu"** trong commit.

---

## 7. Rủi ro

**7.1 Mã "hủy" chưa biết.** Nếu GDT trả mã hủy thật (giả thiết `6`), quy tắc chỉ-loại-mã-4 **vẫn cộng hóa đơn đã hủy vào tổng**. Chấp nhận có ý thức. **Giảm nhẹ bắt buộc:** trường `soMaLa` + cảnh báo 4c + tiêu chí #16. Không có bước này thì rủi ro thành **im lặng**.

**7.2 Số liệu đổi so với trước.** Tổng các kỳ đã qua sẽ khác con số người dùng từng thấy và từng xuất file. **Bắt buộc** dòng giải thích ở 4b + ghi `changelog.ts` — tiêu chí #15.

**7.3 Chuỗi nhiều đời chưa quan sát.** Trong 33.929 hóa đơn **không có** ca thay thế lại bị thay thế tiếp (`shdgoc` chỉ ở mã 2/3; ghép cặp 1-1 kín, 0 ngoại lệ). Kiểm tay ca A→B→C: quy tắc **loại mã 4 vẫn đúng**; công thức ròng kiểu `Σ(2)−Σ(4)` sẽ **trừ hai lần** — lý do nữa để §2.1 bỏ nó. Tiêu chí #18 khóa hành vi.

**7.4 File xuất vẫn chứa hóa đơn mã 4 (QĐ-5).** Kế toán pivot cột "Tổng thanh toán (cả HĐ)" trên file sẽ **ra số cũ** nếu không lọc cột "Tính vào tổng". Đánh đổi có chủ đích — chính là lý do QĐ-1 chọn thêm cột "Tính vào tổng".

**7.5 Cỡ mẫu bằng chứng.** Nhánh `2→4` vững (17 cặp); nhánh `3→5` chỉ 3 cặp; chiều mua vào chỉ 1 ca thay thế. Gặp dữ liệu mâu thuẫn → **dừng và báo**, không tự vá.

**7.6 Nhãn tiếng Việt chưa đối chiếu văn bản pháp quy.** "Thay thế / Bị thay thế / Điều chỉnh / Bị điều chỉnh" suy từ cấu trúc dữ liệu. Nên đối chiếu tài liệu Tổng cục Thuế trước khi phát hành rộng.

**7.7 Tương tác U35.** Panel "Hóa đơn vừa thay đổi" sẽ đổi chuỗi từ `1 (chưa rõ) → 4 (chưa rõ)` thành `Gốc → Bị thay thế`. Là cải thiện, nhưng là đổi hiển thị người dùng đang quen ⇒ ghi vào `changelog.ts`.

---

## 8. Trạng thái duyệt

Cả hai câu hỏi mở đã được chủ dự án chốt ngày **2026-07-28**:

1. ✅ **Có** dòng "Thuế phải nộp thay đổi" → **QĐ-12**, §2.3
2. ✅ **Giữ** màu chip như đề xuất → **QĐ-11**

**Không còn câu hỏi mở. Kế hoạch sẵn sàng thực thi.**
Prompt điều phối cho phiên thực thi: `docs/plans/U36-prompt-dieu-phoi.md`.

---

## 9. Liên quan

- `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md` — nguồn bằng chứng
- `docs/plans/U35-plan.md` + `U35-tien-do.md` — tầng lưu vết, **đã chạy**
- `docs/plans/EXPORT-cot-tuy-chon-2026-07-23.md` — cơ chế cột tùy chọn mà Gói 2 mở rộng
- **U37 (tiếp theo)** — liên kết cặp gốc ↔ thay thế qua `shdgoc`/`khhdgoc`/`khmshdgoc`/`tdlhdgoc`; mở khóa mức thay đổi ròng thật; **ghép đủ khóa** theo cảnh báo §6.6 biên bản (ký hiệu `C26MYY` dùng bởi hai người bán khác nhau, số hóa đơn trùng)

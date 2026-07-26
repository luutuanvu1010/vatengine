# Handoff: Danh sách hóa đơn (S1) — polish trình bày

## Overview
Bản polish trang **Danh sách hóa đơn** của VAT Engine (`apps/web`, repo `vatengine`, branch `feat/cloudflare-stack-u0`). Trang đã được thu gọn thành công cụ **chọn kỳ → xem số lượng → xuất/đồng bộ** (không còn bảng danh sách). Nhiệm vụ polish: làm **phân cấp thị giác rõ + nhịp khoảng cách nhất quán**, biến số đếm thành **stat/KPI**, tách 3 vùng thao tác. **KHÔNG thêm chức năng, KHÔNG thêm dữ liệu, thuần bề mặt.**

Nguồn brief: `docs/design/BRIEF-danh-sach-hoa-don-2026-07-23.md`.

## About the Design Files
File `Danh sách hóa đơn.dc.html` trong bundle là **bản thiết kế tham chiếu viết bằng HTML** — prototype thể hiện diện mạo + hành vi mong muốn, **không phải code để copy nguyên**. Việc cần làm: **tái hiện thiết kế này vào codebase React + Vite hiện có** (`apps/web`), dùng đúng primitive/token/pattern đã có. HTML dùng inline style + `var(--…)` chỉ để mô phỏng; code thật phải qua **primitive dùng chung + token**, không tô kiểu nội tuyến trong `features/` (test `test/conventions/ui-luat.test.ts` chặn `style=` trên input/select).

## Fidelity
**High-fidelity (hifi)** — màu/typography/spacing/bo góc lấy đúng từ `apps/web/src/styles/tokens.css` (nguồn: `docs/07-DESIGN_TOKENS.md`). Tái hiện pixel-perfect bằng primitive sẵn có; nơi thiếu primitive thì **thêm primitive mới** (xem mục Primitive cần thêm).

## Ràng buộc CỨNG (brief §4 — không được vi phạm)
1. **Chỉ token + primitive.** Màu/khoảng cách/chữ chỉ qua biến `--…`; nút/ô nhập/ô chọn dùng primitive chung. Thiếu → thêm primitive vào `components/ui/primitives.tsx`, KHÔNG tô inline trong `features/`.
2. **KHÔNG thêm lại "Tổng thanh toán"** hay bất kỳ số tiền nào. Trang này là **đếm + xuất**.
3. **KHÔNG dựng lại bảng** danh sách, không cột, không chọn dòng, không phân trang.
4. **Nhãn một nguồn** — mã trạng thái từ `statusLabels.ts`; enum chiều/nguồn từ Registry `@vat/domain` (`INVOICE_FIELDS`), không gõ chuỗi rời.
5. **Hợp đồng tương tác giữ nguyên:** "Lọc dữ liệu" = đọc nhẹ (đọc dữ liệu ĐÃ có); "Đồng bộ và tải xuống" = kéo nặng chạy nền. Tên + vị trí phản ánh đúng, không trộn.
6. **Đủ 4 trạng thái** (loading/error/empty/data) + an toàn đa tenant ở client.
7. **Không đổi hợp đồng API, không đổi `apps/api`/`packages`.** Thuần `apps/web` (tokens/primitives + `features/invoices`).

## Screens / Views

### Trang: Danh sách hóa đơn (`/invoices`)
**Purpose:** Kế toán chọn kỳ + bộ lọc, xem SỐ LƯỢNG hóa đơn khớp, rồi xuất (Excel/CSV) hoặc đồng bộ mới từ Tổng cục Thuế.

**Layout (giữ nguyên chrome `AppLayout` hiện có):** sidebar trái 248px + cột nội dung (header 60px + `<main>` padding `--sp-6`, `max-width:1200px`). Nội dung trang xếp DỌC 3 khối card, cùng nhịp `margin-bottom:var(--sp-4)`:

1. **PageHeader** — `title="Danh sách hóa đơn"`, `subtitle="Hóa đơn điện tử kéo trực tiếp từ Tổng cục Thuế"` (giữ nguyên component `PageHeader`).

2. **Card (a) — Bộ lọc** (`FilterBar`):
   - Nhãn section nhỏ "BỘ LỌC": `--fs-sm`, `--fw-bold`, `text-transform:uppercase`, `letter-spacing:.05em`, màu `--text-tertiary`, margin-bottom `--sp-4`.
   - **Nhóm "kỳ nhanh"** (`ChonKy`): 3 nút Tháng/Quý/Năm dạng **segmented control** — 1 hộp nền `--surface-muted`, viền `--border`, bo `--radius-md`, padding 2px; nút đang chọn nền `--surface-card` + `--shadow-sm` + chữ `--brand-700`; nút thường nền trong suốt + chữ `--text-secondary`. Kèm 2 `Select` Năm + Tháng.
   - **Hairline** ngăn cách: `border-top:1px solid var(--border-subtle)`.
   - **Nhóm khoảng ngày + lọc:** `Field type=date` Từ ngày / Đến ngày, `Select` Chiều, `Select` Nguồn, `Field` MST người bán (font `--font-mono`), và nút **"Lọc dữ liệu"**. Hàng dùng `display:flex; gap:var(--sp-4); flex-wrap:wrap; align-items:end`.
   - Footer note: "Đã ghi nhớ bộ lọc gần nhất · Giờ hiển thị theo VN (UTC+7)" — `--fs-xs`, `--text-disabled`, margin-top `--sp-4`.
   - **THAY ĐỔI so với hiện tại:** nút **"Lọc dữ liệu" đổi từ primary → `variant="secondary"`** (đọc nhẹ), để tách trọng số thị giác với "Đồng bộ và tải xuống".

3. **Card (b) — Đồng bộ từ Tổng cục Thuế** (`RangeSyncPanel`, chỉ hiện khi `canManageTaxAccounts(role)` + có kỳ):
   - Nhãn section "ĐỒNG BỘ TỪ TỔNG CỤC THUẾ".
   - Nút **"Đồng bộ và tải xuống"** = **primary** (`--brand-600`, chữ trắng, `--shadow-sm`, `white-space:nowrap`), hover `--brand-700`. Đây là hành động NẶNG, chính của panel.
   - Câu phụ `--fs-sm`/`--text-tertiary`: "Kéo dữ liệu mới trực tiếp từ máy chủ thuế cho khoảng kỳ đã chọn (chạy nền), rồi tự tải file khi xong."
   - Giữ nguyên `ProgressBar` + các `Alert` trạng thái đồng bộ (phien_het_han / loi_gui / loi_dong_bo / xong) từ code hiện tại.

4. **Card (c) — Kết quả + Xuất:**
   - Nhãn section "KẾT QUẢ".
   - **4 trạng thái:**
     - Loading → `<Loading/>` ("Đang tải…").
     - Error → `<ErrorState message="Không đếm được hóa đơn." onRetry={…}/>`.
     - Empty (count 0) → `<EmptyState/>` với thông điệp: bình thường "Không có hóa đơn khớp bộ lọc. Thử mở rộng kỳ hoặc bỏ bớt điều kiện."; khi đang đồng bộ nền giữ thông điệp riêng như hiện tại.
     - Data → **Stat/KPI** (xem dưới).
   - **Stat block (tiêu điểm):** hàng baseline gồm SỐ ĐẾM cỡ `--fs-3xl` (30px), `--fw-extrabold`, `.tabular` (tabular-nums), màu `--text-primary`; cạnh phải là nhãn phụ "hóa đơn khớp bộ lọc" `--fs-sm`/`--text-tertiary`.
   - **Badge kỳ đang xem** (tùy chọn, mặc định BẬT): pill nền `--surface-muted`, viền `--border-subtle`, bo `--radius-pill`, padding `--sp-1 --sp-3`, `--fs-xs`/`--fw-semibold`. Nội dung "Kỳ 01/07 – 31/07/2026" lấy từ `filter.tuNgay/denNgay` (định dạng dd/MM – dd/MM/yyyy). **Dữ liệu ĐÃ có ở client, không gọi thêm API.**
   - **Nút Xuất** (`InvoiceExportButtons`, chỉ vai `canExport`): "Xuất Excel" + "Xuất CSV", `variant="secondary"` (thứ cấp), dạt phải (`justify-content:space-between` với stat).

## Interactions & Behavior
- **"Lọc dữ liệu":** áp `draft` filter (đọc `/invoices/summary` với bộ lọc) — nhẹ, đồng bộ với hành vi hiện tại. `ChonKy` (Tháng/Quý/Năm) áp NGAY khi bấm.
- **"Đồng bộ và tải xuống":** gọi backfill nền + poll tiến độ (giữ `useRangeBackfill`), xong thì tự xuất+tải (giữ logic `taiXuatHoaDon`). Không đổi luồng.
- **RBAC:** vai `ke_toan` ẩn card Đồng bộ + nút Xuất + nav Kết xuất/Kết nối thuế (giữ `rbac.ts`; server vẫn là biên tin cậy).
- **Hover:** nút secondary → nền `--surface-hover`; nút primary → `--brand-700`.
- **Responsive (≤767px):** sidebar thành drawer trượt (`transform:translateX(-100%)` → `0`), mở bằng hamburger ở header + overlay `rgba(32,33,36,.45)`; header ẩn nhãn vai, pill tên công ty `max-width:150px`; padding main/card giảm về `--sp-4`; các hàng lọc + nút tự `flex-wrap`. Giữ đúng mẫu `AppLayout` + `useMediaQuery(MOBILE_QUERY)` đã có.

## State Management
- Giữ nguyên state hiện tại: `filter` (InvoiceFilter, mặc định = tháng hiện tại VN), `summary` query (`api.getSummary(filter)` → `total.count`), `useRangeBackfill`, `taiSauDongBo`, `xuatSauDongBo`.
- **Không thêm state mới** cho phần polish (badge kỳ suy từ `filter`; stat suy từ `count`).

## Đề xuất TÙY CHỌN (brief §6 — cần chủ dự án duyệt, mặc định TẮT)
**Tách số đếm theo chiều:** "Mua vào N₁ · Bán ra N₂" (chỉ SỐ LƯỢNG, KHÔNG tiền), lấy từ `summary.byChieu[]` (đã có, không gọi thêm API). Chip Mua vào dùng `--info-*`, Bán ra dùng `--success-*`. Chỉ bật nếu được duyệt.

## Primitive cần thêm (KHÔNG tô inline trong features/)
Thêm vào `apps/web/src/components/ui/primitives.tsx`:
- **`Stat`** — hiển thị số lớn + nhãn phụ: props `{ value: string|number; label: string; badge?: ReactNode }`. Số: `--fs-3xl`, `--fw-extrabold`, class `tabular`, `--text-primary`. Nhãn: `--fs-sm`, `--text-tertiary`.
- **`Badge`/`Chip`** (nếu chưa có) — pill nền `--surface-muted`, viền `--border-subtle`, `--radius-pill`, `--fs-xs`/`--fw-semibold`; biến thể tone `info`/`success` cho tách-theo-chiều.
- **`SegmentedControl`** (tùy chọn) cho nhóm Tháng/Quý/Năm — hoặc giữ `Button variant="secondary"` như hiện tại nếu không muốn thêm primitive.

## Design Tokens (từ `apps/web/src/styles/tokens.css`)
- **brand:** `--brand-600 #c5221f`, `--brand-700 #a52714`, `--brand-800 #8e1714`, `--brand-50 #fcf6f5`
- **danger:** `--danger-600 #d93025`, `--danger-50 #fce8e6`, `--danger-200 #f5c6c0`
- **info:** `--info-600 #1a73e8`, `--info-700 #1558b0`, `--info-50 #e8f0fe`, `--info-200 #c6dafc`
- **success:** `--success-600 #188038`, `--success-700 #256b3f`, `--success-50 #e6f4ea`, `--success-200 #a8dab5`
- **warning:** `--warning-700 #b06000`, `--warning-800 #8a5a00`, `--warning-50 #fef7e0`, `--warning-200 #fde9a8`
- **text:** primary `#202124`, secondary `#3c4043`, tertiary `#5f6368`, disabled `#80868b`, on-brand `#fff`
- **border/surface:** `--border #dadce0`, `--border-subtle #e6e8eb`, `--border-strong #bdc1c6`; `--surface-page #f8f9fa`, `--surface-card #fff`, `--surface-muted #f1f3f4`, `--surface-hover #eef0f2`
- **font:** `--font-sans "Be Vietnam Pro"…`, `--font-mono "JetBrains Mono"…`; weights 400/500/600/700/800
- **type scale:** xs 12 · sm 13 · base/md 16 · lg 18 · xl 20 · 2xl 24 · **3xl 30**; lh-body 1.5, lh-heading 1.25
- **spacing:** sp-1 4 · sp-2 8 · sp-3 12 · sp-4 16 · sp-5 20 · sp-6 24 · sp-8 32 · sp-10 40 · sp-12 48
- **radius:** sm 8 · md 10 · lg 12 · xl 14 · pill 20 · full 9999
- **shadow:** `--shadow-sm`, `--shadow-md` (như tokens.css)

## Assets
Không có ảnh. Wordmark "VATEngine" (⚡ trong ô `--brand-600` + "VAT" trung tính + "Engine" đỏ) giữ nguyên component `Brand`. Icon: hệ thống dùng Lucide qua `Icon` wrapper (nếu cần) — không hardcode SVG.

## Cổng kiểm nghiệm thu (brief §7 — phải Đạt hết trước khi chốt)
1. Đúng tầng (token/primitive/pattern/trang — không vá ở ngọn).
2. Nhãn một nguồn; không chuỗi rời.
3. Chỉ primitive + token; cần kiểu mới → thêm primitive. `test/conventions/ui-luat.test.ts` XANH.
4. Nghĩa hành động đúng (đọc nhẹ vs kéo nặng); tên/vị trí đúng.
5. Đủ 4 trạng thái + an toàn đa tenant + không bịa giá trị chưa kiểm chứng.
6. KHÔNG re-thêm tiền/bảng/cột.
7. `tsc --noEmit` + `biome check` sạch; test `apps/web` XANH (cập nhật test bề mặt, không giảm phủ).
8. Xem thử bằng mắt (dev + build tĩnh) → **chủ dự án duyệt thẩm mỹ** trước khi deploy `vat-web`.

## Files
- `Danh sách hóa đơn.dc.html` — prototype thiết kế (trong bundle này). Mở trực tiếp bằng trình duyệt để xem 4 trạng thái + RBAC (có sẵn tweak `vaiTro`, `trangThai`, `hienBadgeKy`, `tachTheoChieu`).
- Code thật cần sửa (repo `vatengine`, `apps/web/src`):
  - `features/invoices/InvoicesPage.tsx`
  - `features/invoices/FilterBar.tsx`
  - `features/invoices/ChonKy.tsx`
  - `features/invoices/RangeSyncPanel.tsx`
  - `features/invoices/InvoiceExportButtons.tsx`
  - `components/ui/primitives.tsx` (thêm `Stat`/`Badge`)
  - Test bề mặt tương ứng trong `test/`.

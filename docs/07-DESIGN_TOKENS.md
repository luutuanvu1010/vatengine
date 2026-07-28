# 07-DESIGN_TOKENS — Nguồn token DUY NHẤT (VATEngine UI)

> **Thẩm quyền:** Đây là **nguồn chân lý DUY NHẤT** về màu/typography/spacing/bo góc/đổ bóng cho `apps/web` (Hiến pháp — không tạo nguồn token thứ hai). Giá trị được **chắt (distill)** từ CSS bản export Claude Design (`docs/design/claude-design/*.html`, giải nén `<style>` template) — **chuẩn hóa về thang kỷ luật, không dán nguyên giá trị lẻ** của công cụ thiết kế ("dịch, không dán"). Chỉ **light mode** (brief §5 — chưa cần dark mode).
>
> **Serialization máy:** khi dựng `apps/web` (Bước 4.3), block `:root` §7 dưới đây được chép **nguyên văn** vào `apps/web/src/styles/tokens.css` và là artifact tuân thủ; mọi component chỉ dùng biến `--…`, KHÔNG hardcode hex. Đổi giá trị → sửa ở file này trước.
>
> **Bằng chứng màu (tần suất trong export):** `#c5221f`(140) `#d93025`(35) `#1a73e8`(30) `#188038`(55) `#b06000`(30) + thang xám Google `#202124/#3c4043/#5f6368/#80868b/#dadce0/#f8f9fa`.

## 1. Nguyên tắc

- **TÁCH đỏ-thương-hiệu vs đỏ-cảnh-báo** (yêu cầu cứng brief §5): `--brand-*` (`#c5221f`, hơi ngả nâu-đỏ) cho thương hiệu + hành động chính; `--danger-*` (`#d93025`, đỏ tươi hơn) CHỈ cho cảnh báo lệch thuế/lỗi phá hủy. **Không** dùng lẫn.
- **Đỏ THỨ BA — `--notify-*`, chỉ cho SỐ ĐẾM CHƯA ĐỌC** (chủ dự án chốt 2026-07-28). Chấm đỏ trên nút "Hóa đơn vừa thay đổi" không phải lỗi (đã là `--info-*` theo dòng dưới) và cũng không phải thương hiệu — nó là tín hiệu "có thứ mới, chưa xem", quy ước thị giác quen thuộc từ ứng dụng di động. Tách token riêng để sau này đổi sắc đỏ thông báo KHÔNG kéo theo màu cảnh báo lệch thuế, và ngược lại. **Không** dùng `--notify-*` cho bất kỳ mục đích nào khác.
- **Mã ngoài tập đã kiểm chứng = màu trung tính.** Chip mang mã `tthai` ngoài tập 1–5, mọi chip `ttxly` (ý nghĩa chưa kiểm chứng), và finding `hủy` dùng `--neutral-*` — KHÔNG tô đỏ/xanh gợi ý ngữ nghĩa chưa có bằng chứng.
- **Trạng thái đã kiểm chứng ≠ đều là tin tốt** (QĐ-11, 2026-07-28). Trong `tthai` 1–5, CHỈ mã `1` (Gốc) dùng `--success-*`; `2`–`5` (Thay thế / Điều chỉnh / Bị thay thế / Bị điều chỉnh) dùng `--neutral-chip-*`. `--success-*` mang nghĩa "số dương / trạng thái tốt"; tô nó cho "Bị thay thế" là nói sai nghiệp vụ.
- **Thay đổi ĐÃ KIỂM CHỨNG, cần rà soát (không phải lỗi)** → `--info-700` / nền `--info-50` / viền `--info-200` (primitive `Alert` tone `info`). Dùng cho thông báo "hóa đơn bị thay thế đã bị loại khỏi tổng".
- **Số tiền dùng `tabular-nums`** (căn cột đều) — bằng chứng: `font-variant-numeric:tabular-nums` trong export.

## 2. Màu — nền tảng (primitive)

| Nhóm | Token | Hex | Dùng |
|---|---|---|---|
| **Brand đỏ** | `--brand-600` | `#c5221f` | Nút chính, wordmark, nav active |
| | `--brand-700` | `#a52714` | Hover |
| | `--brand-800` | `#8e1714` | Pressed/active |
| | `--brand-50` | `#fcf6f5` | Nền tint (nav active, hàng nhấn) |
| **Danger đỏ** (cảnh báo) | `--danger-600` | `#d93025` | Lệch thuế, lỗi phá hủy |
| | `--danger-50` | `#fce8e6` | Nền banner cảnh báo |
| | `--danger-200` | `#f5c6c0` | Viền cảnh báo |
| **Info xanh dương** | `--info-600` | `#1a73e8` | Link "Xem chi tiết", chiều **Mua vào** |
| | `--info-700` | `#1558b0` | Hover link |
| | `--info-50` | `#e8f0fe` | Nền chip mua vào/thông tin |
| | `--info-200` | `#c6dafc` | Viền |
| **Success xanh lá** | `--success-600` | `#188038` | Số dương, chiều **Bán ra** |
| | `--success-700` | `#256b3f` | Đậm |
| | `--success-50` | `#e6f4ea` | Nền chip bán ra |
| | `--success-200` | `#a8dab5` | Viền |
| **Warning hổ phách** | `--warning-700` | `#b06000` | Chữ "nghi thiếu" |
| | `--warning-800` | `#8a5a00` | Đậm |
| | `--warning-50` | `#fef7e0` | Nền thẻ nghi thiếu |
| | `--warning-200` | `#fde9a8` | Viền |

## 3. Màu — trung tính (Google grey)

| Token | Hex | Dùng |
|---|---|---|
| `--text-primary` | `#202124` | Chữ chính, số tiền |
| `--text-secondary` | `#3c4043` | Chữ phụ |
| `--text-tertiary` | `#5f6368` | Nhãn, caption |
| `--text-disabled` | `#80868b` | Placeholder, mờ, "(chưa rõ)" |
| `--text-on-brand` | `#ffffff` | Chữ TRÊN nền màu đậm (brand/success/danger…) — token ngữ nghĩa, thay vì hardcode `#fff` ở `features/` |
| `--border-strong` | `#bdc1c6` | Viền input focus-off |
| `--border` | `#dadce0` | Viền thẻ/bảng mặc định |
| `--border-subtle` | `#e6e8eb` | Kẻ dòng bảng |
| `--surface-page` | `#f8f9fa` | Nền trang |
| `--surface-card` | `#ffffff` | Nền thẻ/bảng |
| `--surface-muted` | `#f1f3f4` | Nền phụ (chip, header bảng) |
| `--surface-hover` | `#eef0f2` | Hover hàng/nút phụ |
| `--surface-inverse` | `#202124` | Nền ĐẢO (đậm) — tooltip/popover nổi trên nền sáng (Task 11 InfoTip). Trùng giá trị `--text-primary` ở theme sáng **là chủ đích** — hai ngữ nghĩa khác nhau (chữ vs nền), không phải trùng lặp cần gộp |
| `--neutral-chip-bg` | `#f1f3f4` | Nền chip trạng thái **trung tính**: mã chưa kiểm chứng, và mã `tthai` 2–5 (QĐ-11) |
| `--notify-600` | `#fe2c55` | Nền chấm **số đếm chưa đọc** — CHỈ dùng cho mục đích này |
| `--notify-fg` | `#ffffff` | Chữ trên chấm số đếm chưa đọc |
| `--neutral-chip-fg` | `#3c4043` | Chữ chip trung tính |

## 4. Typography

- **Font chữ:** `--font-sans: 'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;` — Be Vietnam Pro hỗ trợ **đầy đủ dấu tiếng Việt**, nét dày (brief §5). Icon: `'Material Symbols Outlined'`.
- **Trọng lượng:** `--fw-regular:400` · `--fw-medium:500` · `--fw-semibold:600` · `--fw-bold:700` · `--fw-extrabold:800`. Tiêu đề/nhãn ưu tiên 600–800 (nét đậm dễ đọc).
- **Số tabular:** cột tiền + số liệu dùng `font-variant-numeric: tabular-nums;` (class tiện ích `.tabular`).
- **Thang cỡ chữ** (chuẩn hóa từ cụm 11.5–34px của export):

| Token | px | Dùng |
|---|---|---|
| `--fs-xs` | 12 | Caption, nhãn nhỏ, mã |
| `--fs-sm` | 13 | Phụ, meta bảng |
| `--fs-base` | 16 | Thân mặc định, ô bảng |
| `--fs-md` | 16 | Nhấn, input |
| `--fs-lg` | 18 | Tiêu đề thẻ |
| `--fs-xl` | 20 | Tiêu đề mục |
| `--fs-2xl` | 24 | Tiêu đề trang |
| `--fs-3xl` | 30 | Số liệu thẻ lớn (Dashboard) |

Line-height: thân `1.5`, tiêu đề `1.25`.

## 5. Spacing (thang 4px)

`--sp-1:4px` · `--sp-2:8px` · `--sp-3:12px` · `--sp-4:16px` · `--sp-5:20px` · `--sp-6:24px` · `--sp-8:32px` · `--sp-10:40px` · `--sp-12:48px`. Mật độ **thoáng** (brief §5): padding thẻ `--sp-6`, khoảng cách khối `--sp-6`/`--sp-8`, ô bảng dọc `--sp-3`.

## 6. Bo góc, viền, đổ bóng

- Bo góc (chuẩn hóa từ 6–20px): `--radius-sm:8px` (chip/nút nhỏ) · `--radius-md:10px` (input/nút) · `--radius-lg:12px` (thẻ) · `--radius-xl:14px` (thẻ lớn/logo) · `--radius-pill:20px` (chip bo tròn) · `--radius-full:9999px` (avatar).
- Viền: `1px solid var(--border)`.
- Đổ bóng (nhẹ, Material): `--shadow-sm: 0 1px 2px rgba(60,64,67,.08), 0 1px 3px rgba(60,64,67,.06)` · `--shadow-md: 0 1px 3px rgba(60,64,67,.12), 0 4px 8px rgba(60,64,67,.08)`.

## 7. Block `:root` chuẩn (chép nguyên vào `apps/web/src/styles/tokens.css`)

```css
:root {
  /* brand (đỏ thương hiệu) */
  --brand-600:#c5221f; --brand-700:#a52714; --brand-800:#8e1714; --brand-50:#fcf6f5;
  /* danger (đỏ cảnh báo — TÁCH khỏi brand) */
  --danger-600:#d93025; --danger-50:#fce8e6; --danger-200:#f5c6c0;
  /* info (xanh dương) */
  --info-600:#1a73e8; --info-700:#1558b0; --info-50:#e8f0fe; --info-200:#c6dafc;
  /* success (xanh lá) */
  --success-600:#188038; --success-700:#256b3f; --success-50:#e6f4ea; --success-200:#a8dab5;
  /* warning (hổ phách) */
  --warning-700:#b06000; --warning-800:#8a5a00; --warning-50:#fef7e0; --warning-200:#fde9a8;
  /* text */
  --text-primary:#202124; --text-secondary:#3c4043; --text-tertiary:#5f6368; --text-disabled:#80868b;
  /* chữ TRÊN nền màu đậm (brand/success/danger…) */
  --text-on-brand:#ffffff;
  /* border + surface */
  --border-strong:#bdc1c6; --border:#dadce0; --border-subtle:#e6e8eb;
  --surface-page:#f8f9fa; --surface-card:#ffffff; --surface-muted:#f1f3f4; --surface-hover:#eef0f2;
  /* nền ĐẢO (đậm) — tooltip/popover nổi trên nền sáng; trùng --text-primary là chủ đích */
  --surface-inverse:#202124;
  --neutral-chip-bg:#f1f3f4; --neutral-chip-fg:#3c4043;
  /* type */
  --font-sans:'Be Vietnam Pro',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --fw-regular:400; --fw-medium:500; --fw-semibold:600; --fw-bold:700; --fw-extrabold:800;
  --fs-xs:12px; --fs-sm:13px; --fs-base:16px; --fs-md:16px; --fs-lg:18px; --fs-xl:20px; --fs-2xl:24px; --fs-3xl:30px;
  --lh-body:1.5; --lh-heading:1.25;
  /* spacing */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:24px; --sp-8:32px; --sp-10:40px; --sp-12:48px;
  /* radius */
  --radius-sm:8px; --radius-md:10px; --radius-lg:12px; --radius-xl:14px; --radius-pill:20px; --radius-full:9999px;
  /* elevation */
  --shadow-sm:0 1px 2px rgba(60,64,67,.08),0 1px 3px rgba(60,64,67,.06);
  --shadow-md:0 1px 3px rgba(60,64,67,.12),0 4px 8px rgba(60,64,67,.08);
}
```

## 8. Ánh xạ ngữ nghĩa (dùng ở component — không đoán màu tại chỗ)

| Ngữ cảnh | Token |
|---|---|
| Nút chính / wordmark / nav active | `--brand-600` (nền tint `--brand-50`) |
| Cảnh báo **lệch thuế**, banner lỗi | `--danger-600` / nền `--danger-50` / viền `--danger-200` |
| Chiều **Mua vào** (chip) | `--info-600` / nền `--info-50` |
| Chiều **Bán ra** (chip), số dương | `--success-600` / nền `--success-50` |
| **Nghi thiếu đầu ra** (chưa khẳng định) | `--warning-700` / nền `--warning-50` / viền `--warning-200` |
| Chip `tthai` = `1` (Gốc — còn nguyên hiệu lực) | `--success-700` / nền `--success-50` |
| Chip `tthai` 2–5 (Thay thế/Điều chỉnh/Bị thay thế/Bị điều chỉnh — QĐ-11), chip `ttxly`, mã ngoài 1–5 | `--neutral-chip-*` (KHÔNG tô đỏ/xanh) |
| Thông báo **thay đổi trạng thái đã kiểm chứng, cần rà soát** | `--info-700` / nền `--info-50` / viền `--info-200` |
| **Số đếm chưa đọc** (chấm trên nút, kiểu ứng dụng di động) | `--notify-600` / chữ `--notify-fg`; cắt ở `99+` |
| Số tiền, số liệu | `--text-primary` + `.tabular` (tabular-nums), căn phải |
| Nền trang / thẻ / bảng | `--surface-page` / `--surface-card` |

## 9. Font — nạp

Be Vietnam Pro qua Google Fonts (`@fontsource/be-vietnam-pro` khi dựng để tránh phụ thuộc CDN runtime; subset `vietnamese,latin`, weight 400/500/600/700/800). Không nhúng font base64 vào bundle export (đó là artifact công cụ).

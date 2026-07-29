# Kết quả chuẩn hoá ngôn ngữ & phân cấp hiển thị — `apps/web`

> Thực hiện ngày **2026-07-29**, sau khi chủ dự án duyệt bảng kiểm kê `docs/bao-cao/kiem-ke-ngon-ngu.md`.
> Phạm vi: **chỉ văn bản hiển thị và thuộc tính trình bày**. Không đổi logic nghiệp vụ, không đổi API, không đổi lược đồ dữ liệu, không đổi tên hàm/biến.

---

## 1. Quyết định đã chốt

| Mã | Nội dung | Kết quả |
|---|---|---|
| QĐ-A | Chính tả `hóa` vs `hoá` | Giữ **`hóa`**; sửa 1 chỗ lẻ `mã hoá` → `mã hóa` (`ThongTinSanPham.tsx`) |
| QĐ-B | "khách hàng" → "người mua" | **Áp**, chỉ chữ hiển thị; giữ nguyên tên file `ChonKhachHang.tsx`, tên biến, khoá API |
| QĐ-C | Nội dung `lib/changelog.ts` đã phát hành | **Giữ nguyên** — không viết lại lịch sử đã công bố; chuẩn hoá từ mốc mới |
| QĐ-D | "đường dẫn" vs "liên kết" | Chuẩn hoá về **"liên kết"** |
| QĐ-E | Khối mô tả cuối trang | Phương án **(a)** — 3 trang có mô tả dài đang chen chỗ |
| QĐ-F | Sửa `Alert` + `SectionLabel` sang cỡ đúng | **Áp** |

---

## 2. Số chuỗi đã sửa theo nhóm vấn đề

| Nhóm | Số chuỗi | Tệp bị ảnh hưởng |
|---|---|---|
| **KN** — khẩu ngữ | 13 | `TaiHoaDonGoc`, `InvoicesPage`, `RangeSyncPanel`, `TaxAccountsPage`, `ThongBaoTrangThai`, `ExportsPage`, `LienKetPage` |
| **KT** — thuật ngữ kế toán – thuế | 15 | + `ChonKhachHang`, `FilterBar`, `ReconcilePage`, `InvoiceDetailPage`, `SupportCenter`, `LoginPage`, `primitives`, `statusLabels`, `@vat/domain/registry` |
| **NQ** — không nhất quán | 7 nhóm khái niệm (≈ 40 chuỗi) | toàn bộ trên |
| **DD** — quá dài / sai vị trí | 6 | `TaiHoaDonGoc`, `InvoicesPage`, `RangeSyncPanel`, `TaxAccountsPage`, `LienKetPage` |
| **VP** — văn phạm / chính tả / dấu câu | 10 | + `AboutPage`, `SettingsPage`, `ThongTinSanPham` |

**Tổng: ≈ 78 chuỗi hiển thị trên 24 tệp nguồn.**

### Bảng thuật ngữ đã thống nhất

| Trước | Sau |
|---|---|
| kéo (dữ liệu / bản gốc / hóa đơn) | truy xuất |
| file | tệp |
| đường dẫn (URL chia sẻ) | liên kết |
| hóa đơn đã xuất | hóa đơn đã phát hành |
| khách hàng (bên mua trên chứng từ) | người mua |
| MST, HĐĐT (trong câu văn) | mã số thuế, hóa đơn điện tử |
| máy chủ thuế · GDT · Thuế | Tổng cục Thuế · hệ thống Tổng cục Thuế |
| Tổng TT | Tổng thanh toán |
| Chiết khấu TM · ĐVT | Chiết khấu thương mại · Đơn vị tính |
| Profile (phần mềm kế toán) | Định dạng (cho phần mềm kế toán) |
| "Thử lại." · "Thử lại sau ít phút." | "Vui lòng thử lại." · "Vui lòng thử lại sau ít phút." |

---

## 3. Token mới bổ sung: **KHÔNG CÓ**

Thang chữ 18 / 22 / 26 / 32 / 40 trong `docs/07-DESIGN_TOKENS.md` §4 đã đủ mọi cấp tiêu đề cần dùng. Toàn bộ vấn đề nằm ở **chỗ dùng**, không ở tầng token. `tokens.css` **không đổi một ký tự** — phép kiểm `tokens.css ≡ 07-DESIGN_TOKENS §7` vẫn xanh.

## 4. Primitive mới / đã sửa

| Primitive | Thay đổi | Lý do |
|---|---|---|
| `SectionLabel` | `--fs-sm` (15px) → `--fs-lg` (22px); bỏ `textTransform: uppercase` + `letterSpacing`; màu `--text-tertiary` → `--text-primary` | Đang là `<h2>` **nhỏ hơn chữ thân 18px**. Ảnh hưởng ngay: "Tra cứu hóa đơn", "Kết quả", "Tải hóa đơn gốc gửi người mua", "Đã phát hành" |
| `Alert` | `--fs-sm` → `--fs-base`, thêm `lineHeight: --lh-body` | Alert chứa **cảnh báo hậu quả pháp lý** và toàn bộ thông báo lỗi trên 9 màn. Đây là **lần thứ ba** lỗi "chữ bé" tái diễn (U20 → U37b → nay), lần này ở tầng primitive nên chưa lần rà nào bắt được |
| `SectionTitle` **(mới)** | `--fs-lg` + `--fw-bold`, `as="h2" \| "h3"` | Gom kiểu tiêu đề vốn bị gõ lại nội tuyến ở **12 chỗ** trong `features/`. `as` tách **cấp ngữ nghĩa HTML** khỏi **cỡ chữ** |
| `HuongDanTrang` + `MucHuongDan` **(mới)** | Khối hướng dẫn cuối trang, dùng `--surface-muted` / `--border` / `--radius-lg` / `--sp-*` có sẵn | Hiện thực quy ước "nhãn ngắn — mô tả đầy đủ ở cuối trang" |
| `ChuPhu` | Sửa chú thích `(16px)` → `(18px)` | Chú thích lệch thực tế sau khi tái neo thang QĐ-9b |

## 5. Trang đã thêm khối mô tả cuối trang

| Trang | Số chức năng được mô tả | Nhãn dài nhất |
|---|---|---|
| Danh sách hóa đơn | 5 (Lọc dữ liệu · Đồng bộ · Tùy chỉnh cột và Xuất · Tải hóa đơn gốc · Hóa đơn bị sửa ở kỳ khác) | 33 ký tự |
| Kết xuất & Convert | 3 | 34 ký tự |
| Kết nối tài khoản thuế | 5 | 25 ký tự |

Kèm theo: **gỡ `InfoTip` "Giải thích đồng bộ"** ở Danh sách hóa đơn — mô tả chức năng giấu sau hover thì người dùng thiết bị cảm ứng không bao giờ thấy. Nội dung chuyển nguyên vào khối hướng dẫn.

---

## 6. Bằng chứng nghiệm thu

### 6.1 Đo trên trình duyệt thật (dev server, chế độ `?xem-thu=1`, 2026-07-29)

```
body            18px
h1 "Danh sách hóa đơn"          32px / 800 / transform: none
h2 "Tra cứu hóa đơn"            22px / 700 / transform: none
h2 "Tải hóa đơn gốc gửi người mua"  22px / 700 / transform: none
h2 "Kết quả"                    22px / 700 / transform: none
h2 "Hướng dẫn sử dụng trang này"    22px / 700 / transform: none
```

Cấu trúc `h1 → h2`, **không nhảy cấp**, mọi tiêu đề đậm và lớn hơn thân. Khối hướng dẫn: nền `rgb(241,243,244)` (= `--surface-muted`), mô tả 18px màu `rgb(60,64,67)` (= `--text-secondary`), 5 nhãn dài **11–33 ký tự** (đều ≤ 40).

### 6.2 Cổng máy

| Lệnh | Kết quả |
|---|---|
| `make lint` (Biome + `tsc --noEmit`, 12 gói) | **sạch**, 0 lỗi |
| `make test` (toàn repo) | **12 gói · 2.082 test · 0 đỏ** (exit 0) |
| `apps/web` riêng | **57 tệp · 438 test · 0 đỏ** |

### 6.3 Phép kiểm convention MỚI (chống tái diễn)

Thêm vào `apps/web/test/conventions/ui-luat.test.ts` — chạy trong `make test` nên tự thành cổng bắt buộc:

1. **`Alert` dùng `--fs-base`**, không `--fs-sm`.
2. **`SectionLabel` / `SectionTitle` dùng `--fs-lg`**, không `--fs-sm`, không `uppercase`.
3. **Quét từ cấm trong `features/`**: `kéo (dữ liệu|bản gốc|hóa đơn|phần|về)`, `tải file`, `tạo file`, `file Excel`, `đã xuất cho`, `đăng nhập GDT`, `Tổng TT`, `HĐĐT` — bỏ chú thích trước khi quét (chú thích được phép nhắc từ cũ để giải thích lịch sử).

Vì sao cần máy kiểm chứ không chỉ ghi luật: QĐ-9 (U20) đã cấm dùng cỡ nhãn cho câu văn, nhưng chỉ sửa lẻ vài màn nên lỗi quay lại ở U37b, rồi lần rà này phát hiện nó **vẫn còn ở tầng primitive**. Không có phép kiểm thì đây là lần thứ ba, không phải lần cuối.

### 6.4 Test đã cập nhật theo copy mới

13 tệp test khoá chuỗi hiển thị cũ được cập nhật cùng lúc. Hai ca đáng chú ý:

- `invoiceRangeSync.test.tsx` ca 5: từ "tooltip ⓘ hiện mô tả" **đổi thành** "mô tả nằm ở khối hướng dẫn cuối trang, KHÔNG còn tooltip" — phản ánh đúng thiết kế mới, không phải nới lỏng phép kiểm.
- `exports.test.tsx`: `getByText("Định dạng tham chiếu")` nay mơ hồ (2 nơi cùng chữ) ⇒ đổi sang `getByRole("button", …)` nhắm đúng thẻ chọn bấm được.

---

## 7. Đã cập nhật `.claude/rules/ui.md`

Hai mục mới trong phần **Bắt buộc**:

1. **Phân cấp tiêu đề phải nhìn thấy được** — tiêu đề luôn lớn hơn thân và in đậm; cấm cỡ nhãn cho tiêu đề; cấm `uppercase`; cấp thẻ HTML là ngữ nghĩa, cỡ chữ là trình bày; cấm gõ lại kiểu tiêu đề nội tuyến trong `features/`.
2. **Nhãn ngắn trong nút/menu — mô tả đầy đủ ở khối cuối trang** — nhãn ≤ 40 ký tự, không dấu chấm; mô tả đặt trong `HuongDanTrang`; cấm chen mô tả dài vào thẻ hành động và cấm giấu mô tả trong `InfoTip`.

Thêm mục mới **Quy chuẩn văn phong** — bảng từ cấm, bảng một-khái-niệm-một-tên, quy tắc chính tả `hóa`, quy tắc trình bày chữ và cấu trúc thông báo lỗi.

---

## 8. Còn tồn đọng — cần người quyết định

| # | Việc | Vì sao chưa làm |
|---|---|---|
| 1 | **Gom chuỗi về từ điển tập trung.** `lib/i18n/vi.ts` mới có 20 khoá; ~78 chuỗi vẫn nằm rải trong component | Prompt §0.6 yêu cầu **báo cáo, không tự tái cấu trúc**. Đây là đơn vị công việc riêng, cần spec riêng — và là điều kiện cần nếu sau này làm đa ngữ |
| 2 | **`labelNguon` trùng nguồn với Registry.** `apps/web/src/lib/statusLabels.ts:48` và `packages/domain/src/registry.ts:187` cùng khai nhãn `nguon`, phải sửa hai chỗ | Sửa đúng tầng = cho `labelNguon` dẫn xuất từ Registry. Đó là refactor, vượt phạm vi "chỉ đổi chữ". Lần này giữ hai chỗ **đồng bộ thủ công** + test khoá cả hai |
| 3 | **`lib/changelog.ts`** còn "file", "kéo dữ liệu", "mất trắng" ở 13 mốc đã phát hành | QĐ-C: không viết lại lịch sử. Nếu chủ dự án đổi ý, sửa được trong một commit riêng |
| 4 | **Nhãn nhóm vẫn in hoa**: `CHÍNH` / `HỆ THỐNG` (Sidebar), `KỲ NHANH` (ChonKy) | Đây là **nhãn nhóm**, không phải tiêu đề hay câu văn, nên không thuộc diện cấm. Nêu ra để chủ dự án quyết nếu muốn bỏ luôn `uppercase` khỏi mọi bề mặt |
| 5 | **Ảnh chụp trước/sau** cho 3 trang tiêu biểu | Đã đo bằng số liệu computed style thật (§6.1) thay cho ảnh — chụp ảnh qua công cụ hiện tại không ổn định. Chủ dự án xem trực tiếp bằng `npm run dev -w apps/web` rồi mở `/invoices?xem-thu=1` |

---

## 9. Đối chiếu checklist nghiệm thu (prompt §6)

| Mục | Trạng thái |
|---|---|
| Không còn từ cấm trong chuỗi hiển thị | ✅ có **phép kiểm máy** (§6.3 mục 3) |
| Mỗi khái niệm chỉ còn một cách gọi | ✅ (bảng §2); ngoại lệ có chủ đích: `changelog.ts` theo QĐ-C |
| Không hardcode cỡ chữ / độ đậm / màu | ✅ toàn bộ qua token; `ui-luat.test.ts` chặn hex cứng trong `features/` |
| Không nhãn menu > 40 ký tự / chứa câu mô tả | ✅ dài nhất 34 ký tự |
| Mỗi trang có menu hành động đều có khối mô tả | ✅ theo QĐ-E phương án (a) — 3 trang; 5 trang còn lại không có mô tả dài nào để chuyển |
| Tiêu đề đậm, lớn hơn thân; `h1/h2/h3` không nhảy cấp | ✅ đo thật (§6.1) + phép kiểm máy |
| Không chạm logic nghiệp vụ / API / lược đồ | ✅ diff chỉ gồm chuỗi hiển thị, kiểu trình bày, và 2 primitive mới |
| `ui.md` cập nhật hai quy định mới | ✅ (§7) — thêm cả mục Quy chuẩn văn phong |
| Ứng dụng build và chạy bình thường | ✅ `make lint` sạch, 2.082 test xanh, dev server render đúng |

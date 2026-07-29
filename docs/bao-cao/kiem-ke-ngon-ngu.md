# Kiểm kê ngôn ngữ & phân cấp hiển thị — `apps/web`

> **Trạng thái: CHỜ DUYỆT.** Đây là Hạng mục 1 của prompt "Chuẩn hoá ngôn ngữ & phân cấp hiển thị trên frontend". Theo đúng quy trình §5.2, **chưa áp dụng bất kỳ thay đổi nào**. Bảng dưới là đề xuất, không phải việc đã làm.
>
> Ngày lập: 2026-07-29 · Phạm vi quét: `apps/web/src/**` (loại trừ `src/dev/` — công cụ xem thử nội bộ) · Phương pháp: trích chuỗi hiển thị bằng script (bỏ dòng chú thích), đối chiếu thủ công từng chuỗi với `.claude/rules/ui.md` và `docs/07-DESIGN_TOKENS.md`.

---

## 0. Đầu vào đã đọc

| Tài liệu | Điều rút ra chi phối báo cáo này |
|---|---|
| `.claude/rules/ui.md` | Nhãn phải lấy **một nguồn** (Registry / `@vat/domain/trangThaiHoaDon.ts`); chỉ dùng token + primitive; **QĐ-9b: câu văn để ĐỌC luôn `--fs-base`**, `--fs-sm`/`--fs-xs` chỉ cho nhãn; hợp đồng tương tác tách "đọc nhẹ" vs "kéo nặng" |
| `docs/07-DESIGN_TOKENS.md` §4 | Thang chữ đã neo thân **18px**; tiêu đề 22 / 26 / 32 / 40 (`--fs-lg` / `--fs-xl` / `--fs-2xl` / `--fs-3xl`); trọng lượng `--fw-semibold` 600 … `--fw-extrabold` 800 |
| `apps/web/src/styles/tokens.css` | Serialization của §7 — nguồn giá trị thật đang chạy |
| `apps/web/src/lib/i18n/vi.ts` | Từ điển tập trung **chỉ có 20 khoá** (nav + trạng thái chung). Phần còn lại nằm rải trong component |

### Token liên quan (bắt buộc tóm tắt trước khi sửa — prompt §5.1)

- **Typography:** `--fs-xs:14` · `--fs-sm:15` · `--fs-base:18` · `--fs-md:18` · `--fs-lg:22` · `--fs-xl:26` · `--fs-2xl:32` · `--fs-3xl:40`; `--fw-regular:400` … `--fw-extrabold:800`; `--lh-body:1.5` · `--lh-heading:1.25`.
- **Kết luận về Hạng mục 4:** **hệ token đã ĐỦ cấp độ tiêu đề** — không cần bổ sung token mới. Vấn đề nằm ở **chỗ dùng**, không ở tầng token (chi tiết §4 báo cáo này).
- **Spacing / surface:** `--sp-1..12`, `--surface-card/-muted/-page`, `--border`, `--radius-md/lg`. Đủ để dựng khối "mô tả cuối trang" của Hạng mục 3 mà không tạo style mới.

---

## 1. Bốn điểm phải có quyết định của chủ dự án TRƯỚC khi áp dụng

Bốn mục dưới đây là chỗ **prompt xung đột với quy ước đang tồn tại trong mã**. Không tự hoà giải (Hiến pháp §"Khi gặp mơ hồ").

### QĐ-A. Chính tả `hóa` vs `hoá` — **khuyến nghị: giữ `hóa`**

Prompt viết "hoá đơn" xuyên suốt. Mã hiện tại: **174 lần `hóa đơn`, 1 lần `hoá đơn`**. Áp theo prompt = sửa 174 chỗ, đổi cả tên biến/khoá không được phép đổi, và lệch với `@vat/domain`, file kết xuất, tài liệu. Khuyến nghị **giữ `hóa`** và sửa 1 chỗ lẻ về cho thống nhất (`ThongTinSanPham.tsx` — "mã hoá").

### QĐ-B. `khách hàng` → `người mua` — **khuyến nghị: áp, nhưng giới hạn phạm vi**

Prompt §2.2 yêu cầu "người mua" trong ngữ cảnh chứng từ. Từ "khách hàng" đang xuất hiện ở **9 bề mặt** (bảng §2 nhóm KT). Trong đó:

- **Nên đổi** (đúng là bên mua trên hoá đơn): `ChonKhachHang` (nhãn ô, placeholder, 3 trạng thái), `TaiHoaDonGoc` (tiêu đề thẻ + mô tả + lý do khoá nút), `LienKetPage` (subtitle), `primitives.tsx` (2 `aria-label`).
- **Cân nhắc giữ**: không có chỗ nào dùng "khách hàng" theo nghĩa "tổ chức dùng phần mềm" — nên việc đổi là **an toàn, không mơ hồ**.
- Hệ quả: đổi cả tên file/`ChonKhachHang` không? **Khuyến nghị KHÔNG** — prompt §0.4 cấm đổi tên hàm/biến; chỉ đổi chữ hiển thị.

### QĐ-C. `file` → `tệp`, và số phận `lib/changelog.ts`

`lib/changelog.ts` là **nhật ký phát hành đã công bố** — 13 mốc, ~55 dòng, chứa "file" 12 lần và vài chỗ khẩu ngữ ("mất trắng", "kéo dữ liệu"). Sửa nội dung mốc cũ = **viết lại lịch sử đã hiển thị cho người dùng**. Khuyến nghị: **chuẩn hoá từ mốc mới trở đi, giữ nguyên mốc đã phát hành**; hoặc chủ dự án cho phép sửa toàn bộ. Cần chốt.

### QĐ-D. `đường dẫn` vs `liên kết` — **khuyến nghị: chọn `liên kết`**

Cùng một khái niệm (URL chia sẻ gói hoá đơn) đang mang **hai tên**: `TaiHoaDonGoc` gọi "đường dẫn" (7 lần), còn `LienKetPage` / `HanhDongLienKet` / nav gọi "liên kết" (8 lần). Khuyến nghị chuẩn hoá về **"liên kết"** vì nav đã là "Liên kết chia sẻ" (đổi nav tốn hơn).

---

## 2. Bảng kiểm kê chuỗi hiển thị

Phân loại: **KN** khẩu ngữ · **KT** sai/thiếu chuẩn thuật ngữ · **NQ** không nhất quán · **DD** quá dài, sai vị trí · **VP** văn phạm/chính tả/viết hoa/dấu câu.

### 2.1 Nhóm KN — khẩu ngữ

| Tệp | Dòng | Chuỗi hiện tại | Vấn đề | Đề xuất thay thế |
|---|---|---|---|---|
| `features/invoices/TaiHoaDonGoc.tsx` | 124 | "Kéo bản gốc có chữ ký số từ Tổng cục Thuế cho những hóa đơn đã xuất cho khách hàng đang chọn, gói thành một tệp ZIP và tạo đường dẫn để gửi cho họ." | KN + KT + DD | "Truy xuất bản gốc có chữ ký số từ Tổng cục Thuế đối với các hóa đơn đã phát hành cho người mua đang chọn, đóng gói thành tệp nén .zip và tạo liên kết tải về để gửi cho người mua." *(chuyển xuống khối mô tả — xem §3)* |
| `features/invoices/InvoicesPage.tsx` | 131 | "Hóa đơn điện tử kéo trực tiếp từ Tổng cục Thuế" | KN | "Hóa đơn điện tử truy xuất trực tiếp từ Tổng cục Thuế" |
| `features/invoices/InvoicesPage.tsx` | 153 | "Kiểm tra và kéo phần còn thiếu từ máy chủ thuế cho kỳ đã chọn — chạy nền." | KN + NQ | "Kiểm tra và truy xuất phần còn thiếu từ hệ thống Tổng cục Thuế cho kỳ đã chọn; xử lý nền." |
| `features/invoices/RangeSyncPanel.tsx` | 106–108 | "…nhưng {n} tháng chưa kéo được dữ liệu — thường do máy chủ Tổng cục Thuế đang giới hạn tốc độ… Bấm liên tục không làm nhanh hơn." | KN + DD | "…nhưng {n} tháng chưa truy xuất được dữ liệu, thường do hệ thống Tổng cục Thuế đang giới hạn tốc độ. Hệ thống sẽ tự giãn nhịp và thực hiện lại; bạn có thể thử lại sau ít phút." |
| `features/taxAccounts/TaxAccountsPage.tsx` | 312 | "Bấm **Đồng bộ ngay** để kéo hóa đơn mua vào & bán ra mới nhất về." | KN | "Chọn **Đồng bộ ngay** để truy xuất hóa đơn mua vào và bán ra mới nhất." |
| `features/invoices/ThongBaoTrangThai.tsx` | 106 | "Hiện {a}/{b} hóa đơn - tải file Excel để xem đủ." | KN + VP | "Đang hiển thị {a}/{b} hóa đơn — tải tệp Excel để xem đầy đủ." |
| `features/exports/ExportsPage.tsx` | 173, 190, 194, 199 | "Tạo file kết xuất" · "Tạo & tải file" · "Đã tạo file và bắt đầu tải xuống." · "Không tạo được file kết xuất." | KN | "Tạo tệp kết xuất" · "Tạo và tải tệp" · "Đã tạo tệp và bắt đầu tải về." · "Không tạo được tệp kết xuất. Vui lòng thử lại." |
| `features/exports/ExportsPage.tsx` | 97 | "Dữ liệu thô, nhẹ" | KN | "Dữ liệu dạng bảng thuần, dung lượng nhỏ" |
| `features/lienket/LienKetPage.tsx` | 95 | "Không dựng được gói — hãy tạo lại từ Danh sách hóa đơn." | KN | "Không tạo được gói hóa đơn. Vui lòng tạo lại từ Danh sách hóa đơn." |
| `features/invoices/TaiHoaDonGoc.tsx` | 193 | "{n} hóa đơn không lấy được — xem bao-cao.txt trong tệp" | KN | "{n} hóa đơn không truy xuất được. Xem tệp bao-cao.txt trong gói tải về." |
| `lib/changelog.ts` | 68 | "…hết cảnh đồng bộ nửa chừng rồi mất trắng." | KN | "…không còn tình trạng đồng bộ dở dang và mất toàn bộ tiến độ." *(phụ thuộc QĐ-C)* |
| `lib/changelog.ts` | 20–157 | "kéo dữ liệu", "file Excel/CSV" (12 chỗ), "bấm", "liếc là thấy" | KN | Chuẩn hoá theo bảng §2.1 prompt *(phụ thuộc QĐ-C)* |
| `main.tsx` | 34 | "[XEM THỬ] Đang dùng DỮ LIỆU BỊA, không phải số liệu thật." | KN + VP | "[XEM THỬ] Đang dùng dữ liệu mô phỏng, không phải số liệu thật." *(chế độ dev; ưu tiên thấp)* |

### 2.2 Nhóm KT — thuật ngữ kế toán – thuế

| Tệp | Dòng | Chuỗi hiện tại | Vấn đề | Đề xuất thay thế |
|---|---|---|---|---|
| `features/invoices/TaiHoaDonGoc.tsx` | 121 | "Tải hóa đơn gốc gửi khách hàng" | KT | "Tải hóa đơn gốc gửi người mua" |
| `features/invoices/TaiHoaDonGoc.tsx` | 42 | "Chọn một khách hàng để tải hóa đơn đã xuất cho họ" | KT ×2 | "Chọn một người mua để tải hóa đơn đã phát hành cho họ" |
| `features/invoices/ChonKhachHang.tsx` | 52, 54, 56, 61, 64 | "Đang tải danh sách khách hàng…" · "Không tải được danh sách khách hàng." · "Chưa có khách hàng nào có mã số thuế." · nhãn "Khách hàng" · placeholder "Tìm khách hàng theo tên hoặc MST" | KT (+ MST viết tắt) | "…danh sách người mua…" ×3 · nhãn "Người mua" · "Tìm người mua theo tên hoặc mã số thuế" |
| `components/ui/primitives.tsx` | 773, 834 | `aria-label="Xóa khách hàng đã chọn"` · "Không tìm thấy khách hàng nào khớp." | KT | "Xóa người mua đã chọn" · "Không tìm thấy người mua nào phù hợp." |
| `features/lienket/LienKetPage.tsx` | 123 | "Các đường dẫn tải hóa đơn đã phát cho khách hàng" | KT + NQ | "Các liên kết tải hóa đơn đã phát hành cho người mua" |
| `features/invoices/FilterBar.tsx` | 130, 133 | nhãn + placeholder "MST người bán" | KT | "Mã số thuế người bán" |
| `features/reconcile/ReconcilePage.tsx` | 160 | "· ký hiệu {k} · MST bán {m}" | KT | "· ký hiệu {k} · mã số thuế người bán {m}" |
| `features/taxAccounts/TaxAccountsPage.tsx` | 84, 152, 209(≈), 309, 357 | "cập nhật MST ở…" · "tài khoản thuế MST {…}" · "…cho MST này." · "(giữ MST)" | KT | Viết đủ "mã số thuế" ở mọi câu văn; giữ viết tắt chỉ trong nhãn cột/chip nếu cần |
| `features/taxAccounts/TaxAccountsPage.tsx` | 202, 259 | "Nhập captcha để đăng nhập GDT" · nút "Đăng nhập GDT" | KT (viết tắt nội bộ lọt ra giao diện) | "Nhập captcha để đăng nhập Tổng cục Thuế" · "Đăng nhập Tổng cục Thuế" |
| `features/about/SupportCenter.tsx` | 136 | "Mã số thuế (MST) đang thao tác." | KT | "Mã số thuế đang thao tác." |
| `lib/statusLabels.ts` | 48 | "HĐĐT thường" | KT | "Hóa đơn điện tử thường" *(⚠ nhãn này còn chảy vào **file kết xuất** — xem §5 Rủi ro)* |
| `features/auth/LoginPage.tsx` | 21, 25 | "Hệ thống HĐĐT của Tổng cục Thuế" · "cả HĐĐT thường lẫn hóa đơn máy tính tiền" | KT | "Hệ thống Hóa đơn điện tử của Tổng cục Thuế" · "cả hóa đơn điện tử thường lẫn hóa đơn máy tính tiền" |
| `features/invoices/InvoiceDetailPage.tsx` | 112 | nhãn "Chiết khấu TM" | KT | "Chiết khấu thương mại" |
| `features/invoices/InvoiceDetailPage.tsx` | 58 | tiêu đề cột "ĐVT" | KT | "Đơn vị tính" |
| `features/reconcile/ReconcilePage.tsx` | 120 | "Tổng TT {…}" | KT + NQ | "Tổng thanh toán {…}" — ⚠ chính là lệch nhãn `ui.md` đã cảnh báo đích danh |

### 2.3 Nhóm NQ — không nhất quán

| Khái niệm | Các cách gọi đang tồn tại | Vị trí | Đề xuất chuẩn |
|---|---|---|---|
| Cơ quan / hệ thống thuế | "Tổng cục Thuế" · "máy chủ thuế" · "máy chủ Tổng cục Thuế" · "hệ thống thuế" · "GDT" · "Thuế" (nút "Đồng bộ từ Thuế") | `InvoicesPage:131,149,153` · `RangeSyncPanel:25,107` · `TaxAccountsPage:202,259,309,357` · `faq.ts` | **"Tổng cục Thuế"** cho cơ quan; **"hệ thống Tổng cục Thuế"** khi nói về máy chủ. Nút rút gọn giữ "Đồng bộ từ Tổng cục Thuế" (24 ký tự — vẫn ≤ 40) |
| Tệp | "tệp" (`TaiHoaDonGoc:125`) vs "file" (`ExportsPage` ×5, `ThongBaoTrangThai:106`, `changelog` ×12) | nhiều | **"tệp"** |
| Liên kết chia sẻ | "đường dẫn" ×7 vs "liên kết" ×8 | `TaiHoaDonGoc` vs `LienKetPage`/`HanhDongLienKet`/nav | **"liên kết"** (QĐ-D) |
| Tổng thanh toán | "Tổng thanh toán" vs "Tổng TT" | `ThongBaoTrangThai:126,136` vs `ReconcilePage:120` | **"Tổng thanh toán"** |
| Hành động xuất dữ liệu | "Kết xuất" (nav, `ExportsPage`) · "Xuất {định dạng}" (`InvoiceExportButtons:34`) · "Tạo & tải file" | | Động từ nút: **"Xuất …"**; danh từ mục/màn: **"Kết xuất"** |
| Đồng bộ | "Đồng bộ từ Thuế" · "Đồng bộ ngay" · "Đồng bộ khoảng này" (changelog) | | Giữ **"Đồng bộ từ Tổng cục Thuế"** làm nhãn chuẩn; "Đồng bộ ngay" chỉ ở màn Kết nối tài khoản |
| Câu kết lỗi | "Thử lại." · "Thử lại sau ít phút." · "Vui lòng thử lại." | `TaiHoaDonGoc:56` · `TaxAccountsPage:108` · `ExportsPage:199` | **"Vui lòng thử lại."** / **"Vui lòng thử lại sau ít phút."** |

### 2.4 Nhóm DD — quá dài / sai vị trí

| Tệp | Dòng | Chuỗi | Vấn đề |
|---|---|---|---|
| `features/invoices/TaiHoaDonGoc.tsx` | 124 | mô tả 2 dòng ngay trong thẻ hành động | Ví dụ mẫu của prompt §3 — tách nhãn ngắn / mô tả cuối trang |
| `features/invoices/InvoicesPage.tsx` | 197 | "Đang đồng bộ khoảng đã lọc từ Tổng cục Thuế — số liệu sẽ cập nhật khi lấy xong (xem tiến độ ở khung Đồng bộ phía trên)." | 118 ký tự trong `EmptyState`; rút còn 1 câu |
| `features/invoices/RangeSyncPanel.tsx` | 72–75 | Đoạn 4 dòng về tác vụ nền | Rút xuống 2 câu |
| `features/taxAccounts/TaxAccountsPage.tsx` | 276 | "Hệ thống đang quá tải do yêu cầu đồng thời từ nhiều doanh nghiệp, vui lòng thử lại sau 10 phút." | Đổ lỗi hệ thống + dài; rút gọn theo §2.3 prompt |
| `features/lienket/LienKetPage.tsx` | 134 | "Chưa phát hành liên kết nào. Vào Danh sách hóa đơn, chọn một khách hàng và kỳ, rồi bấm 'Tải hóa đơn gốc'." | Dài + nháy đơn lẫn trong câu |
| `features/invoices/InvoicesPage.tsx` | 153 | Mô tả đầy đủ nằm trong **tooltip `InfoTip`** | Prompt §3: mô tả đầy đủ thuộc khối cuối trang, không giấu sau hover |

### 2.5 Nhóm VP — văn phạm, chính tả, viết hoa, dấu câu

| Tệp | Dòng | Chuỗi hiện tại | Vấn đề | Đề xuất |
|---|---|---|---|---|
| `features/about/AboutPage.tsx` | 66 | "Cảm ơn bạn đã đồng hành cùng VATEngine. 🙏" | Biểu tượng cảm xúc (prompt §2.3 cấm) | "Cảm ơn bạn đã đồng hành cùng VATEngine." |
| `features/auth/LoginPage.tsx` | 32 | "VATengine được xây dựng theo…" | Sai viết hoa tên sản phẩm (mọi nơi khác là "VATEngine") | "VATEngine" |
| `features/settings/ThongTinSanPham.tsx` | 62–63 | "mã hoá khi lưu trữ" | Lệch chính tả với 174 chỗ "hóa" | "mã hóa" (theo QĐ-A) |
| `features/invoices/TaiHoaDonGoc.tsx` | 156 | "Đường dẫn tạo ra là CÔNG KHAI: ai có đường dẫn đều tải được tệp…" | Viết hoa toàn bộ trong câu văn | "Liên kết tạo ra là **công khai**: bất kỳ ai có liên kết đều tải được tệp, không cần đăng nhập." (nhấn bằng `<strong>`, không bằng chữ hoa) |
| `features/invoices/ThongBaoTrangThai.tsx` | 106, 124, 134, 144, 222, 232 | Dùng "-" (gạch nối) thay cho "—" (gạch ngang) giữa hai vế câu | Dấu câu | Thay bằng "—" hoặc tách câu |
| `features/invoices/InvoicesPage.tsx` | 226 | "({n} hóa đơn bị thay thế - không tính vào tổng)" | Dấu câu | "({n} hóa đơn bị thay thế — không tính vào tổng)" |
| `features/reconcile/ReconcilePage.tsx` | 177, 194 | `EmptyState message="Không có"` | Câu cụt, không dấu chấm | "Không có hóa đơn hủy trong kỳ đã lọc." / "Không có hóa đơn bị thay thế trong kỳ đã lọc." |
| `features/exports/ExportsPage.tsx` | 109, 131, 185 | "Profile phần mềm kế toán" · "Định dạng tham chiếu (reference)" · hiển thị giá trị thô "reference" | Tiếng Anh lọt ra giao diện | "Định dạng cho phần mềm kế toán" · "Định dạng tham chiếu" · "định dạng tham chiếu" |
| `features/settings/SettingsPage.tsx` | 57 | "Lưu không thành công. Vui lòng thử lại." | Thiếu chủ thể việc gì thất bại (prompt §2.3) | "Không lưu được thông tin doanh nghiệp. Vui lòng thử lại." |
| `components/ui/primitives.tsx` | 226–231 | `SectionLabel` đặt `textTransform: "uppercase"` | Viết hoa toàn bộ bằng CSS (prompt §2.3) | Bỏ `textTransform` — xem §4 |

**Tổng hợp số lượng đề xuất sửa:** KN 13 · KT 15 · NQ 7 nhóm khái niệm (≈ 40 chuỗi) · DD 6 · VP 10. Cộng dồn (có trùng lặp giữa nhóm): **≈ 78 chuỗi hiển thị trên 24 tệp**.

---

## 3. Hạng mục 3 — tách mô tả dài ra khỏi menu: **kết quả quét khác giả định của prompt**

Prompt giả định "menu hành động đang chứa cả câu mô tả dài". Quét thực tế:

| Menu / dropdown thực có | Nhãn dài nhất | Có mô tả dài không? |
|---|---|---|
| `Sidebar` (điều hướng chính) | "Kết nối tài khoản thuế" (23 ký tự) | Không |
| `ProfileMenu` | "Sửa hồ sơ" | Không |
| `ColumnMenu` (menu cột bảng) | "↓ Sắp xếp giảm dần" | Không |
| `ChonCotXuat` | "Về mặc định ({n} cột)" | Không |

**Không có nhãn menu nào vượt 40 ký tự, và không menu nào chứa câu mô tả.** Vấn đề prompt mô tả có thật, nhưng nằm ở **thẻ hành động (Card) và tooltip**, không ở menu:

1. `TaiHoaDonGoc.tsx:124` — mô tả 2 dòng nằm ngay dưới tiêu đề thẻ (đúng ví dụ mẫu của prompt).
2. `InvoicesPage.tsx:153` — mô tả chức năng Đồng bộ **giấu trong tooltip `InfoTip`**, chỉ hiện khi di chuột.
3. `ExportsPage.tsx:117–133` — mô tả từng định dạng nằm trong thẻ lựa chọn.

**Câu hỏi phạm vi cần chốt (QĐ-E):** prompt §3.5 yêu cầu thêm khối "Hướng dẫn sử dụng trang này" cho **mọi trang có menu hành động**. Theo quét trên, làm đúng chữ nghĩa sẽ phải **thêm khối mới vào 8 trang** — đây là **thêm bề mặt giao diện**, không còn là "chỉ đổi chữ và vị trí" như §0.4 đặt ra. Ba phương án:

- **(a) Hẹp — khuyến nghị:** chỉ áp cho 3 trang thực sự có mô tả dài đang chen chỗ (Danh sách hóa đơn, Kết xuất, Kết nối tài khoản thuế). Rủi ro thấp, giải đúng vấn đề đã quan sát được.
- **(b) Đủ theo prompt:** thêm khối cho cả 8 trang, kể cả trang không có mô tả nào để chuyển xuống (phải **viết mới** nội dung — vượt phạm vi "chuẩn hoá chuỗi đang có").
- **(c) Hoãn:** chỉ rút gọn nhãn/mô tả tại chỗ ở Hạng mục 2, đưa khối mô tả cuối trang thành một đơn vị công việc riêng có spec.

---

## 4. Hạng mục 4 — phân cấp tiêu đề

### 4.1 Phát hiện nghiêm trọng nhất: `SectionLabel` là `<h2>` nhưng **nhỏ hơn chữ thân**

`components/ui/primitives.tsx:224–239` render `<h2>` với `fontSize: --fs-sm` (**15px**), `textTransform: uppercase`, màu `--text-tertiary`. Chữ thân là **18px**.

⇒ Tiêu đề mục **nhỏ hơn nội dung 3px**, đúng cái mà prompt §4.2 cấm ("không để tiêu đề và chữ thân cùng cỡ" — đây còn tệ hơn: nhỏ hơn), và `uppercase` vi phạm §2.3.

Ảnh hưởng: "Tra cứu hóa đơn", "Kết quả" (`InvoicesPage`), "Tải hóa đơn gốc gửi khách hàng" (`TaiHoaDonGoc`), "Đã phát hành" (`LienKetPage`) — tức **các tiêu đề chính của màn dùng nhiều nhất**.

**Đề xuất:** `SectionLabel` → `--fs-lg` (22px) + `--fw-bold` + `--text-primary`, bỏ `textTransform` và `letterSpacing`. Sửa **một primitive**, mọi màn tự hưởng — đúng "câu hỏi vàng" của `ui.md`.

### 4.2 `Alert` render mọi nội dung ở `--fs-sm` — **vi phạm QĐ-9b ở tầng primitive**

`primitives.tsx:460` đặt `fontSize: "var(--fs-sm)"` cho toàn bộ `Alert`. Nhưng `Alert` chính là nơi đặt **những câu văn quan trọng nhất của phần mềm**:

- Cảnh báo hậu quả pháp lý: "…{n} hóa đơn của kỳ này đã bị thay thế hoặc điều chỉnh bởi hóa đơn ở kỳ khác…" (`ThongBaoTrangThai:222`)
- Cảnh báo liên kết công khai (`TaiHoaDonGoc:156`)
- Toàn bộ thông báo lỗi trên 9 màn

`ui.md:21` ghi thẳng rằng đây là gốc của phàn nàn "chữ bé khó đọc" **đã tái diễn hai lần (U20, U37b)**. Đây là **lần thứ ba của cùng một lỗi**, ở tầng primitive nên chưa ai bắt được.

**Đề xuất:** `Alert` → `--fs-base`. Một dòng sửa, 9 màn tự hưởng.

### 4.3 Các chỗ khác dùng cỡ nhãn cho câu văn hoàn chỉnh (QĐ-9b)

| Tệp | Dòng | Nội dung là câu văn | Cỡ đang dùng |
|---|---|---|---|
| `components/layout/Footer.tsx` | 18 | Thông tin pháp nhân, địa chỉ, bản quyền | `--fs-sm` |
| `features/about/Changelog.tsx` | 46 | Toàn bộ nội dung mốc cập nhật (văn bản để đọc) | `--fs-sm` |
| `features/invoices/BiSuaKyKhacBadge.tsx` | 181 | "Những hóa đơn này đã bị thay thế hoặc điều chỉnh, nhưng không thuộc kỳ bạn đang xem…" | `--fs-sm` |
| `features/invoices/RangeSyncPanel.tsx` | 88 | "Đồng thời đang đổ dòng hàng cho {n} hóa đơn cũ…" | `--fs-xs` |
| `features/taxAccounts/TaxAccountsPage.tsx` | 207, 254, 346 | "Hệ thống không tự giải captcha…" · "Không phân biệt hoa/thường…" · "Ngắt kết nối sẽ xóa phiên đăng nhập…" | `--fs-sm` / `--fs-xs` |
| `features/exports/ExportsPage.tsx` | 139, 158 | Mô tả định dạng | `--fs-xs` / `--fs-sm` |
| `features/settings/DoiMatKhauCard.tsx` | 102, 116 | Câu lỗi mật khẩu | `--fs-sm` |
| `features/auth/DangKyPage.tsx` | 233 | Câu lỗi mã số thuế | `--fs-sm` |
| `components/Turnstile.tsx` | 120 | Câu lỗi bảo mật | `--fs-sm` |

*(Các chỗ dùng `--fs-sm`/`--fs-xs` cho **nhãn thật** — `TextField` label, chip, meta bảng, `Pagination` — là **đúng luật**, không nằm trong danh sách này.)*

### 4.4 Cấu trúc ngữ nghĩa `h1/h2/h3`

- ✅ Không phát hiện nhảy cấp: mọi trang trong `AppLayout` có đúng một `<h1>` (`PageHeader`), các mục là `<h2>`, `SupportCenter` dùng `<h3>` dưới `<h2>` của `AboutPage`.
- ⚠ `TaxAccountsPage:125` `<h3>` "Thêm tài khoản con" nằm trong một `Card` ngang hàng với các `<h2>` khác, không phải con của mục nào — nên là `<h2>`.
- ⚠ **Nhân bản kiểu tiêu đề:** `fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)"` được gõ lại **inline ở 12 chỗ** (`ExportsPage` ×3, `TaxAccountsPage` ×4, `ReconcilePage` ×4, `SettingsPage`, `DoiMatKhauCard`, `AboutPage`). Không sai token, nhưng vi phạm `ui.md` "chỉ dùng token + primitive; đừng tô kiểu nội tuyến trong `features/`".
  **Đề xuất:** thêm primitive `SectionTitle` vào `primitives.tsx` (dùng lại tên đang có sẵn trong `AboutPage.tsx:12`, nâng lên thư viện chung) và thay 12 chỗ.
- ⚠ 6 `<h1>` inline ở các trang xác thực (`LoginPage`, `DangKyPage` ×3, `DatMatKhauPage` ×3, `XacThucEmailPage`) — các trang này nằm ngoài `AppLayout` nên không dùng `PageHeader`; vẫn nên gom về một primitive `AuthTitle` hoặc tái dùng `PageHeader`.

### 4.5 Kết luận Hạng mục 4

**Không cần bổ sung token mới.** Thang 22/26/32/40 đã đủ. Toàn bộ vấn đề là **dùng sai cấp** và **chép kiểu inline**. Sửa gọn trong 3 primitive (`SectionLabel`, `Alert`, `SectionTitle` mới) + 12 điểm thay thế.

---

## 5. Rủi ro cần biết trước khi áp dụng

1. **`lib/statusLabels.ts` không chỉ phục vụ web.** `ui.md:19` quy định nhãn trạng thái là **một nguồn cho CẢ web lẫn file kết xuất**. Đổi "HĐĐT thường" → "Hóa đơn điện tử thường" sẽ **đổi nội dung cột trong tệp Excel/CSV người dùng tải về** và có thể phá test đối chiếu file xuất. Cần chạy `make test` và kiểm tra `packages/export` trước khi chốt.
2. **Nhãn trường hóa đơn nằm ở Registry `@vat/domain`, không ở `apps/web`.** Các nhãn như "Tổng thanh toán" hiển thị qua `labelOf()`. Sửa ở màn thay vì ở Registry sẽ tạo nguồn thứ hai — cấm theo `ui.md`. Sửa "Tổng TT" phải sửa **tại `ReconcilePage`** (nó đang gõ tay, đó chính là lỗi), không phải tại Registry.
3. **Chuỗi đang rải rác, không tập trung.** `lib/i18n/vi.ts` chỉ chứa 20 khoá. Theo prompt §0.6, **báo cáo — không tự tái cấu trúc**: việc gom ~78 chuỗi về từ điển tập trung là một đơn vị công việc riêng, cần spec riêng.
4. **Vị trí báo cáo.** Prompt yêu cầu `bao-cao/kiem-ke-ngon-ngu.md`. Đã đặt tại **`docs/bao-cao/`** để không tạo thư mục gốc mới trái quy ước repo (`docs/` là nơi mọi tài liệu). Nếu chủ dự án muốn đúng đường dẫn gốc, di chuyển được ngay.

---

## 6. Kế hoạch áp dụng (chỉ chạy sau khi bảng này được duyệt)

| Commit | Nội dung | Rủi ro |
|---|---|---|
| 1 | Hạng mục 2 — chuẩn hoá chuỗi KN + KT + NQ + VP (không đụng `changelog.ts` nếu QĐ-C chọn giữ lịch sử) | Thấp; kiểm bằng test snapshot nếu có |
| 2 | Hạng mục 4 — `SectionLabel`, `Alert` → cỡ đúng; thêm primitive `SectionTitle`; thay 12 điểm inline; `<h3>`→`<h2>` ở `TaxAccountsPage` | **Trung bình** — đổi diện mạo mọi màn; cần ảnh chụp trước/sau |
| 3 | Hạng mục 3 theo phương án được chọn ở QĐ-E | Tuỳ phương án |
| 4 | Cập nhật `.claude/rules/ui.md` §4.5 (hai quy định mới) + `docs/bao-cao/ket-qua-chuan-hoa.md` | Thấp |

---

## 7. Cần chủ dự án trả lời để đi tiếp

| Mã | Câu hỏi | Khuyến nghị |
|---|---|---|
| QĐ-A | `hóa` hay `hoá`? | Giữ **`hóa`** (174 vs 1) |
| QĐ-B | Đổi "khách hàng" → "người mua" trên 9 bề mặt? | **Có**, chỉ đổi chữ hiển thị, không đổi tên file/biến |
| QĐ-C | Có sửa nội dung các mốc `changelog.ts` đã phát hành? | **Không** — chuẩn hoá từ mốc mới |
| QĐ-D | "đường dẫn" hay "liên kết"? | **"liên kết"** |
| QĐ-E | Khối mô tả cuối trang: 3 trang (a), 8 trang (b), hay hoãn (c)? | **(a)** |
| QĐ-F | Đồng ý đổi `Alert` và `SectionLabel` sang cỡ đúng, chấp nhận diện mạo mọi màn thay đổi? | **Có** — đây là lần thứ ba tái diễn lỗi "chữ bé", sửa ở primitive mới dứt điểm |

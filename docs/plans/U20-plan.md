# Kế hoạch U20 — Frontend: Đăng ký khách + Settings pháp lý/thương hiệu + font 16px

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** Đơn vị **thứ tư (cuối)** của lớp thương mại. Thuần frontend trong `apps/web`, tiêu thụ **`POST /dang-ky` (U17)**. Hoàn thiện trải nghiệm app KHÁCH: cửa vào tự đăng ký, thông tin pháp lý/thương hiệu đầy đủ, và tinh chỉnh giao diện theo yêu cầu chủ dự án.
>
> Luật áp dụng: `security.md` (không bí mật client), `testing.md`. **KHÔNG** đụng `gdt-adapter.md`/`multi-tenant.md` (thuần client).

## 1. Vấn đề & phạm vi

Sau U17–U19, backend + Cổng Admin đã sẵn sàng; app khách còn thiếu **cửa đăng ký** và **danh tính thương mại/pháp lý**. U20 lấp nốt.

**Trong phạm vi:**
1. Trang **Đăng ký** công khai (trước login) → `POST /dang-ky` → màn "chờ duyệt".
2. Màn **login khách** hiển thị thông báo thân thiện khi tài khoản chưa duyệt/bị khóa + link sang Đăng ký.
3. Viết lại **Trang Cài đặt chung** đầy đủ: thương hiệu VATEngine v1.0, mục tiêu, chính sách sử dụng & bảo mật, **cam kết ủy quyền MST**, thông tin tác giả, **quyền lợi gói Free**.
4. **Nâng body font lên 16–17px** (yêu cầu H).

**Ngoài phạm vi:** trang marketing công khai đầy đủ, đa ngôn ngữ, đăng ký gói trả phí, tự đặt lại mật khẩu (luồng onboard chốt ở U18 §6).

## 2. Tiền đề đã kiểm chứng (đọc từ mã)

- Router: chỉ `/login` công khai; còn lại trong `ProtectedLayout` (`apps/web/src/routes/AppRouter.tsx`). ⇒ Trang Đăng ký phải là **route công khai mới** (ngang `/login`, ngoài `ProtectedLayout`).
- Font: `tokens.css` đã có `--fs-base: 16px` và `global.css:18 font-size: var(--fs-base)`. **Cần kiểm body thực nhận đúng 16px** (có thể bị override ở nơi khác) — nếu chủ muốn **17px**, đổi `--fs-base` (một chỗ, lan toàn app). *(Đã có 16px sẵn — yêu cầu chủ có thể chỉ cần xác nhận 16 hay nâng 17.)*
- `SettingsPage.tsx` hiện là khuôn tĩnh (`PageHeader`+`Card`+`Row`) — viết lại nội dung, không đổi hạ tầng.
- Primitives `Button/Card/Alert/TextField` + tokens sẵn có (dùng, **cấm hardcode hex**).

## 3. Trang Đăng ký (`features/auth/DangKyPage.tsx`, route công khai `/dang-ky`)

- Form: **Email · Tên doanh nghiệp · MST** (+ checkbox **"Tôi cam kết được ủy quyền sử dụng tài khoản mã số thuế này"** — bắt buộc tick mới gửi, khớp cam kết pháp lý §5).
- Validate client (UX, không thay server): email dạng đúng, MST 10/13 số, tên không rỗng, checkbox bắt buộc. Validate thật ở U17 backend.
- Submit → `POST /dang-ky`:
  - `201` → màn thành công: **"Đăng ký đã được ghi nhận và đang chờ duyệt. Chúng tôi sẽ kích hoạt tài khoản sau khi xác minh."** + hướng dẫn liên hệ hỗ trợ (Email).
  - `400 email_khong_hop_le` → "Email không hợp lệ hoặc không được chấp nhận. Vui lòng dùng email doanh nghiệp, Gmail hoặc Yahoo."
  - `400 mst_khong_hop_le` → thông báo MST.
  - `409 da_ton_tai` → "Email hoặc MST này đã đăng ký."
  - `429` → "Quá nhiều yêu cầu, vui lòng thử lại sau."
- Link "Đã có tài khoản? Đăng nhập" → `/login`. Trên `/login`, thêm link "Chưa có tài khoản? Đăng ký" → `/dang-ky`.

## 4. Màn login khách — thông báo trạng thái

`/auth/login` trả 401 gọn cho cả sai-mật-khẩu lẫn chưa-duyệt (U17 §7 — không rò lý do qua response). ⇒ UI **không** đoán "chưa duyệt" từ response login (tránh sai). Thay vào đó:
- Sau đăng ký thành công, màn "chờ duyệt" đã thông báo rõ.
- Trên `/login`, hiển thị dòng gợi ý tĩnh: *"Nếu bạn vừa đăng ký, tài khoản cần được duyệt trước khi đăng nhập. Xem trạng thái hoặc liên hệ hỗ trợ qua Email."* — tách kênh thông báo khỏi response login (đúng kỷ luật bảo mật).

## 5. Trang Cài đặt chung — nội dung đầy đủ (chủ dự án cấp, Claude biên tập)

Viết lại `SettingsPage.tsx` thành các `Card`:

**Card 1 — Về phần mềm**
> **VATEngine — phiên bản v1.0**
> VATEngine giúp doanh nghiệp **trích xuất đầy đủ hóa đơn điện tử đầu vào (mua vào)** và đầu ra **trực tiếp từ tài khoản chính thức của doanh nghiệp trên Hệ thống Hóa đơn điện tử của Tổng cục Thuế**.
> **Mục tiêu cao nhất:** giúp doanh nghiệp tự chủ dữ liệu hóa đơn của mình, phục vụ đối chiếu – kê khai – tích hợp kế toán.
> **Phần mềm phục vụ miễn phí cho doanh nghiệp Việt Nam.**

**Card 2 — Chính sách sử dụng & Điều khoản bảo mật**
> Người dùng cần tuân thủ **Chính sách sử dụng** và **Điều khoản bảo mật** khi dùng VATEngine.
> Khi cung cấp **tài khoản để kết nối mã số thuế**, người dùng **cam kết mình được ủy quyền hợp pháp** sử dụng tài khoản đó.
> **Chúng tôi không lưu mật khẩu tài khoản thuế của người dùng.** Phiên kết nối (token) được **mã hóa** và chỉ dùng để đồng bộ hóa đơn theo yêu cầu của người dùng. Chúng tôi **không chịu trách nhiệm pháp lý** đối với các vấn đề khác có liên quan phát sinh ngoài phạm vi phần mềm.

> ⚠️ **Điểm cần chủ dự án duyệt câu chữ (Nguyên tắc bằng chứng):** bản gốc chủ dự án viết *"không lưu thông tin kết nối đã cung cấp"*. Thực tế kỹ thuật (U14): hệ thống **lưu token GDT ĐÃ MÃ HÓA** để đồng bộ nền, và **không lưu mật khẩu thuế thô**. Câu ở trên đã điều chỉnh để **khớp hành vi thật** (không tuyên bố sai). **Cần chủ xác nhận** dùng câu điều chỉnh này, hoặc đổi kiến trúc (không lưu token → không đồng bộ nền được). Không phát hành câu sai lệch với thực tế.

**Card 3 — Tác giả phần mềm**
> **Công ty TNHH Tour Đảo** · MST: **4201969169**
> Địa chỉ: 19 đường B2, khu đô thị Vĩnh Điềm Trung, Phường Tây Nha Trang, Tỉnh Khánh Hòa.

**Card 4 — Thông tin tài khoản (quyền lợi)**
> - **Gói dịch vụ:** Free
> - **Số mã số thuế được kết nối:** 01
> - **Hỗ trợ:** Email · Cộng đồng

*(Gói/hạn mức lấy từ `goi_dich_vu` của tenant nếu API expose; v1.0 hiển thị tĩnh "Free / 01 MST" — nhất quán mọi tenant v1.0.)*

## 6. Font 16–17px — GỐC VẤN ĐỀ: chữ nhỏ do lạm dụng `--fs-sm` (13px)

**Chẩn đoán (kiểm bằng Inspect + grep mã 2026-07-15):** `--fs-base` đã là **16px** và `body` nhận đúng, NHƯNG **rất nhiều nội dung dùng thẳng `--fs-sm: 13px`** cho chữ thường (không chỉ nhãn phụ). Chủ dự án Inspect thấy `font-size: var(--fs-sm)` với `opacity: 0.9` → chữ 13px mờ = **quá nhỏ khó đọc**. Vấn đề KHÔNG nằm ở `--fs-base` mà ở việc `--fs-sm` bị dùng cho văn bản đáng ra phải là cỡ đọc chuẩn.

Các file dùng `--fs-sm` cho nội dung: `SettingsPage`, `ReconcilePage`, `InvoicesPage`, `InvoiceDetailPage`, `InvoiceTable`, `FilterBar`, `chips`, `LoginPage`, `DonationQr`, `ExportsPage`, `DashboardPage`, `TaxAccountsPage`, `Pagination`, `primitives` (Button size nhỏ).

**Cách sửa (hai tầng, làm cả hai):**
1. **Nâng thang cỡ chữ ở token** (một chỗ, lan toàn app): `--fs-sm: 13px → 15px`; giữ `--fs-base: 16px` (hoặc nâng **17px** nếu chủ muốn thân thiện hơn — chủ đã Inspect thấy nhỏ nên **đề xuất `--fs-base: 17px` + `--fs-sm: 15px`**). Cỡ nhãn phụ thật sự nhỏ chuyển sang `--fs-xs: 12px` (giữ nguyên) chỉ cho caption/badge.
2. **Rà từng chỗ dùng `--fs-sm` cho VĂN BẢN đọc** (đoạn mô tả, dòng dữ liệu) → đổi sang `--fs-base`; chỉ giữ `--fs-sm` cho nhãn phụ/caption đúng nghĩa. Ưu tiên các trang đọc nhiều: Settings, Invoices (dòng bảng), Reconcile, Login.

**Test:** assert `--fs-base` = giá trị chốt (16 hoặc 17); assert `--fs-sm` ≥ 15px; smoke render các trang dày dữ liệu (bảng hóa đơn) không vỡ layout. Kiểm tương phản đạt WCAG AA (chữ mờ `opacity:0.9` trên nền — đảm bảo vẫn đạt).

> **Chốt chủ dự án (2026-07-15):** chữ đang quá nhỏ (Inspect thấy `--fs-sm`). ⇒ Thực thi: nâng `--fs-base: 17px`, `--fs-sm: 15px`, và rà thay `--fs-sm`→`--fs-base` ở văn bản đọc. (Nếu 17px làm bảng hóa đơn vỡ, hạ về 16px nhưng vẫn giữ `--fs-sm: 15px`.)

## 7. i18n (thêm `vi.ts`)

`navSettings` (đã có?), `dangKy*` (nhãn form + thông báo), `settingsAbout*`, `settingsPhapLy*`, `settingsTacGia*`, `settingsQuyenLoi*`. Toàn tiếng Việt.

## 8. Kiểm thử

**component/unit** (Vitest + TL):
- Form đăng ký: validate client (email/MST/checkbox bắt buộc), map response 201/400/409/429 → thông báo đúng.
- Route công khai `/dang-ky` truy cập được khi CHƯA đăng nhập.
- SettingsPage: snapshot nội dung 4 Card (thương hiệu, pháp lý, tác giả, quyền lợi) — bắt regression câu chữ pháp lý.
- Font: `--fs-base` = giá trị chốt.

**E2E** (Playwright, mock): mở `/dang-ky` → điền form hợp lệ + tick cam kết → submit → thấy màn "chờ duyệt".

## 9. File tạo/sửa (dự kiến)

```
apps/web/src/
├── features/auth/DangKyPage.tsx                    # (MỚI) trang đăng ký công khai
├── features/auth/LoginPage.tsx                     # (SỬA) link sang đăng ký + gợi ý trạng thái
├── features/settings/SettingsPage.tsx              # (SỬA) 4 Card nội dung đầy đủ
├── routes/AppRouter.tsx                            # (SỬA) thêm <Route path="/dang-ky"> công khai
├── styles/tokens.css                               # (SỬA nếu 17px) --fs-base
├── lib/i18n/vi.ts                                  # (SỬA) chuỗi mới
└── lib/apiClient.ts                                # (SỬA nếu cần) gọi /dang-ky không kèm token
apps/web/test/
├── features/dangKy.test.tsx                        # (MỚI)
├── features/settings.test.tsx                      # (MỚI/SỬA) snapshot pháp lý
└── e2e/dang-ky.spec.ts                             # (MỚI)
```

## 10. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh; snapshot nội dung pháp lý cố định (chống regression câu chữ); **câu "không lưu…" đã được chủ dự án duyệt cho khớp thực tế** (điều kiện xong bắt buộc — Nguyên tắc bằng chứng); font áp đúng; i18n vi; route công khai `/dang-ky` hoạt động; review chéo (UI + rà câu chữ pháp lý) trước khi coi xong; commit nhỏ. **Kết thúc cụm thương mại:** khách tự đăng ký → chủ duyệt qua Cổng Admin → khách đăng nhập & dùng; sản phẩm có danh tính thương mại/pháp lý đầy đủ.

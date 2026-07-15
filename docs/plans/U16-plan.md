# Kế hoạch U16 — Frontend: Trang "Giới thiệu & Ủng hộ" (mục đích phần mềm · góp ý · đóng góp kinh phí theo mức + QR động)

> Trạng thái: **🟢 ĐÃ HIỆN THỰC (2026-07-15).** Module frontend **nhỏ, thuần client** bổ sung vào SPA (U15). Không thêm endpoint backend, không đụng DB/GDT, không dữ liệu tenant. Logic thuần (VietQR) được TDD. **Kết quả kiểm thử:** `vitest run` toàn web **95 test xanh** (23 test U16), `tsc --noEmit` sạch, `biome check` sạch (68 file). Chuỗi VietQR **khớp 100% thư viện tham chiếu `vietnam-qr-pay`** cho mọi mức; đã qua **review chéo độc lập** (bảo mật/RBAC/bằng chứng/đúng chuẩn EMVCo). Đã siết **quy tắc tiền**: số tiền giữ dạng chuỗi xuyên suốt (không ép float cho input người dùng) + chặn ≤ 13 chữ số (giới hạn trường 54 NAPAS). **Còn chờ:** chủ dự án **quét thử QR bằng app ngân hàng thật** để đóng dấu bằng chứng cuối (Nguyên tắc bằng chứng).
>
> Nguồn "làm gì": yêu cầu chủ dự án — một trang ngắn gọn nói **mục đích phần mềm** (giúp doanh nghiệp nhỏ tiết kiệm chi phí phần mềm & nhân sự thao tác thủ công) với **2 phần rõ ràng**: (1) **góp ý qua Zalo/WhatsApp**, (2) **đóng góp kinh phí** với **bộ mức gợi ý (10k/50k/100k/500k + Số khác)**, mỗi mức **hiển thị QR tương ứng**. Nguồn "làm thế nào": `TRIEN_KHAI_BANG_CLAUDE_CODE.md` (vòng lặp U + Definition of Done); khuôn trang bám `apps/web/src/features/settings/SettingsPage.tsx`. Luật áp dụng: `security.md`, `testing.md`. **KHÔNG** đụng `gdt-adapter.md`, `multi-tenant.md`.
>
> **Quyết định đã chốt với chủ dự án (2026-07-15):** ① Vị trí = **trang trong app, sau đăng nhập**. ② Route = **`/gioi-thieu`**, nhãn menu **"Giới thiệu & Ủng hộ"**. ③ Nội dung chữ = **Claude soạn**. ④ Liên hệ = **một số dùng chung** cho Zalo & WhatsApp = **`0989929373`** (`CONTACT_PHONE`). ⑤ Thông điệp tiết kiệm = **định tính**, KHÔNG nêu con số. ⑥ Đóng góp = **bộ mức 10.000 / 50.000 / 100.000 / 500.000 ₫ + "Số khác"**, mỗi mức **sinh QR VietQR động** (có sẵn số tiền). ⑦ Cách tạo QR = **sinh động trong app, offline** (không phụ thuộc dịch vụ ngoài). ⑧ **Chờ chủ dự án cấp:** thông tin **tài khoản ngân hàng** (ngân hàng + số TK + tên chủ TK) và/hoặc **ảnh QR gốc** để trích thông tin + kiểm chứng.

---

## Tiền đề đã kiểm chứng — TÁI DÙNG, KHÔNG dựng lại

U16 thêm **1 trang + 1 mục menu + 1 route + 1 hàm thuần VietQR + 1 thư viện render QR** vào SPA `apps/web` (React 18 + Vite, ADR-0003). Bằng chứng đọc trực tiếp từ mã:

| Thành phần tái dùng | Nguồn (file:line) | Dùng cho |
|---|---|---|
| Mẫu trang tĩnh (`PageHeader` + `Card` + `Alert`, helper `Row`) | `apps/web/src/features/settings/SettingsPage.tsx:1-66` | Khuôn `AboutPage` |
| Primitives `Button` (primary/secondary/ghost), `Card`, `Alert`, `TextField` | `apps/web/src/components/ui/primitives.tsx:20,51,85,110` | Nút góp ý, nút chọn mức, ô "số khác", thẻ nội dung |
| `PageHeader title/subtitle` | `apps/web/src/components/layout/PageHeader.tsx` | Tiêu đề trang |
| Nhóm menu `SYSTEM` (hiện chỉ "Cài đặt chung") + kiểu `NavItem` (`visible` bỏ trống = mọi vai) | `apps/web/src/components/layout/Sidebar.tsx:23,7-13,37` | Chèn mục mới, hiện cho cả 3 vai |
| Route trong `ProtectedLayout` (mẫu `settings` dòng 73), không `RoleRoute` | `apps/web/src/routes/AppRouter.tsx:52-74` | Thêm `<Route path="gioi-thieu">` — mọi vai xem được |
| Từ điển i18n phẳng `vi` + `t()` | `apps/web/src/lib/i18n/vi.ts:15-22` | Thêm `navAbout` |
| Design tokens `var(--brand-600 #c5221f)`, `--sp-*`, `--radius-*`, `--fs-*` — **cấm hardcode hex** | `apps/web/src/styles/tokens.css` | Toàn bộ style inline |
| Thư mục `public/` (Vite mặc định — `vite.config.ts` KHÔNG ghi đè `publicDir`) → phục vụ tại `/` | `apps/web/vite.config.ts:6-11` | Ảnh QR gốc (nếu dùng làm nền/kiểm chứng): `public/donate-qr.png` |

**Kiến trúc route (đã kiểm):** chỉ `/login` công khai; mọi route khác trong `<ProtectedLayout>`. Trang U16 để **trong** `ProtectedLayout`, **không** `RoleRoute` ⇒ cả 3 vai đều xem được.

**Thư viện mới (thêm vào `apps/web`):** `qrcode.react` (render `<QRCodeSVG value=… />` — SVG, client-side, offline, không canvas). Chuỗi VietQR do **hàm thuần tự viết** sinh ra (không phụ thuộc runtime ngân hàng).

---

## Phạm vi

Thêm **một trang** "Giới thiệu & Ủng hộ" vào SPA, gồm phần mục đích + **2 phần tách bạch**; phần đóng góp có **bộ mức + QR động**.

### 16A. Cấu trúc trang (`features/about/AboutPage.tsx`)

1. **Mở đầu — Mục đích:** `PageHeader` + `Card` chứa đoạn giới thiệu (§"Nội dung chữ").
2. **Phần 1 — Góp ý qua Zalo & WhatsApp:** `Card` riêng, 2 nút dẫn ra Zalo/WhatsApp (tab mới).
3. **Phần 2 — Đóng góp kinh phí:** `Card` riêng — bộ chọn mức tiền + ô "Số khác" → **QR VietQR cập nhật tức thì** theo số tiền + lời cảm ơn.

### 16B. Liên kết Zalo/WhatsApp — hàm thuần test được

- Số dùng chung `CONTACT_PHONE = "0989929373"` (một hằng ở `lib/contact.ts`).
- Zalo: `https://zalo.me/0989929373`. WhatsApp: `https://wa.me/84989929373` (chuẩn hóa `0`→`84`, bỏ khoảng trắng).
- Dựng URL bằng hàm thuần `lib/contactLinks.ts` (`zaloUrl`, `whatsappUrl`) — unit-test chuẩn hóa số.
- Nút liên kết là `<a href target="_blank" rel="noopener noreferrer">` (đúng ngữ nghĩa, chống tabnabbing), style bám token cho khớp `Button`.

### 16C. Bộ mức đóng góp + QR động (VietQR) — **trọng tâm kỹ thuật**

- **Bộ mức gợi ý:** `DONATION_TIERS = [10000, 50000, 100000, 500000]` (₫) + nút **"Số khác"** mở `TextField` nhập số nguyên dương (validate; định dạng phân nhóm nghìn bằng thao tác chuỗi, KHÔNG ép float — nhất quán quy tắc tiền của dự án).
- **Sinh chuỗi VietQR động:** hàm thuần `lib/vietqr.ts` → `buildVietQrPayload({ bankBin, accountNumber, amount, addInfo })` trả chuỗi EMVCo/NAPAS:
  - Trường bắt buộc: `00`=01 (format), `01`=**12** (dynamic — có số tiền), `38` (Merchant Account Info: GUID `A000000727`, acquirer=bankBin, consumer=accountNumber, service `QRIBFTTA`), `53`=`704` (VND), `54`=amount, `58`=`VN`, `62` (nội dung CK — mặc định `Ung ho VATEngine`), `63`=**CRC16-CCITT (poly 0x1021, init 0xFFFF)**.
  - Hàm CRC16 riêng, test theo vector mẫu.
- **Render:** `<QRCodeSVG value={payload} size=… />` (qrcode.react). Chọn mức/nhập "số khác" → payload đổi → QR re-render tức thì (offline).
- **Nguồn thông tin tài khoản (chống đoán — Nguyên tắc bằng chứng):** lấy `bankBin`+`accountNumber` từ **thông tin chủ dự án cấp**; nếu chủ dự án đưa **ảnh QR gốc** (VietQR tĩnh), **decode ảnh đó** để trích chính xác trường `38` làm chân lý — KHÔNG tự đoán mã BIN ngân hàng. Đặt cấu hình ở `lib/donation.ts` (`BANK_BIN`, `ACCOUNT_NUMBER`, `ACCOUNT_NAME`).
- **Ảnh QR gốc** (`public/donate-qr.png`) tùy chọn: dùng làm đối chứng khi kiểm thử; nếu muốn, hiển thị như fallback khi JS QR chưa sẵn.

### NGOÀI phạm vi U16 (fence)

- ❌ **Không** cổng thanh toán/webhook đối soát/lưu giao dịch — chỉ **hiển thị QR**; nhận tiền + đối soát nằm ngoài phần mềm.
- ❌ **Không** thu thập dữ liệu người góp ý/người đóng góp; không form gửi tin nội bộ — chỉ liên kết ra ngoài + QR.
- ❌ **Không** trang công khai trước đăng nhập; **không** đa ngôn ngữ (giữ tiếng Việt trước).
- ❌ **Không** gọi dịch vụ ảnh QR bên thứ ba lúc chạy (đã chốt sinh offline).

---

## Nội dung chữ (Claude soạn — chủ dự án duyệt)

> Định tính, KHÔNG nêu con số tiết kiệm (Nguyên tắc bằng chứng + tránh rủi ro quảng cáo sai).

**Tiêu đề trang:** Giới thiệu & Ủng hộ — **Phụ đề:** Vì sao có VATEngine, và cách bạn tiếp sức

**Mục đích (Card mở đầu):**
> VATEngine giúp doanh nghiệp nhỏ **tự tra cứu, kết xuất và đối chiếu hóa đơn điện tử** trực tiếp từ hệ thống của Tổng cục Thuế bằng **chính tài khoản của mình**. Bạn không phải mua phần mềm kế toán đắt tiền chỉ để lấy hóa đơn, cũng không phải bỏ nhiều giờ tải và nhập tay từng hóa đơn mỗi kỳ. Một người có thể làm xong việc trước đây cần nhiều công cụ và nhiều thao tác thủ công — **tiết kiệm cả chi phí phần mềm lẫn thời gian nhân sự**.

**Phần 1 — Góp ý & hỗ trợ:**
> Mọi góp ý, báo lỗi hay đề xuất tính năng đều được đón nhận. Nhắn trực tiếp cho nhóm phát triển:
- Nút **Góp ý qua Zalo** → `zalo.me/0989929373`
- Nút **Góp ý qua WhatsApp** → `wa.me/84989929373`

**Phần 2 — Đóng góp duy trì & phát triển:**
> VATEngine đang **miễn phí** cho doanh nghiệp nhỏ. Nếu phần mềm giúp ích cho công việc của bạn, một khoản đóng góp — dù nhỏ — sẽ giúp **duy trì máy chủ** và **phát triển thêm tính năng**. Chọn mức bên dưới rồi quét mã QR để ủng hộ:
- Bộ mức: **10.000 · 50.000 · 100.000 · 500.000 ₫ · Số khác**
- Dưới QR: hiển thị số tiền đã chọn (định dạng ₫) + nội dung CK gợi ý.
- `Alert tone="success"`: **Cảm ơn bạn đã đồng hành cùng VATEngine.** 🙏

i18n thêm `vi.ts`: `navAbout: "Giới thiệu & Ủng hộ"`.

---

## File sẽ tạo/sửa

```
apps/web/
├── package.json                              # (SỬA) thêm dependency qrcode.react
├── public/
│   └── donate-qr.png                         # (TÙY CHỌN) ảnh QR gốc — đối chứng/fallback
├── src/
│   ├── features/about/AboutPage.tsx          # (MỚI) trang: mục đích + góp ý + đóng góp
│   ├── features/about/DonationQr.tsx         # (MỚI) bộ chọn mức + ô "số khác" + <QRCodeSVG>
│   ├── lib/vietqr.ts                          # (MỚI) buildVietQrPayload + crc16 — HÀM THUẦN
│   ├── lib/contactLinks.ts                    # (MỚI) zaloUrl()/whatsappUrl()
│   ├── lib/contact.ts                         # (MỚI) CONTACT_PHONE = "0989929373"
│   ├── lib/donation.ts                        # (MỚI) BANK_BIN, ACCOUNT_NUMBER, ACCOUNT_NAME, DONATION_TIERS, addInfo
│   ├── lib/i18n/vi.ts                         # (SỬA) thêm navAbout
│   ├── components/layout/Sidebar.tsx          # (SỬA) thêm mục vào nhóm SYSTEM
│   └── routes/AppRouter.tsx                   # (SỬA) thêm <Route path="gioi-thieu">
└── test/
    ├── lib/vietqr.test.ts                     # (MỚI) CRC16 vector, cấu trúc TLV, amount, round-trip decode
    ├── lib/contactLinks.test.ts              # (MỚI) chuẩn hóa số → URL
    └── features/AboutPage.test.tsx            # (MỚI) render 2 phần, chọn mức đổi QR, alt, mọi vai
```
Sửa tài liệu: `CLAUDE.md` §"Quy trình làm việc" nối `→ U16`; `README.md` nếu liệt kê màn. **Không** đụng `apps/api`, `packages/*`, `sync-worker`.

## Test viết trước (TDD)

- **unit `vietqr.test.ts` (offline thuần) — quan trọng nhất:**
  1. `crc16` khớp **vector mẫu VietQR đã biết** (kiểm chứng thuật toán, không đoán).
  2. `buildVietQrPayload` sinh đúng thứ tự/độ dài TLV; `01`=12 khi có amount; `54` = số tiền; `58`=VN; `53`=704.
  3. **Round-trip:** decode chuỗi sinh ra (parser TLV) → trường `38`(bankBin+account), `54`(amount) đúng đầu vào.
  4. Đổi amount (10k→"số khác") → chỉ `54` (+CRC) đổi, phần tài khoản giữ nguyên.
- **unit `contactLinks.test.ts`:** `zaloUrl("0989 929 373")`→`https://zalo.me/0989929373`; `whatsappUrl("0989929373")`→`https://wa.me/84989929373`.
- **component `AboutPage.test.tsx`:** render 3 khối; link Zalo/WhatsApp `href` đúng + `rel` chứa `noopener`; **bấm mức 50.000 → giá trị QR (`value`) chứa `54` với `50000`**; nhập "số khác" hợp lệ → QR đổi; số không hợp lệ → chặn/không render QR; render cho cả 3 vai.

## Tiêu chí nghiệm thu (đo được)

1. **Menu:** mục "Giới thiệu & Ủng hộ" ở nhóm Hệ thống, hiện với cả 3 vai; mở đúng `/gioi-thieu` (sau đăng nhập).
2. **2 phần tách bạch** + đoạn mục đích, đúng §"Nội dung chữ".
3. **Zalo/WhatsApp:** mở đúng liên kết từ `0989929373`, tab mới, `rel="noopener noreferrer"`.
4. **Đóng góp:** chọn mỗi mức (10k/50k/100k/500k) hoặc nhập "số khác" → **QR đổi tương ứng**; QR quét ra đúng tài khoản + số tiền (**kiểm chứng bằng app ngân hàng thật + round-trip decode**).
5. **Chất lượng:** `make lint` sạch (Biome + `tsc`); `make test` xanh gồm test mới; không hardcode hex; không secret trong log; hồi quy U15 không hỏng.

## Ràng buộc bắt buộc chạm tới

- ✅ **Nguyên tắc bằng chứng (VietQR):** format EMV/NAPAS là spec ngoài ⇒ **PHẢI kiểm chứng tái lập**: (a) CRC theo vector mẫu; (b) round-trip decode trong test; (c) **quét thử QR sinh ra bằng app ngân hàng thật** trước khi coi là xong; (d) `bankBin`+`account` lấy từ nguồn chủ dự án/decode ảnh gốc, **không đoán BIN**. Gắn nhãn "CHƯA KIỂM CHỨNG" nếu chưa quét thật.
- ✅ **`security.md`:** số ĐT/số TK/QR là thông tin **chủ dự án tự nguyện công khai** để nhận đóng góp — không phải bí mật hệ thống; không token/mật khẩu trong mã/log. Liên kết ngoài `rel="noopener noreferrer"`.
- ✅ **`testing.md`:** TDD đỏ→xanh; `vietqr.ts`/`contactLinks.ts` là hàm thuần phủ test; coverage tầng logic đạt ngưỡng.
- ✅ **Quy tắc tiền:** số tiền định dạng bằng thao tác chuỗi, không `Number/parseFloat` gây sai (dù mức nhỏ vẫn giữ kỷ luật dự án).
- ⚪ **`multi-tenant.md` / `gdt-adapter.md`:** KHÔNG áp dụng.
- ✅ **A11y:** `alt`/nhãn cho QR; nút mức có trạng thái chọn rõ (aria-pressed); ô "số khác" có label; liên kết ngoài văn bản rõ.

## Rủi ro & phụ thuộc

- 🟠 **Đúng chuẩn VietQR** — sai CRC/thứ tự TLV → QR không quét được. Giảm thiểu: hàm thuần + test vector + round-trip + **quét thật** trước khi chốt.
- 🟠 **Mã BIN ngân hàng** — đoán sai → chuyển nhầm. Giảm thiểu: lấy từ chủ dự án/decode ảnh QR gốc; không hardcode theo trí nhớ.
- 🟢 **Rủi ro UI thấp** — tái dùng mẫu + primitives; `qrcode.react` là thư viện phổ biến, ổn định.
- 🟢 **Chờ tài sản:** thông tin ngân hàng (bắt buộc cho QR động) + ảnh QR gốc (tùy chọn). Chưa đủ ⇒ chưa code phần QR.

## Điểm mơ hồ — trạng thái (2026-07-15)

### #1 Route/nhãn — **ĐÃ CHỐT:** `/gioi-thieu`, "Giới thiệu & Ủng hộ", nhóm SYSTEM.
### #2 Số Zalo/WhatsApp — **ĐÃ CHỐT:** một số `0989929373`.
### #3 Con số tiết kiệm — **ĐÃ CHỐT:** định tính, không nêu số.
### #4 Cách tạo QR theo mức — **ĐÃ CHỐT:** sinh động VietQR trong app, offline.
### #5 Thông tin tài khoản nhận đóng góp — **CHỜ CHỦ DỰ ÁN**
- Cần: **tên ngân hàng** (để tra/khớp BIN NAPAS), **số tài khoản**, **tên chủ tài khoản**; hoặc **ảnh QR gốc** để decode chính xác. Không có → không sinh được QR đúng (không đoán).
### #6 Nội dung chuyển khoản mặc định (`addInfo`) — **ĐỀ XUẤT:** `Ung ho VATEngine` (đổi nếu chủ dự án muốn kèm tên/MST).

---

**Bàn giao.** U16 = trang tĩnh nhỏ + một khối logic thuần (VietQR động theo mức tiền), thuần frontend, tái dùng mẫu `SettingsPage`/primitives/tokens/menu/route sẵn có — **không** backend, **không** dữ liệu tenant/GDT. Sáu quyết định #1–#4, #6 đã chốt; số ĐT đã có (`0989929373`). **Chỉ còn chờ #5: thông tin tài khoản ngân hàng** (ngân hàng + số TK + tên chủ TK, hoặc ảnh QR gốc để decode). Khi đủ: `/start-unit 16` — viết test trước (CRC vector + round-trip + render) → dựng trang → `make lint && make test` → **quét thử QR bằng app ngân hàng thật** → review chéo `dod-auditor`; cập nhật `CLAUDE.md` nối `→ U16`.

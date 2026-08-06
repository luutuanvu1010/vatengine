# Thiết kế — Đưa kênh hỗ trợ ra bề mặt công khai

- **Ngày:** 2026-08-06
- **Trạng thái:** đã duyệt thiết kế, chưa lập kế hoạch thi công
- **Phạm vi:** tầng trình bày `apps/web` (giao diện + định tuyến client). Không đụng API, dữ liệu, RBAC.

## 1. Vấn đề

Chủ dự án muốn hỗ trợ người dùng tốt hơn ngay từ màn Đăng nhập. Khảo sát hiện trạng cho ba
phát hiện, và chúng đổi cách đặt vấn đề:

1. **Zalo và WhatsApp đã có sẵn trên màn Đăng nhập.** `LoginPage.tsx` render `<Footer />`, và
   `Footer.tsx` có cột "Hỗ trợ" chứa hai liên kết đó. Nhưng chúng nằm ở đáy trang, trình bày
   như mọi liên kết khác — người đang mắc kẹt ở form không nhìn thấy.
2. **Ba liên kết còn lại trong cột đó là liên kết chết đối với khách chưa đăng nhập.**
   `AppRouter.tsx` đặt `gioi-thieu` **bên trong** `ProtectedLayout`, nên "Giới thiệu & Hỗ trợ",
   "Câu hỏi thường gặp" và "Lịch sử cập nhật" đều bị `<Navigate to="/login">` bật ngược về
   chính chỗ vừa bấm, không báo lỗi gì. Chú thích trong `Footer.tsx` có nêu đúng rủi ro này
   nhưng chỉ áp cho cột "Sản phẩm"; cột "Hỗ trợ" bị bỏ sót.
3. **Trang Đăng ký không có thông tin hỗ trợ nào.** `DangKyPage.tsx` không render `<Footer />`.

Vậy việc cần làm không phải "thêm cái chưa có" mà là **làm cho thấy được, và sửa chỗ đang gãy**.

## 2. Đối tượng phục vụ

Chủ dự án xác định hai nhóm (2026-08-06):

- **Khách chưa có tài khoản, chưa biết đăng ký thế nào.**
- **Người muốn tự tìm hiểu trước khi hỏi** — đọc FAQ, giới thiệu, lịch sử cập nhật rồi mới nhắn.

Cả hai nhóm đều đứng ở phía **chưa đăng nhập**, nên nội dung tĩnh phải đọc được mà không cần
tài khoản, và kênh liên hệ phải thấy được ngay tại chỗ họ dừng lại.

## 3. Quyết định đã chốt

| # | Quyết định | Người chốt |
|---|---|---|
| QĐ-1 | `/gioi-thieu` mở **toàn bộ** ra công khai (Giới thiệu + FAQ + Lịch sử cập nhật + liên hệ) | Chủ dự án, 2026-08-06 |
| QĐ-2 | Khối "Cần hỗ trợ?" đặt **ngay dưới form**, trong cột trái — thấy được trên cả máy tính lẫn điện thoại | Chủ dự án, 2026-08-06 |
| QĐ-3 | Khối chứa: nút Zalo, nút WhatsApp, số điện thoại bấm gọi được, giờ hỗ trợ. **Không** có liên kết FAQ | Chủ dự án, 2026-08-06 |
| QĐ-4 | Khối có mặt ở **Đăng nhập và Đăng ký**; không thêm vào `/xac-thuc-email`, `/dat-mat-khau` | Chủ dự án, 2026-08-06 |
| QĐ-5 | Neo `#faq` / `#lich-su` phải **cuộn tới đúng mục** — sửa luôn trong lần này | Chủ dự án, 2026-08-06 |
| QĐ-6 | Trang Đăng ký **không** thêm `<Footer />` | Chủ dự án, 2026-08-06 |
| QĐ-7 | Xác minh bằng mắt trên bản chạy tại máy, chủ dự án duyệt **trước khi** commit | Chủ dự án, 2026-08-06 |

Lý do QĐ-2 chọn cột trái chứ không phải panel giới thiệu bên phải: `LoginPage.tsx` đặt
`hidden={isMobile}` cho `<aside>`, tức panel phải **biến mất hoàn toàn** trên điện thoại. Đặt
kênh hỗ trợ vào đó là giấu nó khỏi một nửa người dùng.

Lý do QĐ-3 bỏ liên kết FAQ khỏi khối: lối vào FAQ vẫn nằm ở cột "Hỗ trợ" của Footer, và sau
QĐ-1 nó hết chết. Khối giữ thuần kênh liên hệ.

## 4. Phương án đã chọn và phương án đã loại

**Đã chọn — một đường dẫn, khung đổi theo trạng thái phiên.** Đưa `/gioi-thieu` ra ngoài
`ProtectedLayout`, bọc bằng một route cha tự chọn khung: đã đăng nhập thì dựng `AppLayout`
(sidebar + header y như hôm nay), chưa đăng nhập thì dựng khung công khai gọn. Một URL, một
nội dung, một nguồn sự thật.

**Đã loại — không đụng định tuyến, chỉ nhúng khối hỗ trợ rồi ẩn ba liên kết chết.** Rủi ro
thấp nhất, nhưng khách vẫn không đọc được FAQ trước khi đăng ký, tức không đáp ứng QĐ-1.
Giữ lại làm đường lui nếu thi công phát sinh ngoài dự tính.

**Đã loại — dựng trang giới thiệu công khai riêng, nội dung tách bạch.** Nhân đôi FAQ và Lịch
sử cập nhật thành hai bản; đúng cái mà Hiến pháp và `.claude/rules/ui.md` gọi là nguồn sự thật
thứ hai. Hai bản sẽ lệch.

## 5. Kiến trúc

### 5.1 Sửa nguồn sự thật trước, dựng giao diện sau

Yêu cầu chạm bốn chuỗi dữ liệu: số điện thoại, URL Zalo/WhatsApp, giờ hỗ trợ, nhãn nút. Ba đã
có nguồn; một chưa.

| Tệp | Thay đổi | Vì sao |
|---|---|---|
| `lib/contact.ts` | Thêm `GIO_HO_TRO = "08:00 – 17:00"` | Chuỗi này đang gõ cứng trong `SupportCenter.tsx`. Khối mới gõ lại là tạo nơi thứ hai — đổi giờ hỗ trợ sẽ lệch một chỗ mà không ai biết. |
| `lib/contactLinks.ts` | Thêm `telUrl(phone)` và `hienThiSoDienThoai(phone)` | Cùng khuôn `zaloUrl` / `whatsappUrl` đang có: hàm thuần, dẫn xuất từ `CONTACT_PHONE`, test được. |
| `components/ui/primitives.tsx` | Thêm primitive `LienKetNut` (liên kết trông như nút) | `SupportCenter.tsx` đang có `LinkButton` cục bộ tô kiểu nội tuyến — trái `.claude/rules/ui.md`: thiếu primitive thì thêm vào thư viện, không tô kiểu trong `features/`. Khối mới cần đúng loại nút đó. |

`telUrl` cho ra dạng E.164 — `telUrl("0989929373")` → `tel:+84989929373` — cùng cách chuẩn hoá
`whatsappUrl` đang dùng, và gọi được cả khi máy đang ở mạng nước ngoài.

`hienThiSoDienThoai("0989929373")` → `"0989 929 373"`. Tách nhóm bằng hàm, **không** gõ tay
chuỗi đã tách sẵn — chuỗi gõ tay sẽ lệch khỏi số thật khi số đổi. Quy tắc tách: đúng 10 chữ số
thì chia 3-3-4; độ dài khác thì trả lại nguyên chuỗi chữ số, không đoán cách chia.

Sau thay đổi này, `SupportCenter.tsx` dùng chung `LienKetNut` và `GIO_HO_TRO`; `LinkButton`
cục bộ bị gỡ.

### 5.2 Thành phần mới

**`components/KhoiHoTro.tsx`** — khối "Cần hỗ trợ?" đặt dưới form:

```
Cần hỗ trợ?
[ Nhắn qua Zalo ]  [ Nhắn qua WhatsApp ]
Gọi 0989 929 373  ·  Giờ hỗ trợ 08:00 – 17:00
```

Thuần trình bày: không gọi API, không nhận props dữ liệu, không chạm dữ liệu tenant. Đọc thẳng
từ `contact.ts` và `contactLinks.ts`. Nhãn nút là cụm động từ ngắn không dấu chấm; câu văn ở
`--fs-base` — theo quy chuẩn văn phong trong `.claude/rules/ui.md`.

**`components/layout/KhungCongKhai.tsx`** — khung trang công khai: header mỏng chỉ có
`<Brand />` và một liên kết "Đăng nhập"; phần giữa là `<Outlet />` giới hạn bề ngang 1200px
cho khớp Footer; đáy là `<Footer />` gọi **không** `role` — đúng biến thể ẩn cột "Sản phẩm" mà
`Footer.tsx` đã lo sẵn.

**`lib/useCuonTheoHash.ts`** — hook cuộn tới phần tử mang `id` khớp `location.hash`. Ký hiệu:
`useCuonTheoHash(sanSang: boolean)`, phụ thuộc `[hash, sanSang]`. Cần tham số `sanSang` vì
trong lúc phiên còn ở trạng thái `checking`, `AboutPage` chưa dựng nên `#faq` chưa tồn tại
trong DOM; cuộn lúc đó là cuộn vào chỗ trống. Không tìm thấy `id` thì im lặng bỏ qua, không
ném lỗi.

### 5.3 Định tuyến

Trong `routes/AppRouter.tsx`, gỡ `gioi-thieu` khỏi `ProtectedLayout` và dựng lại thành route
lồng ở ngoài:

```tsx
<Route path="/gioi-thieu" element={<KhungGioiThieu />}>
  <Route index element={<AboutPage />} />
</Route>
```

`KhungGioiThieu` chỉ làm một việc — chọn khung theo trạng thái phiên, cùng khuôn `LoginRoute`
và `DangKyRoute` đã có:

```tsx
function KhungGioiThieu() {
  const { status, me, logout } = useAuth();
  useCuonTheoHash(status !== "checking");
  if (status === "checking") return <DangKiemTraPhien />;   // C8c: không để loé
  if (status === "authed" && me) return <AppLayout me={me} onLogout={logout} />;
  return <KhungCongKhai />;
}
```

Cả hai hook gọi **trước mọi nhánh trả sớm** và vô điều kiện — nhánh `checking` không được phép
làm lệch thứ tự hook. Cả `AppLayout` lẫn `KhungCongKhai` đều render `<Outlet />`, nên
**`AboutPage` không sửa một dòng nào**.

### 5.4 Bề mặt bị chạm

- `LoginPage.tsx` — chèn `<KhoiHoTro />` sau dòng "Chưa có tài khoản? Đăng ký".
- `DangKyPage.tsx` — chèn `<KhoiHoTro />`. Không thêm `<Footer />` (QĐ-6).
- `AppRouter.tsx` — chuyển route `/gioi-thieu`, thêm `KhungGioiThieu`.
- `SupportCenter.tsx` — dùng `LienKetNut` và `GIO_HO_TRO` thay bản cục bộ.

**Không đụng:** nội dung `AboutPage`, `Footer.tsx`, `nav.ts`, RBAC, API, schema, dữ liệu tenant.

## 6. Hệ quả

Ba liên kết `/gioi-thieu`, `#faq`, `#lich-su` ở cột "Hỗ trợ" hết bật ngược về màn Đăng nhập,
mà **không phải sửa `Footer.tsx`** — vì gốc vấn đề nằm ở định tuyến, không nằm ở Footer.

Người đã đăng nhập vào `/gioi-thieu` vẫn thấy sidebar, header, vai — y hệt hôm nay. Đây là thứ
thay đổi định tuyến dễ làm gãy nhất, nên có ca chống hồi quy riêng (mục 7).

Nội dung `/gioi-thieu` từ nay công khai với mọi khách và với trình thu thập dữ liệu. Nội dung
này vốn thuần tĩnh — giới thiệu, FAQ, changelog, thông tin pháp nhân đã in ở Footer công khai —
nên không phát sinh phơi lộ mới.

## 7. Kiểm thử

Viết đỏ trước, theo `.claude/rules/testing.md`. Một test chống hồi quy chỉ tính là có giá trị
khi đã chứng minh nó **đỏ** trước khi sửa.

**Hàm thuần** — `test/lib/contactLinks.test.ts`:
- `telUrl` và `hienThiSoDienThoai` dẫn xuất đúng từ `CONTACT_PHONE`.
- `hienThiSoDienThoai("0989929373")` → `"0989 929 373"`.
- **Ca chống bịa số:** mọi chuỗi số hiển thị phải sinh ra từ `CONTACT_PHONE`, không so với hằng
  gõ tay trong test — cùng tinh thần ca chống-bịa địa chỉ đã có trong `footerNhieuCot.test.tsx`.

**Bề mặt** — `test/features/`:
- Khối "Cần hỗ trợ?" có mặt ở `/login` và `/dang-ky`; ba `href` khớp giá trị do `zaloUrl`,
  `whatsappUrl`, `telUrl` sinh ra.
- `/dang-ky` **không** có Footer — khoá lại QĐ-6, để lần sau không ai "sửa cho đồng bộ" mà vô
  tình lật nó.
- Chưa đăng nhập vào `/gioi-thieu`: thấy FAQ và Footer, **không** bị đẩy về `/login`.
- Đã đăng nhập vào `/gioi-thieu`: vẫn thấy sidebar (chống hồi quy).
- `/gioi-thieu#faq`: `scrollIntoView` được gọi trên phần tử `#faq` — theo dõi bằng spy, vì
  jsdom không cuộn thật.

**Quy ước** — `test/conventions/`:
- Không còn chuỗi giờ hỗ trợ gõ cứng trong `features/`; `SupportCenter` và `KhoiHoTro` cùng đọc
  `GIO_HO_TRO`.

Kết luận xanh/đỏ bằng **mã thoát của `make test`**, không đọc dòng đếm — Vitest có thể in
"N passed" trong khi vẫn thoát khác 0 vì lỗi ở tầng khác.

## 8. Xác minh bằng mắt (QĐ-7, bắt buộc trước khi commit)

Chạy `npm run dev -w apps/web`, chụp bốn màn, mỗi màn hai khổ (máy tính và điện thoại):

1. `/login`
2. `/dang-ky`
3. `/gioi-thieu` lúc đã đăng xuất
4. `/gioi-thieu` lúc đã đăng nhập

Khổ hẹp là nơi panel giới thiệu bên phải biến mất — cũng chính là lý do khối hỗ trợ phải nằm ở
cột trái (QĐ-2), nên khổ này bắt buộc phải có trong ảnh chụp.

Chủ dự án xem và duyệt rồi mới commit.

## 9. Định nghĩa hoàn thành

- Toàn bộ test ở mục 7 xanh; `make lint` sạch; độ phủ không giảm dưới ngưỡng.
- Ảnh chụp mục 8 đã đưa chủ dự án và được duyệt.
- Không có chuỗi liên hệ, giờ hỗ trợ hay số điện thoại nào gõ cứng trong `features/`.
- Không có kiểu nội tuyến mới cho nút trong `features/`; nút mới nằm ở `primitives.tsx`.
- Commit nhỏ, không trộn đơn vị công việc khác.

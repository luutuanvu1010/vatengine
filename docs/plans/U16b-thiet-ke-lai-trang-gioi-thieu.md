# Kế hoạch U16b — Thiết kế lại trang "Giới thiệu & Hỗ trợ"

> Trạng thái: **🟡 ĐỊNH HƯỚNG (2026-07-21).** Chỉnh sửa trang U16 hiện có (`apps/web/src/features/about/`). Thuần frontend, không đụng backend/DB/GDT/tenant. Kế thừa toàn bộ tiền đề đã kiểm chứng của U16.
>
> **Quyết định chủ dự án (2026-07-21):** ① **Ẩn** phần "Đóng góp duy trì & phát triển" — ẩn bằng **cờ (feature flag)**, GIỮ nguyên code + test `DonationQr`/`vietqr.ts` để bật lại dễ dàng. ② **Giữ** phần Giới thiệu (mục đích) + phần Góp ý. ③ Thêm **Lịch sử cập nhật phần mềm** — nguồn **file tĩnh trong app**. ④ Thêm **Trung tâm hỗ trợ & tài liệu bài bản** — gồm **Hướng dẫn sử dụng / FAQ** + **Kênh liên hệ hỗ trợ** (thay cho Zalo rời rạc).

---

## 1. Vì sao đổi

Trang hiện tại (`AboutPage.tsx`) có 3 khối: Giới thiệu · Góp ý · Đóng góp QR. Ba vấn đề chủ dự án nêu:

1. **Đóng góp QR chưa phù hợp lúc này** → tạm ẩn, nhưng công sức đã làm (VietQR động, 23 test xanh) không nên vứt.
2. **Hỗ trợ đang rời rạc qua Zalo** → người dùng không có nơi tự tra hướng dẫn, mọi thứ dồn vào chat cá nhân.
3. **Không có lịch sử cập nhật** → người dùng không thấy phần mềm đang tiến hóa, mất niềm tin vào một sản phẩm "đang sống".

Định hướng: biến trang từ "giới thiệu + xin ủng hộ" thành **trung tâm thông tin & hỗ trợ bài bản** cho người dùng.

---

## 2. Cấu trúc trang mới (thứ tự từ trên xuống)

| # | Khối | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | **Giới thiệu — Mục đích phần mềm** | GIỮ | Card hiện có, giữ nguyên nội dung |
| 2 | **Trung tâm hỗ trợ & tài liệu** | MỚI | Hướng dẫn/FAQ + kênh liên hệ (gộp phần Góp ý cũ vào đây) |
| 3 | **Lịch sử cập nhật phần mềm** | MỚI | Changelog từ file tĩnh, hiển thị theo phiên bản/ngày |
| 4 | ~~Đóng góp duy trì & phát triển~~ | **ẨN (cờ)** | `SHOW_DONATION = false` — code giữ nguyên, không render |

Nhãn trang nên đổi từ "Giới thiệu & **Ủng hộ**" → "Giới thiệu & **Hỗ trợ**" cho khớp nội dung mới (route `/gioi-thieu` giữ nguyên để không hỏng liên kết).

---

## 3. Chi tiết từng khối

### 3.1. Giới thiệu (giữ nguyên)

Card mục đích hiện tại — không đổi.

### 3.2. Trung tâm hỗ trợ & tài liệu (MỚI)

Gộp phần "Góp ý" cũ vào đây, trình bày bài bản thành hai phần con:

**a) Hướng dẫn sử dụng & Câu hỏi thường gặp (FAQ)**
- Danh sách bài hướng dẫn dạng **accordion** (câu hỏi bấm mở ra câu trả lời) — gọn, không rối trang.
- Nội dung nguồn: **file tĩnh** `lib/faq.ts` (mảng `{ q, a, category? }`), Claude soạn nháp → chủ dự án duyệt.
- Chủ đề tối thiểu nên có:
  - Cách kết nối tài khoản thuế (đăng nhập MST, captcha do người dùng nhập).
  - Cách đồng bộ hóa đơn mua vào / bán ra.
  - Cách kết xuất & convert (Excel/XML).
  - Cách đối chiếu.
  - Câu hỏi an toàn dữ liệu: "Phần mềm có lưu mật khẩu thuế của tôi không?", "Dữ liệu của tôi có bị chia sẻ không?".
  - Xử lý sự cố thường gặp (token hết hạn, đồng bộ lỗi).

**b) Kênh liên hệ hỗ trợ** (nâng cấp từ phần Góp ý)
- Giữ nút Zalo/WhatsApp hiện có, thêm thông tin bài bản:
  - **Giờ hỗ trợ: 08:00 – 17:00** (đã chốt 2026-07-21).
  - **Cách gửi báo lỗi hiệu quả:** nên kèm gì (ảnh màn hình, MST, thời điểm xảy ra, thao tác đang làm) — giúp giảm hỏi đi hỏi lại qua Zalo.
  - **(Định hướng) Nút tham gia cộng đồng** — xem §8.
- Vẫn là liên kết ra ngoài (`rel="noopener noreferrer"`), không thu thập dữ liệu người dùng (giữ fence U16).

### 3.3. Lịch sử cập nhật phần mềm (MỚI)

- Nguồn: **file tĩnh** `lib/changelog.ts`:
  ```ts
  export type ChangelogEntry = {
    version: string;      // "1.4.0"
    date: string;         // "2026-07-21" (ISO, hiển thị định dạng VN)
    title: string;        // tóm tắt 1 dòng
    changes: string[];    // gạch đầu dòng, ngôn ngữ cho người không kỹ thuật
    kind?: "feature" | "fix" | "improvement";  // để gắn nhãn màu
  };
  ```
- Hiển thị: timeline dọc, mỗi mục 1 Card/dòng — phiên bản + ngày + nhãn loại + danh sách thay đổi.
- Sắp xếp mới nhất lên đầu. Có thể "xem thêm" nếu dài (mặc định hiện ~5 mục gần nhất).
- **Ngôn ngữ cho người không kỹ thuật:** "Thêm bộ lọc theo dòng hàng" thay vì "Implement line-item column filter". Đây là bản người dùng đọc, không phải git log.
- Ứng viên seed từ các đơn vị đã làm (U17–U26): lọc dòng hàng, quản trị/đăng ký, v.v.

### 3.4. Đóng góp — ẩn bằng cờ

- Thêm `const SHOW_DONATION = false;` (đặt ở `lib/donation.ts` hoặc đầu `AboutPage.tsx`).
- Bọc khối `<Card>…<DonationQr/></Card>` trong `{SHOW_DONATION && (…)}`.
- **KHÔNG xóa** `DonationQr.tsx`, `vietqr.ts`, test liên quan → bật lại chỉ cần đổi cờ thành `true`.
- Test hiện có của Donation vẫn chạy (test unit hàm thuần không phụ thuộc cờ render).

---

## 4. File sẽ tạo/sửa

```
apps/web/src/
├── features/about/AboutPage.tsx        # (SỬA) bố cục lại: 3 khối hiện + ẩn Donation bằng cờ
├── features/about/SupportCenter.tsx    # (MỚI) Hướng dẫn/FAQ (accordion) + kênh liên hệ
├── features/about/Changelog.tsx        # (MỚI) render lịch sử cập nhật
├── lib/faq.ts                          # (MỚI) dữ liệu FAQ tĩnh
├── lib/changelog.ts                    # (MỚI) dữ liệu lịch sử cập nhật tĩnh
├── lib/donation.ts                     # (SỬA) thêm SHOW_DONATION = false
└── lib/i18n/vi.ts                      # (SỬA) navAbout → "Giới thiệu & Hỗ trợ"; thêm chuỗi mới
test/
└── features/about.test.tsx             # (SỬA) render FAQ accordion, changelog; Donation KHÔNG render khi cờ tắt
```

Không đụng `apps/api`, `packages/*`, routing (route `/gioi-thieu` giữ nguyên).

---

## 5. Việc cần chủ dự án cung cấp / duyệt

1. **Nội dung FAQ** — Claude soạn nháp theo tính năng thực tế, chủ dự án sửa cho đúng nghiệp vụ.
2. **Giờ hỗ trợ** + quy ước báo lỗi (nếu có).
3. **Danh sách phiên bản đã phát hành** để seed changelog — hoặc để Claude dựng từ lịch sử U17–U26 rồi chủ dự án duyệt.
4. Xác nhận đổi nhãn menu "Ủng hộ" → "Hỗ trợ".

---

## 6. Ràng buộc & Definition of Done

- Bám `security.md` (không secret, liên kết ngoài `noopener`), `testing.md` (component test cho FAQ/changelog; Donation ẩn khi cờ tắt).
- A11y: accordion có `aria-expanded`; changelog dùng cấu trúc danh sách đúng ngữ nghĩa.
- Không hardcode hex — dùng tokens.
- `make lint` sạch, `make test` xanh (gồm test mới, không hỏng test Donation cũ).
- Không đụng `gdt-adapter.md` / `multi-tenant.md`.

---

## 7. Đề xuất thứ tự thực thi (khi bắt tay code)

1. Ẩn Donation bằng cờ (nhanh, gỡ ngay phần chưa cần).
2. Dựng `lib/changelog.ts` + `Changelog.tsx` (dữ liệu tĩnh, ít rủi ro).
3. Dựng `lib/faq.ts` + `SupportCenter.tsx` (accordion + nâng cấp phần liên hệ).
4. Ghép vào `AboutPage.tsx`, cập nhật i18n + nhãn menu.
5. Cập nhật test → `make lint && make test` → review chéo.
```

---

## 8. Định hướng cộng đồng — Zalo vs Telegram vs Discord

Bối cảnh: khách hàng là **doanh nghiệp nhỏ / kế toán tại Việt Nam**, không phải lập trình viên. Đây là yếu tố quyết định.

| Tiêu chí | **Zalo (nhóm/OA)** | **Telegram** | **Discord** |
|---|---|---|---|
| Độ phổ biến với kế toán VN | ⭐⭐⭐ Rất cao — hầu như ai cũng có | ⭐⭐ Trung bình | ⭐ Thấp, lạ lẫm |
| Rào cản tham gia | Thấp nhất | Thấp | Cao (giao diện hướng game/tech) |
| Kênh thông báo 1 chiều (đăng cập nhật) | OA/nhóm | Channel — rất mạnh | Announcement channel |
| Tổ chức theo chủ đề, tra cứu lịch sử | Yếu | Khá | ⭐⭐⭐ Mạnh nhất (kênh, thread, tìm kiếm) |
| Hình ảnh "sản phẩm chuyên nghiệp" | Bình dân | Gọn gàng | Thiên về cộng đồng tech |

**Khuyến nghị:** với tệp khách kế toán VN, **Zalo là kênh chính** (rào cản thấp nhất, đúng thói quen người dùng), **Telegram Channel làm kênh thông báo phát hành** (đăng changelog tự động, người dùng chỉ đọc). **Discord chưa nên** ưu tiên lúc này — tệp người dùng không quen, dễ vắng.

Lộ trình đề xuất: giai đoạn đầu dồn vào Zalo + một Telegram Channel thông báo; khi cộng đồng đủ đông và có nhu cầu thảo luận sâu/tra cứu theo chủ đề mới cân nhắc Discord.

> Trên trang: thêm nút "Tham gia nhóm Zalo" (khi có link nhóm) cạnh nút góp ý. Cần chủ dự án cấp: **link nhóm Zalo** và/hoặc **link Telegram Channel**.

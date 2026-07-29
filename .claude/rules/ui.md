---
paths:
  - "apps/web/**/*.tsx"
  - "apps/web/**/*.ts"
  - "packages/domain/**/*.ts"
  - "packages/export/**/*.ts"
  - "packages/query/**/*.ts"
---

# Luật: Giao diện & ánh xạ dữ liệu

Cụ thể hoá nguyên tắc "một nguồn sự thật" và "cô lập phụ thuộc ngoài" của Hiến pháp cho **tầng trình bày**. Kim chỉ nam: **khai báo một lần — chiếu ra nhiều bề mặt** (bảng, thanh lọc, allowlist sắp/lọc, file xuất đều là hình chiếu của một mô hình miền duy nhất).

Chi tiết đầy đủ (chẩn đoán, kiến trúc 6 tầng, triết lý, tiêu chí nghiệm thu): `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md`. Hướng dẫn nhanh: `docs/design/huong-dan-co-ban-giao-dien.md`.

## Bắt buộc

- **Một nguồn sự thật cho trường hoá đơn (Registry).** Mọi thuộc tính "trình bày & khả năng" của một trường (nhãn VN, kiểu, lọc được/sắp được/hiển thị ở đâu/vào file xuất không) khai **một lần** trong Registry miền hoá đơn (gói dùng chung). Cột bảng, ô lọc, allowlist sắp xếp và `EXPORT_COLUMNS` phải **dẫn xuất** từ Registry — KHÔNG khai lại tay ở `InvoiceTable`, `FilterBar`, hay nơi khác.
- **Nhãn một nguồn.** Chữ hiển thị của một trường lấy từ Registry; nhãn mã trạng thái `tthai` lấy từ **`@vat/domain/trangThaiHoaDon.ts`** (`nhanTthai`) — một nguồn cho CẢ web lẫn file kết xuất; `statusLabels.ts` chỉ là lớp mỏng khoác quy ước riêng của bảng (`null` → `—`). `ttxly` vẫn chưa mã nào kiểm chứng nên bảng nhãn của nó GIỮ RỖNG. Chỉ gán nhãn cho mã ĐÃ KIỂM CHỨNG — nguyên tắc bằng chứng. Cấm gõ chuỗi nhãn rời trong màn (nguồn gốc lệch "Tổng TT" vs "Tổng thanh toán").
- **Registry KHÔNG nới lỏng an toàn.** Registry chỉ mô tả trình bày/khả năng; nó *sinh ra* allowlist `ORDER BY` và cấu hình lọc, KHÔNG thay thế Zod `invoiceFilterSchema` phía server (vẫn validate input không tin cậy) và KHÔNG mở rộng allowlist (chống SQL injection — `packages/query/filters.ts`).
- **Câu văn để ĐỌC luôn `--fs-base` (16px) — QĐ-9b.** `--fs-sm`/`--fs-xs` chỉ dành cho **nhãn** (meta bảng, chip, caption); dùng chúng cho một câu hoàn chỉnh là lỗi, và là gốc của phàn nàn "chữ bé khó đọc" đã tái diễn hai lần (U20, rồi U37b). Sắc độ "phụ" biểu đạt bằng **màu chữ**, không bằng cách bóp cỡ. Tiêu đề neo theo thân với bước ~1.25× (20/24/30/36) — thang đầy đủ + lý do ở `docs/07-DESIGN_TOKENS.md` §4. Máy kiểm: `test/conventions/ui-luat.test.ts` ép `tokens.css` khớp nguyên văn §7 của tài liệu đó.
- **Phân cấp tiêu đề phải nhìn thấy được.** Tiêu đề LUÔN lớn hơn chữ thân và in đậm: trang `--fs-2xl` (`PageHeader`, `<h1>`), mục/thẻ `--fs-lg` (`SectionLabel` / `SectionTitle`, `<h2>`). **Cấm** dùng cỡ nhãn (`--fs-sm`/`--fs-xs`) cho tiêu đề — bản cũ của `SectionLabel` render `<h2>` ở 15px, tức tiêu đề NHỎ HƠN thân 18px. Cấm `text-transform: uppercase` cho tiêu đề và câu văn. Cấp thẻ HTML là **ngữ nghĩa** (không nhảy `h1→h3`), cỡ chữ là **trình bày** — dùng `SectionTitle as="h3"` khi cần cấp sâu hơn mà giữ cỡ, KHÔNG chọn thẻ theo cỡ chữ mong muốn. Cấm gõ lại `fontSize` + `fontWeight` tiêu đề nội tuyến trong `features/`; thiếu cấp → thêm vào primitive.
- **Nhãn ngắn trong nút/menu — mô tả đầy đủ ở khối cuối trang.** Nhãn nút và mục menu là **cụm động từ ngắn ≤ 40 ký tự**, không dấu chấm cuối. Câu mô tả chức năng đặt trong `HuongDanTrang` + `MucHuongDan` ở **cuối nội dung chính** của trang. KHÔNG chen mô tả dài vào thẻ hành động (làm chật chỗ thao tác) và KHÔNG giấu mô tả trong tooltip `InfoTip` (người dùng cảm ứng không hover được ⇒ coi như không có). `InfoTip` chỉ dùng cho chú thích một dòng về **số liệu**, không dùng để giải thích chức năng.
- **Chỉ dùng token + primitive.** Màu/khoảng cách/chữ chỉ qua biến `--…` (`tokens.css`) — cấm hardcode hex/px. Mọi nút/ô nhập/ô chọn dùng primitive chung (`components/ui/primitives.tsx`); nếu thiếu (vd `Select`/`Field`), **thêm primitive mới vào thư viện**, KHÔNG tô kiểu nội tuyến trong `features/`.
- **Bốn trạng thái mỗi màn.** Mọi màn dữ liệu lo đủ: rảnh / đang tải / rỗng / lỗi (`Loading`/`EmptyState`/`ErrorState`). Không để "màn trắng".
- **Hợp đồng tương tác nhất quán.** Tách bạch hai loại hành động: *đọc dữ liệu đã có* (nhẹ, tức thời — vd "Lọc dữ liệu") và *kéo mới từ Tổng cục Thuế / ghi* (nặng, chạy nền — vd "Đồng bộ và tải xuống"). Tên nút + vị trí phải phản ánh đúng loại. Sửa bộ lọc → áp dụng khi bấm nút lọc (không trộn kiểu "một số ô áp tức thì, số khác thì không").
- **An toàn đa tenant ở client.** Dữ liệu tenant (bộ lọc chứa MST, lựa chọn dòng) không được sót qua phiên — theo `multi-tenant.md` H-B.3.

## Quy chuẩn văn phong (chốt 2026-07-29)

Đối tượng đọc là kế toán viên Việt Nam. Chữ trên màn hình phải đọc như văn bản nghiệp vụ kế toán — thuế, không phải văn nói.

- **Không khẩu ngữ.** *kéo* → **truy xuất / tải về**; *bắn, đẩy* → **gửi, chuyển**; *gom* → **tổng hợp**; *chạy (tác vụ)* → **thực hiện, xử lý**; *tạch, treo* → **thất bại, không phản hồi**; *làm lại* → **thực hiện lại**; *file* → **tệp**; *link* → **liên kết**; *ok* → **đồng ý, xác nhận**.
- **Một khái niệm — một tên gọi.** `hóa đơn đã phát hành` (không "đã xuất") · `người mua` (không "khách hàng" trong ngữ cảnh chứng từ) · `Tổng cục Thuế` cho cơ quan, `hệ thống Tổng cục Thuế` cho máy chủ (không "máy chủ thuế"/"GDT"/"TCT") · `liên kết` (không "đường dẫn") · `tệp` (không "file") · `Tổng thanh toán` (không "Tổng TT") · `dòng hàng` (không "line item"). Viết đủ **mã số thuế** và **hóa đơn điện tử** trong câu văn, không dùng **MST**/**HĐĐT** đơn độc.
- **Chính tả:** dùng `hóa` (không `hoá`) — quy ước toàn repo, khớp `@vat/domain` và file kết xuất.
- **Trình bày chữ:** sentence case; nhãn nút là cụm động từ ngắn không dấu chấm; câu mô tả viết đủ câu có dấu chấm. Nhấn mạnh bằng `<strong>`, **không** viết hoa toàn phần. Không dấu chấm than, không biểu tượng cảm xúc. Dùng gạch ngang `—` chứ không gạch nối `-` giữa hai vế câu.
- **Thông báo lỗi** nêu *việc gì thất bại* + *người dùng nên làm gì*, không đổ lỗi hệ thống, không phơi thuật ngữ kỹ thuật thô. Câu kết chuẩn: "Vui lòng thử lại." / "Vui lòng thử lại sau ít phút."

Kiểm kê gốc và lý do từng thay đổi: `docs/bao-cao/kiem-ke-ngon-ngu.md` + `docs/bao-cao/ket-qua-chuan-hoa.md`.

## Cổng kiểm một thay đổi giao diện

Trước khi thêm/sửa một ý tưởng giao diện hay một nút, phải trả lời "Đạt" cho tất cả (chi tiết + ví dụ: Phần H tài liệu chuẩn):

1. Đúng tầng chưa? (token/primitive/Registry/pattern/trang)
2. Đụng trường dữ liệu → sửa ở Registry chứ không sửa tay trong bảng?
3. Nhãn lấy từ một nguồn (Registry/`statusLabels`)?
4. Dùng primitive + token có sẵn (hoặc thêm primitive mới), không tự tô?
5. Ý nghĩa hành động đúng (đọc nhẹ vs kéo nặng), tên/vị trí phản ánh đúng, theo hợp đồng tương tác?
6. Đủ 4 trạng thái + an toàn đa tenant + không bịa giá trị chưa kiểm chứng?
7. Không phá tiêu chí máy-kiểm (một-nơi, không-lệch-nhãn, không-hardcode)?

**Câu hỏi vàng:** *"Sửa mấy nơi — và màn khác có tự hưởng, hay phải chép lại?"* Sửa một nơi + tự hưởng → thuận thiết kế. Nhiều nơi / phải chép → đang vá ở ngọn, quay về đúng tầng (câu 1).

## Khi gặp mơ hồ

Nếu một trường/cột/hành vi mới chưa rõ nên khai ở tầng nào, hoặc một nhãn chưa có trong Registry: **dừng và hỏi**, đề xuất chỗ khai đúng (thường là Registry) kèm test dẫn xuất để chứng minh không phá bề mặt khác (vd file xuất giữ nguyên đầu ra). Không chèn tay rồi để lệch nguồn.

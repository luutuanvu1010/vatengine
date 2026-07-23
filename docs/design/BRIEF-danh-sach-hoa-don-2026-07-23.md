# Design Brief — Danh sách hóa đơn (S1) · trình bày lại "đẹp & khoa học hơn"

> **Cho ai:** vai **Claude Design** (tham chiếu từ GitHub). **Đây là brief bề mặt** — chỉ đề xuất trình bày/format, **không** đổi dữ liệu, **không** đổi kiến trúc, **không** thêm màn/trường ngoài ánh xạ đã có. Tuân đúng CLAUDE.md §3 (vai Design) + `.claude/rules/ui.md`.
>
> **Ngày:** 2026-07-23 · **Trạng thái code:** đã LIVE (`vat-web` Version `a67a5399`, `vatengine.tourdao.vn`). Brief này polish TRÊN nền đó.

## 1. Mục tiêu

Trang **Danh sách hóa đơn** (`apps/web/src/features/invoices/InvoicesPage.tsx`) vừa được thu gọn thành **công cụ chọn kỳ → xem số lượng → xuất/đồng bộ** (bỏ bảng danh sách). Hiện tại nó **đúng chức năng nhưng trình bày còn thô**: số đếm là một dòng chữ nhỏ ("Có N hóa đơn"), các vùng thao tác chưa có phân cấp thị giác rõ. Nhiệm vụ: **làm bố cục sạch, phân cấp rõ, dễ đọc, nhất quán hệ token** — KHÔNG thêm chức năng.

## 2. Đầu vào BẮT BUỘC đọc trước (theo thứ tự)

1. `docs/06-BINDING_MAP.md` — S1 chỉ được dùng dữ liệu từ `GET /invoices/summary`.
2. `docs/07-DESIGN_TOKENS.md` — nguồn token DUY NHẤT (màu/chữ/spacing/bo góc). Cấm hex/px rời.
3. `.claude/rules/ui.md` + `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md` — Registry một-nguồn, primitive, 4 trạng thái, hợp đồng tương tác, **Cổng kiểm một thay đổi giao diện** (§7 dưới).
4. Mã hiện tại: `InvoicesPage.tsx`, `FilterBar.tsx`, `ChonKy.tsx`, `RangeSyncPanel.tsx`, `InvoiceExportButtons.tsx`, `components/ui/primitives.tsx`, `tokens.css`.

## 3. Trang HIỆN có gì (ánh xạ dữ liệu)

- **Khối lọc** (`FilterBar`): nút nhanh Tháng/Quý/Năm (`ChonKy`) + 2 ô ngày **Từ ngày/Đến ngày** (day-level) + nút **"Lọc dữ liệu"** (đọc nhẹ) + Chiều/Nguồn/MST.
- **Panel đồng bộ** (`RangeSyncPanel`, chỉ vai quản lý tài khoản thuế): nút **"Đồng bộ và tải xuống"** (kéo nặng, chạy nền, tự tải) + thanh tiến độ.
- **Vùng kết quả**: **số đếm** "Có N hóa đơn" (`GET /invoices/summary` → `total.count`) + nút **Xuất Excel/CSV** (chỉ vai được kết xuất). Đủ 4 trạng thái: đang tải / lỗi / rỗng (count 0) / có dữ liệu.

## 4. Ràng buộc CỨNG — không được vi phạm

1. **Chỉ token + primitive.** Màu/khoảng cách/chữ chỉ qua biến `--…`; nút/ô nhập/ô chọn dùng primitive chung. Thiếu primitive (vd cần "Stat"/"StatBlock") thì **thêm primitive mới vào thư viện**, KHÔNG tô kiểu nội tuyến trong `features/` (phép kiểm `test/conventions/ui-luat.test.ts` chặn `style=` trên input/select).
2. **KHÔNG thêm lại "Tổng thanh toán"** hay bất kỳ số tiền nào ở màn này — chủ dự án đã quyết bỏ (2026-07-23). Trang này là **đếm + xuất**, không phải bảng tổng tiền.
3. **KHÔNG dựng lại bảng danh sách hóa đơn**, không thêm cột, không chọn dòng, không phân trang — đã gỡ có chủ đích.
4. **Nhãn một nguồn.** Không gõ chuỗi nhãn trường rời; mã trạng thái lấy từ `statusLabels.ts`.
5. **Hợp đồng tương tác giữ nguyên:** "Lọc dữ liệu" = đọc nhẹ; "Đồng bộ và tải xuống" = kéo nặng chạy nền. Tên + vị trí phải phản ánh đúng; không trộn.
6. **Đủ 4 trạng thái** + **an toàn đa tenant ở client** (không rò dữ liệu qua phiên).
7. **Không đổi hợp đồng API, không đổi `apps/api`/`packages`.** Thuần `apps/web` (tokens/primitives + `features/invoices`).

## 5. Định hướng thiết kế (đề xuất cụ thể, bám token)

Mục tiêu "khoa học hơn" = **phân cấp thị giác rõ + nhịp khoảng cách nhất quán**, KHÔNG phải thêm dữ liệu:

- **Số đếm là tiêu điểm.** Trình bày như một **stat/KPI** thay vì một dòng chữ nhỏ: số dùng cỡ lớn (`--fs-3xl` = 30, đúng vai "Số liệu thẻ lớn"), `font-variant-numeric: tabular-nums` (class `tabular` sẵn có), nhãn phụ "hóa đơn khớp bộ lọc" ở `--fs-sm`/`--text-tertiary`. Cân nhắc kèm **badge kỳ đang xem** (vd "01/07 – 31/07/2026") lấy từ `filter.tuNgay/denNgay` — đây là dữ liệu ĐÃ có ở client, không gọi thêm.
- **Ba vùng tách bạch, cùng nhịp:** (a) Lọc, (b) Đồng bộ (kéo nặng), (c) Kết quả + Xuất. Dùng `Card` + spacing `--sp-*` nhất quán; ngăn cách bằng khoảng trắng/`--border-subtle`, không kẻ nặng.
- **Phân cấp nút:** "Lọc dữ liệu" (đọc nhẹ) và "Xuất" (thứ cấp) KHÁC trọng số thị giác với "Đồng bộ và tải xuống" (hành động nặng, chính ở panel đồng bộ). Dùng biến thể primitive `Button` (`primary`/`secondary`) — không tự pha màu.
- **Khối lọc gọn hàng:** nhóm "kỳ nhanh" (Tháng/Quý/Năm) và "khoảng ngày" (Từ/Đến) cho thấy quan hệ (chọn nhanh → tinh chỉnh ngày); căn `align-items:end`, wrap đẹp trên hẹp. Ô ngày là primitive `Field type=date`.
- **Trạng thái rỗng/lỗi/tải** dùng `EmptyState`/`ErrorState`/`Loading` sẵn có, thông điệp ngắn, đúng ngữ cảnh (rỗng khi đang đồng bộ nền có thông điệp riêng — giữ như hiện tại).
- **Responsive:** mọi vùng wrap được ở màn hẹp; số đếm không tràn; nút không bị cắt.

## 6. Đề xuất TÙY CHỌN (cần chủ dự án duyệt — có thể bỏ)

`GET /invoices/summary` trả sẵn `byChieu:[{chieu,count,…}]`. **Nếu chủ dự án muốn "khoa học hơn"**, có thể thêm **tách số đếm theo chiều**: *Mua vào N₁ · Bán ra N₂* (chỉ **số lượng**, KHÔNG tiền), dùng màu chiều đã chuẩn hoá (`--info-*` Mua vào, `--success-*` Bán ra). Đây là dữ liệu ĐÃ có, không gọi thêm API. **Chỉ làm nếu được duyệt** — mặc định giữ một con số tổng cho đúng yêu cầu gốc "chỉ hiển thị số lượng".

## 7. Cổng kiểm nghiệm thu (phải "Đạt" hết trước khi chốt)

1. Đúng tầng? (token/primitive/pattern/trang — không vá ở ngọn).
2. Nhãn lấy từ một nguồn; không chuỗi rời gây lệch.
3. Chỉ primitive + token; nếu cần kiểu mới → thêm primitive, không tô tay. `test/conventions/ui-luat.test.ts` XANH.
4. Nghĩa hành động đúng (đọc nhẹ vs kéo nặng); tên/vị trí phản ánh đúng.
5. Đủ 4 trạng thái + an toàn đa tenant + không bịa giá trị chưa kiểm chứng.
6. KHÔNG re-thêm tiền/bảng/cột; thuần bề mặt.
7. `tsc --noEmit` + `biome check` sạch; test `apps/web` XANH (giữ/ cập nhật test bề mặt tương ứng, không giảm phủ).
8. Xem thử bằng mắt (dev + build tĩnh) rồi **chủ dự án duyệt thẩm mỹ** trước khi deploy.

## 8. Điểm cần chủ dự án quyết (thẩm mỹ)

- Số đếm dạng stat lớn — cỡ/kiểu chốt cuối do chủ dự án.
- Có thêm badge kỳ đang xem không?
- Có bật tách theo chiều (§6) không?
- Bố cục dọc (3 khối xếp) hay 2 cột trên màn rộng?

> **Ranh giới:** brief này chỉ định hướng. Mọi thay đổi vẫn qua đúng vòng (đọc → làm bề mặt → test → chủ dự án duyệt → deploy `vat-web`). Không đổi API, không migration.

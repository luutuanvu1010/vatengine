# U15 — Design Brief (nguyên liệu cho Claude Design)

> **Vai trò:** đây là **nguyên liệu thiết kế độc lập định dạng** — nội dung sản phẩm/UX để đưa cho Claude Design ở Bước 3. **Nguồn dữ liệu/hợp đồng: `docs/06-BINDING_MAP.md` (nguồn chân lý — KHÔNG lặp lại/không bịa trường ở đây).** Tài liệu này chỉ mô tả **bối cảnh, người dùng, màn hình, luồng, nguyên tắc UX, tông điệu, ràng buộc** — KHÔNG chứa mockup, KHÔNG chọn màu/typography cụ thể (đó là việc Claude Design + `07-DESIGN_TOKENS` sau).
>
> **Trạng thái:** 🟡 Dự thảo 2026-07-14. Sẽ **đóng gói lại theo định dạng Claude Design đòi** ở Bước 2 (sau khi Bước 1 nghiên cứu xong). Ngăn xếp đã chốt: ADR-0003 (React+Vite SPA).

---

## 1. Sản phẩm là gì (một câu)

SaaS đa khách hàng giúp doanh nghiệp **tra cứu, kết xuất, đối chiếu hóa đơn điện tử** (mua vào + bán ra) kéo từ Tổng cục Thuế bằng chính tài khoản MST của họ, và **tự kết nối tài khoản thuế** (đăng nhập + nhập captcha) để đồng bộ dữ liệu thật.

## 2. Người dùng & quyền (3 vai — nguồn: `rbac.ts`)

| Vai | Thấy được | KHÔNG thấy |
|---|---|---|
| **Kế toán** (`ke_toan`) | Tra cứu, chi tiết, tổng hợp, đối chiếu | Kết xuất/convert, kết nối tài khoản thuế (ẩn nút) |
| **Kế toán trưởng** (`ke_toan_truong`) | Tất cả của kế toán + kết xuất/convert + kết nối tài khoản thuế | — |
| **Quản trị** (`quan_tri`) | Như kế toán trưởng | — |

Thiết kế phải thể hiện **phân quyền bằng ẩn/khoá hành động** (không chỉ dựa server chặn). Cùng một tenant — không bao giờ thấy dữ liệu tenant khác.

## 3. Màn hình (bề mặt — chi tiết endpoint xem `06-BINDING_MAP §2–3`)

1. **Đăng nhập nội bộ** (S0) — email + mật khẩu SaaS. Tối giản, tin cậy.
2. **Danh sách hóa đơn** (S1) — trung tâm sản phẩm. Bảng + bộ lọc kỳ/chiều/nguồn/MST + phân trang + thẻ tổng hợp (đếm + tổng tiền theo chiều mua/bán).
3. **Chi tiết hóa đơn** (S2) — chỉ phần header (chưa có dòng hàng — nêu rõ "dòng hàng chưa khả dụng").
4. **Kết xuất & Convert** (S3) — chọn định dạng (xlsx/csv) / profile kế toán (hiện chỉ `reference` khả dụng) → tạo → tải link. Chỉ kế toán trưởng+quản trị.
5. **Đối chiếu** (S4) — thẻ tóm tắt 4 con số + danh sách nhóm 4 loại phát hiện; mỗi phát hiện dẫn tới hóa đơn liên quan.
6. **Kết nối tài khoản thuế (GDT)** (S5) — luồng 4 bước: đăng ký MST → ủy quyền → hiển thị captcha (SVG) cho người **tự gõ** → đăng nhập, hiển thị hạn token. Chỉ kế toán trưởng+quản trị.

## 4. Luồng chính (ưu tiên thiết kế)

- **Luồng đọc (dùng hằng ngày):** Đăng nhập → Danh sách (lọc kỳ) → Chi tiết / Kết xuất / Đối chiếu. Đây là **đường xương sống** — tối ưu tốc độ + rõ ràng.
- **Luồng kết nối thuế (thiết lập, ít lặp):** Kết nối tài khoản thuế → ủy quyền → captcha → đăng nhập. Nhạy cảm (mật khẩu thuế + captcha) → thiết kế **an tâm, từng bước rõ**, báo lỗi captcha/hết hạn tường minh.

## 5. Nguyên tắc UX (nguồn: `U15-plan §4C`)

- **4 trạng thái mỗi màn:** loading (skeleton) · rỗng (hướng dẫn) · lỗi (thông báo + thử lại) · dữ liệu. Không "màn trắng".
- **Bộ lọc kỳ thân thiện kế toán:** nút nhanh Tháng/Quý/Năm/Khoảng ngày; nhớ bộ lọc gần nhất.
- **Tiền & số:** căn phải, phân nhóm nghìn, hiện đơn vị tiền tệ; cảnh báo trực quan cho phát hiện lệch thuế.
- **Ánh xạ lỗi → hành vi:** 401→về đăng nhập · 403→chặn + báo sai vai · 400→lỗi nhập liệu · 404→không tìm thấy · 409→(login thuế) chưa ủy quyền.

## 6. Tông điệu & thương hiệu (định hướng, chốt thẩm mỹ ở Claude Design)

- **Đối tượng:** kế toán doanh nghiệp VN — ưu tiên **chính xác, tin cậy, gọn**, không màu mè.
- **Cảm giác:** công cụ tài chính nghiêm túc; mật độ dữ liệu cao nhưng dễ quét mắt; rõ thứ bậc thông tin.
- **Ngôn ngữ:** **tiếng Việt trước** (`lang="vi"`), thuật ngữ kế toán/thuế chuẩn.
- **Khả truy cập:** WCAG AA (tương phản, điều hướng bàn phím, ARIA cho bảng/trạng thái).

## 7. Ràng buộc CỨNG (thiết kế phải tôn trọng — nguồn `06-BINDING_MAP §7`)

- **Tiền = chuỗi numeric, có thể >2^53** → định dạng KHÔNG ép float. Sai số tiền là lỗi nghiêm trọng.
- **`tdlap` là thời khắc UTC** → hiển thị giờ VN (UTC+7), không lệch ngày.
- **Nhãn `ttxly`/`tthai`:** chỉ mã đã kiểm chứng; mã lạ → "số (chưa rõ)". KHÔNG đoán nhãn.
- **Captcha do người nhập** — không có UI tự giải; chỉ hiển thị ảnh + ô nhập.
- **Không bí mật ở client:** không MST/mật khẩu thuế trong mã, không log token; JWT in-memory (ADR-0003 #3).
- **Cách ly tenant:** `tenant_id` luôn từ token, UI không gửi/không tin từ client.

## 8. NGOÀI phạm vi (đừng thiết kế — nguồn `06-BINDING_MAP §8`)

Cổng Admin · nút "Đồng bộ ngay" · màn lịch sử đồng bộ · dòng hàng chi tiết hóa đơn · webhook/pull kế toán. (Đều chờ đơn vị backend khác.)

## 9. Cần khi đóng gói (Bước 2, sau khi biết định dạng Claude Design)

Ghép tài liệu này + `06-BINDING_MAP` (hợp đồng dữ liệu) + `U15-plan §4A/4B` (kỹ thuật/ánh xạ) thành **đúng định dạng Claude Design đòi** (design brief? component inventory? data contract? — Bước 1 xác định). Nếu Claude Design cần ảnh tham chiếu / component list → sinh thêm từ mục 3 ở trên.

# U20 — Kế hoạch thực thi (đối chiếu với U17b/U18 đã hiện thực)

> Nguồn: `docs/plans/U20-plan.md` (spec gốc 2026-07-15). File này ghi kết quả đối chiếu với backend thật và chốt phạm vi theo quyết định chủ dự án 2026-07-21.
>
> Nhánh: `feat/u20-dang-ky-khach`, cắt từ trunk sau khi U18+U19 đã merge.

---

## 0. Đối chiếu — spec gốc còn đúng ở đâu, lệch ở đâu

| # | Điểm | Trạng thái |
|---|---|---|
| D1 | Mã lỗi `/dang-ky` | Spec liệt kê 4 mã; backend thật có **7**: `bad_request`, `chua_dong_y_dieu_khoan`, `email_khong_hop_le`, `mst_khong_hop_le`, `da_ton_tai` (409), `qua_nhieu_yeu_cau` (429), `khong_xac_dinh_duoc_ip` (503). UI phải phủ cả 7 |
| D2 | Buộc đổi mật khẩu lần đầu | **Chủ dự án chốt 2026-07-21: KHÔNG ép.** Nhưng U18 đặt hạn 72h cho mật khẩu tạm ⇒ phải có **đường đổi tự nguyện**, nếu không khách bị khoá cứng sau 72h. Chốt **cách A** (§4) |
| D3 | Câu chữ pháp lý Card 2 | Chủ dự án **duyệt bản đã điều chỉnh** — nói đúng rằng hệ thống lưu token GDT **đã mã hoá** và không lưu mật khẩu thuế thô |
| D4 | Cỡ chữ | Chủ dự án chốt **giữ `--fs-base: 16px`**, chỉ sửa chỗ lạm dụng `--fs-sm` cho văn bản đọc |

---

## 1. Phạm vi

**Trong phạm vi:**
1. Trang **Đăng ký** công khai `/dang-ky` → `POST /dang-ky` → màn "chờ duyệt".
2. Liên kết hai chiều với `/login` + gợi ý tĩnh về trạng thái chờ duyệt.
3. **Đổi mật khẩu** trong trang Cài đặt (không ép) → `POST /auth/doi-mat-khau`.
4. Viết lại **trang Cài đặt** — 4 card theo `U20-plan` §5.
5. Rà `--fs-sm` ở **văn bản đọc** trên các trang người dùng thực sự đọc.

**NGOÀI phạm vi:** màn chặn buộc đổi mật khẩu (chủ dự án loại); quên mật khẩu (**U24**, cần email); trang marketing; đa ngôn ngữ; gói trả phí.

---

## 2. Trang Đăng ký — `/dang-ky`

Route **công khai**, ngang `/login`, **ngoài** `ProtectedLayout` (`AppRouter.tsx` hiện chỉ có `/login` là công khai).

Form: **Email · Tên doanh nghiệp · MST** + checkbox cam kết ủy quyền MST (bắt buộc tick).

Ánh xạ **đủ 7 mã lỗi** — mỗi mã một câu nói đúng việc người dùng cần làm:

| Mã | Thông điệp |
|---|---|
| `email_khong_hop_le` | Email không được chấp nhận. Dùng email doanh nghiệp, Gmail hoặc Yahoo — không dùng email tạm thời. |
| `mst_khong_hop_le` | Mã số thuế phải gồm 10 hoặc 13 chữ số. |
| `chua_dong_y_dieu_khoan` | Cần tích ô cam kết ủy quyền trước khi gửi. |
| `da_ton_tai` (409) | Email hoặc mã số thuế này đã được đăng ký. |
| `qua_nhieu_yeu_cau` (429) | Quá nhiều yêu cầu từ mạng của bạn. Thử lại sau ít phút. |
| `khong_xac_dinh_duoc_ip` (503) | Hệ thống tạm chưa nhận được yêu cầu. Thử lại sau. |
| `bad_request` | Thông tin chưa hợp lệ. Kiểm tra lại các ô. |

Thành công (201) → **màn chờ duyệt**, KHÔNG tự chuyển hướng: *"Đăng ký đã được ghi nhận và đang chờ duyệt. Chúng tôi sẽ kích hoạt tài khoản sau khi xác minh."*

⚠️ **Không hứa thời gian và không hứa email.** Hạ tầng gửi email thuộc **U24**, chưa có — hệ thống hiện **không gửi gì** cho khách. Mật khẩu tạm do super-admin đọc trực tiếp cho khách (QĐ-1). Viết "chúng tôi sẽ gửi email cho bạn" là hứa một thứ không tồn tại.

---

## 3. Màn login — không đoán lý do 401

`/auth/login` cố ý trả 401 gọn cho **cả** sai-mật-khẩu lẫn chưa-duyệt (chống dò tài khoản, U17b). UI **không được** suy ra "chưa duyệt" từ phản hồi.

Thay vào đó: một dòng gợi ý **tĩnh**, luôn hiện dưới form — *"Nếu bạn vừa đăng ký, tài khoản cần được duyệt trước khi đăng nhập được."* + liên kết `Chưa có tài khoản? Đăng ký`.

---

## 4. Đổi mật khẩu trong Cài đặt (cách A — chốt 2026-07-21)

**Vì sao bắt buộc phải có dù không ép:** U18 đặt `mat_khau_tam_het_han` = 72 giờ cho mật khẩu tạm 6 số. Không có đường đổi thì mọi khách được duyệt sẽ **bị khoá cứng sau 72 giờ** và phải xin cấp lại — lặp vô hạn. Đây không phải tính năng thêm cho đẹp; nó là mắt xích làm cho mật khẩu tạm dùng được.

Card trong Cài đặt: `Mật khẩu hiện tại` · `Mật khẩu mới` (≥8) · `Xác nhận mật khẩu mới` → `POST /auth/doi-mat-khau`.

Ánh xạ lỗi: `401` → "Mật khẩu hiện tại không đúng." · `400 mat_khau_moi_trung_hien_tai` → "Mật khẩu mới phải khác mật khẩu hiện tại." · `400` → "Mật khẩu mới phải từ 8 ký tự."

Khi login trả `phai_doi_mat_khau: true`, hiện một `Alert` **nhắc nhở** (không chặn) ở Cài đặt: *"Bạn đang dùng mật khẩu tạm do quản trị viên cấp. Mật khẩu này sẽ hết hạn — hãy đặt mật khẩu riêng."*

---

## 5. Trang Cài đặt — 4 card

Theo `U20-plan` §5. Card 2 dùng **bản câu chữ đã điều chỉnh** (chủ dự án duyệt 2026-07-21): không lưu mật khẩu thuế thô; token phiên **được mã hoá** và chỉ dùng để đồng bộ theo yêu cầu.

---

## 6. Cỡ chữ — sửa có chọn lọc, không sửa mù

`--fs-base` **giữ 16px**. `--fs-sm: 13px` đang được dùng **56 lần / 12 file**; phần lớn hợp lệ (nhãn phụ, chú thích, badge).

Chỉ đổi sang `--fs-base` ở **văn bản để đọc** — đoạn văn, mô tả, nội dung card — trên các trang người dùng thực sự đọc: `SettingsPage`, `about/`, `LoginPage`, và trang Đăng ký mới. **Không** đụng nhãn cột bảng, chip, badge, chú thích form — ở đó 13px là đúng vai trò.

---

## 7. Test viết trước

1. `/dang-ky` là route **công khai** — vào được khi chưa đăng nhập, không bị đá về `/login`.
2. Gửi form hợp lệ → gọi `api.dangKy` đúng tham số → hiện màn chờ duyệt.
3. **Mỗi mã trong 7 mã lỗi** → đúng thông điệp tương ứng (bảng §2).
4. Chưa tick cam kết → nút gửi bị vô hiệu (chặn ở client trước khi chạm server).
5. Màn chờ duyệt **không hứa gửi email** — assert không chứa chữ "email" trong câu hứa hẹn.
6. `/login` có liên kết sang `/dang-ky` và ngược lại.
7. Đổi mật khẩu: thành công → thông báo; 401 → "mật khẩu hiện tại không đúng"; trùng mật khẩu cũ → thông điệp riêng.
8. Hai ô mật khẩu mới không khớp → chặn ở client, không gọi API.
9. Cờ `phai_doi_mat_khau` → hiện Alert nhắc; không có cờ → không hiện.
10. Cài đặt render đủ 4 card; câu Card 2 nói "được mã hoá", **không** nói "không lưu thông tin kết nối".

---

## 8. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh; 7 mã lỗi có test; đổi mật khẩu có test cả đường thành công lẫn hỏng; không hardcode hex (dùng token); commit nhỏ.

**Điểm chuyển:** khách tự đăng ký được từ trình duyệt, và sau khi được duyệt thì tự đặt được mật khẩu riêng — chuỗi onboard khép kín, không còn mắt nào phải làm tay.

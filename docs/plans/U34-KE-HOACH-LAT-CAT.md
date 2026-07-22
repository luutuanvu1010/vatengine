# U34 — Kế hoạch theo LÁT CẮT GIAO ĐƯỢC

> Chốt 2026-07-22. **Thay thế cách chia đơn vị** trong `U34-plan-email-va-thong-bao.md`.
> Các quyết định QĐ-12…QĐ-18 và ADR-0007 **giữ nguyên** — chỉ đổi cách chia việc.

---

## 1. Vì sao phải chia lại

Kế hoạch cũ chia theo **năng lực kỹ thuật**. Kết quả:

| Đơn vị cũ | Xong rồi thì ai dùng được gì? |
|---|---|
| U34a Telegram | ✅ chủ dự án nhận được báo |
| U34b hạ tầng email | ❌ **không ai** — chỉ là một cái ống chưa nối vào đâu |
| U34c xác thực email | ❌ **không deploy được một mình** (thiếu trang SPA) |

Một đơn vị mà xong rồi vẫn không giao được cho ai là **ranh giới sai**. U34c ôm cả backend lẫn frontend; lúc bắt đầu chỉ soi thấy nửa backend, và phát hiện nửa kia khi đã viết xong. Đó chính là chỗ cảm giác "làm cái này xong mới phát hiện thiếu cái kia" sinh ra — không phải vì thiếu kế hoạch, mà vì **kế hoạch chia sai trục**.

Thêm: mỗi đơn vị cũ **không có Định nghĩa Hoàn thành viết trước**, nên "xong" bị quyết định giữa đường.

## 2. Luật chia việc từ nay

1. **Mỗi lát cắt xong là DEPLOY ĐƯỢC và có người dùng được**, kể cả khi phải gộp migration + backend + frontend vào một lát.
2. **Định nghĩa Hoàn thành viết TRƯỚC khi gõ dòng mã đầu tiên**, dưới dạng *"một người thật làm được X"* — không phải *"module Y đã viết xong"*.
3. **Ghi rõ những gì phải deploy CÙNG NHAU.** Thiếu dòng này là nguồn gốc của deploy nửa vời.
4. **Không mở lát cắt mới khi lát trước chưa deploy xong.** Không để hai khoảng dở dang chồng lên nhau.
5. Rà lại kế hoạch sau mỗi lát: cái gì vừa lộ ra thì ghi vào ngay, đừng để tới lúc đụng phải.

## 3. Trạng thái thật (2026-07-22)

**Đã LIVE:** U33 Turnstile · Telegram báo đăng ký · hạ tầng SES (chưa route nào dùng).

**Trên trunk, CHƯA deploy:** backend xác thực email (`fd709a8`) + **migration 0013 chưa áp**.

⚠️ Production đang KHÁC trunk. Lát cắt 1 tồn tại để đóng khoảng dở dang này.

⚠️ Telegram hiện bắn ở bước ĐĂNG KÝ (sai so với QĐ-15). Lát cắt 1 đưa nó về đúng chỗ.

---

## 4. Bốn lát cắt

### ✅ LÁT CẮT 1 — Khách tự xác thực được email — **XONG, ĐÃ NGHIỆM THU 2026-07-22**

Chủ dự án đăng ký thật, đi trọn đường: nhận thư → bấm link → thấy chờ duyệt → Telegram bắn đúng ở bước xác thực. `vat-api` `a4293a9e` · `vat-web` `4a5b3a42` · migration 0013 đã áp.

**Xong khi:** một người thật đăng ký trên `vatengine.tourdao.vn` → nhận được thư → bấm link → thấy màn "đã xác thực, chờ duyệt" → **và điện thoại chủ dự án kêu đúng lúc đó, không sớm hơn**.

| Việc | Trạng thái |
|---|---|
| Migration 0013 (bảng token + 2 hàm SECURITY DEFINER) | ✅ viết xong, **chưa áp** |
| Backend: `/dang-ky` đổi hợp đồng, `POST /xac-thuc-email` | ✅ xong |
| Chuyển thông báo Telegram sang bước xác thực | ✅ xong |
| **Trang SPA `/xac-thuc-email`** | ✅ xong |
| **Màn chờ đọc cờ `daGuiThu`** | ✅ xong |
| Deploy | ✅ xong |
| Nghiệm thu bằng đăng ký thật | ✅ đạt |

**Trang `/xac-thuc-email` phải:** đọc `?token=`, gửi **POST** (không phải GET — máy quét thư tự fetch GET và tiêu mất token), và hiển thị **bốn** kết quả riêng biệt: thành công · hết hạn · đã dùng rồi · liên kết hỏng. Ba cái sau người dùng xử lý khác nhau, gộp lại là bắt họ đoán.

🔴 **PHẢI DEPLOY CÙNG NHAU, ĐÚNG THỨ TỰ:**
```
make migrate  →  vat-api  →  vat-web
```
Lý do: `/dang-ky` đổi hợp đồng phản hồi. Deploy `vat-web` trước thì màn chờ đọc một cờ chưa tồn tại; deploy `vat-api` trước khi migrate thì đăng ký chết vì thiếu bảng (đúng sự cố `deploy.md` ghi lại).

**Nghiệm thu:** đăng ký thật bằng một địa chỉ thật, đi trọn đường. Không nghiệm thu bằng test tự động — chuỗi này đã có test, thứ chưa có bằng chứng là **đường thật xuyên qua ba hệ thống**.

---

### ✅ §4b — Nợ đã giải: migration 0013 đã áp lên production (2026-07-22)

Chủ dự án chốt **hướng 1** (bỏ bước trả-lại-membership). Nhưng khi chạy thật thì lộ ra
nguyên nhân KHÁC hẳn suy đoán ban đầu:

| Lỗi | Nguyên nhân thật | Cách giải |
|---|---|---|
| `must be able to SET ROLE` | Đổi chủ sở hữu đòi phải là thành viên của role đích | `GRANT xac_thuc_api TO CURRENT_USER` |
| `permission denied for schema public` | **KHÔNG phải do câu REVOKE.** Postgres đòi chủ sở hữu MỚI phải có quyền `CREATE` trên schema chứa hàm — mà role vừa tạo thì chưa có gì | `GRANT USAGE, CREATE ON SCHEMA public TO xac_thuc_api` |

Suy đoán ban đầu đổ cho câu REVOKE là **sai**: câu 13 hoá ra là khối đổi chủ sở hữu, không
phải REVOKE. Chỉ khi áp tay và in lỗi TỪNG CÂU mới thấy. Hướng 1 vẫn giữ (lý do ghi ở cuối
file migration), nhưng nó không phải thứ gỡ được bế tắc.

**Đã kiểm chứng trên production, 6/6:** bảng có · RLS enable+force · 0 policy (fail-closed) ·
hai hàm thuộc `xac_thuc_api` · `vat_app` gọi được · PUBLIC không gọi được.

⚠️ **CÒN LẠI CỦA LÁT CẮT 1:** deploy `vat-api` rồi `vat-web`, sau đó đăng ký thật một lượt.
Migration là thay đổi CỘNG DỒN nên mã cũ đang chạy không hề hấn gì — production đang ở
trạng thái an toàn và nhất quán.

---

### LÁT CẮT 2 — Khách không bị kẹt khi không nhận được thư  *(lùi xuống sau Lát 3)*

**Xong khi:** khách không thấy thư (rơi spam, gõ nhầm địa chỉ) tự xin gửi lại được, **và** hồ sơ bỏ dở không chiếm chỗ vĩnh viễn.

- `POST /gui-lai-xac-thuc` + nút ở màn chờ.
- **Cooldown theo địa chỉ** (lưu trong DB, không dùng Durable Object — QĐ-11 đã gỡ hết). Không có cooldown thì đây là vũ khí dội thư, và là đường làm cạn hạn mức SES.
- **Trần cứng theo ngày ở tầng ứng dụng**, chạm trần thì log cảnh báo rõ ràng chứ không im lặng hỏng.
- Dọn hồ sơ quá 24h chưa xác thực → `da_xoa` (cần phần cơ chế của Lát cắt 4; nếu chưa có thì tạm chỉ đánh dấu, chưa giải phóng MST).

**Vì sao không gộp vào Lát cắt 1:** Lát 1 đã giao được giá trị trọn vẹn cho người làm đúng mọi bước. Lát 2 lo người gặp trục trặc — quan trọng, nhưng không phải điều kiện để Lát 1 dùng được.

---

### LÁT CẮT 3 — Duyệt xong khách tự đặt mật khẩu  ← **ĐANG Ở ĐÂY (đảo lên trước Lát 2)**

> **Đảo thứ tự 2026-07-22.** Chủ dự án nêu: hiện Cổng Admin hiện mã 6 số để tự tay gửi cho
> khách — bất hợp lý và đang xảy ra MỖI LẦN duyệt. Lát 2 lo tình huống chưa gặp lần nào.
> Nỗi đau đang có thắng nỗi đau có thể có.
>
> **QĐ-14 giữ nguyên và được xác nhận lại:** thư chứa **ĐƯỜNG LINK đặt mật khẩu**, không
> chứa mã 6 số. Lý do chốt lại lần hai — mã 6 số ra đời CHỈ vì phải đọc qua điện thoại; khi
> hệ thống tự gửi thư, lý do đó biến mất và chỉ còn lại điểm yếu: 10^6 khả năng, không còn
> khoá theo tài khoản (QĐ-11), và rule WAF thì VẪN CHƯA ai kiểm chứng. Link 32 byte không
> dò được. Khách cũng ít thao tác hơn (mở thư → bấm → đặt), và bộ máy token đã dựng sẵn ở
> Lát cắt 1 nên dùng lại rẻ hơn là giữ đường mã 6 số.

**Xong khi:** chủ dự án bấm Duyệt → khách nhận thư kèm link đặt mật khẩu → tự đặt → đăng nhập được. **Chủ dự án không còn nhìn thấy mật khẩu của khách.**

- Token đặt mật khẩu (32 byte, băm, dùng một lần, hạn 72h) — cùng khuôn mẫu Lát 1.
- Trang `/dat-mat-khau`.
- **Gỡ hẳn mật khẩu tạm 6 chữ số** (QĐ-14) → xoá món nợ mức CAO đang treo.

🔴 **Deploy cùng nhau:** migration + `vat-api` + `vat-web` + **`vat-admin`** (Cổng Admin bỏ phần hiện mã 6 số).

---

### LÁT CẮT 4 — Xoá được tenant

**Xong khi:** chủ dự án xoá được một hồ sơ, và sau đó doanh nghiệp đó đăng ký lại được bằng chính mã số thuế cũ.

- Trạng thái `da_xoa` + hàm `admin_xoa_tenant()` (ẩn danh hoá tại chỗ, KHÔNG `DELETE` — QĐ-18).
- UNIQUE một phần trên `mst` để giải phóng mã số thuế.
- Nút Xoá trong Cổng Admin.

**Không chặn ba lát trên.** Đặt cuối vì đây là việc dọn dẹp, không phải đường sống của khách.

---

## 5. Còn treo, KHÔNG thuộc lát nào

| Việc | Ai làm |
|---|---|
| 🔴 Rule rate-limit WAF trên Cloudflare | **Chủ dự án** — chưa ai kiểm rule có tồn tại không |
| Câu hỏi pháp lý về audit đã ghi (ADR-0007 §2.4) | **Chủ dự án** hỏi người có chuyên môn |
| U19 còn 15% (panel chi tiết + form metadata) | Sau U34 |

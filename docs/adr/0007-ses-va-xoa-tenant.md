# ADR-0007 — Gửi email qua Amazon SES, và cách "xoá" tenant khi audit bất biến

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-07-22
- **Thay thế:** QĐ-13 (Resend) trong `COMMERCIAL-LAYER-tinh-hinh.md` — xem §1.4

---

## 1. Gửi email: Amazon SES

### 1.1 Bối cảnh
U34 cần đường email cho ba việc: xác thực địa chỉ khi đăng ký, báo admin, và gửi link đặt mật khẩu sau khi duyệt. QĐ-13 (22-07, buổi sáng) chốt Resend vì dựng nhanh. Chiều cùng ngày chủ dự án cho biết **đã có hạn mức SES 50.000 email/ngày** — tức tài khoản đã thoát sandbox.

Điều đó xoá mất lý do chính khiến Resend được chọn, và giải luôn mối lo lớn nhất của QĐ-13: trần **100 email/ngày** của bậc free Resend vốn tự nó là một đích tấn công (kích cạn hạn mức ⇒ email đặt mật khẩu của khách thật cũng tắc).

### 1.2 Quyết định
Dùng **Amazon SES API v2** qua HTTPS, ký SigV4 bằng **`aws4fetch`**, đặt sau interface `EmailTransport` (cùng khuôn mẫu `GdtTransport` — `gdt-adapter.md`).

**SMTP không phải lựa chọn:** Workers không mở được kết nối SMTP/STARTTLS thông thường. Đường HTTPS là đường duy nhất, và may là đường tốt hơn.

### 1.3 Hợp đồng API — đã tra tài liệu chính thức 2026-07-22
```
POST https://email.<region>.amazonaws.com/v2/email/outbound-emails
Content-type: application/json
{
  "FromEmailAddress": "...",
  "Destination": { "ToAddresses": ["..."] },
  "Content": { "Simple": {
      "Subject": { "Data": "...", "Charset": "UTF-8" },
      "Body": { "Html": { "Data": "...", "Charset": "UTF-8" },
                "Text": { "Data": "...", "Charset": "UTF-8" } } } }
}
→ 200 { "MessageId": "..." }
```
Tên service khi ký SigV4: `ses`. **Charset phải khai UTF-8** — nội dung tiếng Việt có dấu.

Mã lỗi cần xử lý riêng, không gộp làm một:

| Lỗi | HTTP | Ý nghĩa với ta |
|---|---|---|
| `MessageRejected` | 400 | Nội dung bị từ chối — lỗi của ta, phải log to |
| `MailFromDomainNotVerifiedException` | 400 | **Cấu hình sai** — cả đường email chết, phải báo động |
| `TooManyRequestsException` | 429 | Vượt tốc độ gửi — đáng retry có backoff |
| `AccountSuspendedException` | 400 | **Tài khoản bị khoá vĩnh viễn** |
| `SendingPausedException` | 400 | **Tài khoản bị tạm dừng** |

### 1.4 Vì sao `aws4fetch` chứ không phải AWS SDK, cũng không tự viết
- **AWS SDK v3** nặng, kéo theo cả cây phụ thuộc, cần `nodejs_compat` — quá mức cho **một** thao tác duy nhất.
- **Tự viết SigV4** khả thi (~60 dòng WebCrypto) nhưng là mã ký mật mã: sai một bước trong chuỗi HMAC thì lỗi biểu hiện dưới dạng "403 không rõ lý do".
- `aws4fetch`: **0 phụ thuộc, MIT, 1.0.20**.

⚠️ **Đã kiểm chứng 2026-07-22 (npm registry):** bản mới nhất phát hành **2024-08-28**, tức ~2 năm không có bản mới. Với SigV4 — một thuật toán đã đóng băng — đó nhiều khả năng là "xong việc" chứ không phải bỏ hoang, nhưng **phải ghi nhận là rủi ro**. Giảm thiểu: ghim đúng phiên bản, và vì nó nằm SAU `EmailTransport` nên nếu có ngày hỏng, thay bằng ~60 dòng tự viết chỉ đụng một file.

### 1.5 🔴 RỦI RO LỚN NHẤT, VÀ NÓ KHÔNG PHẢI KỸ THUẬT: bị AWS khoá tài khoản
SES đình chỉ tài khoản khi **tỉ lệ bounce > 5%** hoặc **tỉ lệ khiếu nại > 0,1%**. Một form đăng ký **công khai** gửi email tới địa chỉ **chưa từng được xác minh** là đúng hồ sơ rủi ro mà AWS cảnh báo.

Và nó tạo ra một đường tấn công cụ thể: kẻ xấu nộp hàng loạt địa chỉ **không tồn tại** → bounce dồn lên → **AWS khoá tài khoản gửi của ta** → không chỉ email xác thực chết, mà **email đặt mật khẩu của khách thật cũng chết**. Cùng dạng thiệt hại với trần 100/ngày của Resend, chỉ là hậu quả nặng hơn và **khó khôi phục hơn nhiều** (phải giải trình với AWS).

Đây là hệ quả trực tiếp của việc U33 mở cổng đăng ký cho người lạ. Bắt buộc, trước khi bật email:
1. **Kiểm bản ghi MX của tên miền trước khi gửi**, bằng DNS-over-HTTPS tới `1.1.1.1` (Cloudflare, cùng nhà, không thêm phụ thuộc). Miền không có MX ⇒ **không gửi**, báo lỗi tại form ngay lúc khách còn đang nhìn màn hình. Đây là bộ lọc rẻ nhất và chặn phần lớn địa chỉ gõ sai.
2. **Configuration Set + suppression list** của SES: bật theo dõi bounce/complaint, để SES tự chặn địa chỉ đã bounce.
3. **Trần cứng theo ngày ở tầng ứng dụng**, đặt thấp hơn hạn mức AWS, chạm trần thì **log cảnh báo** chứ không im lặng.
4. **Cooldown theo địa chỉ** cho nút "gửi lại".
5. ⚠️ **Rule rate-limit WAF vẫn là điều kiện bắt buộc** — không thay đổi so với QĐ-13.

### 1.6 Bí mật cần nạp
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `EMAIL_FROM`. Khoá IAM phải là user **chỉ có đúng quyền `ses:SendEmail`** — không dùng khoá vạn năng. Nạp qua `wrangler secret put` (`security.md`).

---

## 2. "Xoá" tenant khi audit_log bất biến

### 2.1 Bối cảnh — cơ chế thật, đã đọc mã
- `audit_log.tenant_id` → `tenants.id` **`ON DELETE CASCADE`** (`0000_equal_wendigo.sql:104`).
- Trigger `audit_log_immutable` (`0002_audit_append_only.sql`) ném exception với **mọi** UPDATE/DELETE, **kể cả owner và superuser** — cố ý, để bất biến không phụ thuộc cách kết nối.

⇒ `DELETE FROM tenants` kích hoạt cascade xuống `audit_log` → trigger ném → **toàn bộ lệnh xoá thất bại**. Đó là lý do "không xoá được tenant".

Và một phát hiện mới hôm nay, nghiêm trọng hơn bản thân bài toán xoá:

> **`maskSensitive` KHÔNG che email.** `SENSITIVE_KEYS` chỉ gồm token/password/secret/cookie/rawjson. Nên `audit_log.chi_tiet` của hành động `dang_ky` đang lưu **email khách ở dạng thô**, trong một bảng **không bao giờ sửa hay xoá được**. Mỗi lượt đăng ký thêm một hàng như vậy.

### 2.2 Nhận ra rằng xung đột được đặt sai đề
Sổ nợ ghi đây là mâu thuẫn giữa `security.md` (audit bất biến) và NĐ 13/2023 (quyền xoá dữ liệu). **Không phải.** Mâu thuẫn thật là giữa *xoá HÀNG* và *bất biến*.

Quyền xoá dữ liệu **không đòi phải xoá hàng** — nó đòi **dữ liệu cá nhân không còn đọc được**. Hai việc đó chỉ trùng nhau khi dữ liệu cá nhân nằm trong hàng không xoá được. Vậy lối ra là: **đừng để dữ liệu cá nhân nằm ở đó.**

### 2.3 Quyết định

**(a) `audit_log` chỉ lưu SỰ KIỆN và THAM CHIẾU, không lưu dữ liệu cá nhân.**
`chi_tiet` giữ `tenant_id`, `doi_tuong`, `hanh_dong`, MST — không giữ email hay tên người. Muốn biết "ai đăng ký" thì tra `nguoi_dung` theo `tenant_id`; bảng đó **ẩn danh hoá được**. Audit trả lời "chuyện gì đã xảy ra", danh tính tra ở nơi có kiểm soát.
→ Bổ sung nhận diện email vào `maskSensitive`, và bỏ `email` khỏi `chi_tiet` ở `routes/dangKy.ts`.

**(b) KHÔNG BAO GIỜ `DELETE` hàng tenant. Ẩn danh hoá tại chỗ.**
Thêm trạng thái **`da_xoa`** và hàm `SECURITY DEFINER` `admin_xoa_tenant(id)`, trong MỘT giao dịch:
1. `nguoi_dung.email` → giá trị chết, không quay ngược được (`xoa-<uuid>@invalid`), `password_hash` → NULL;
2. `tenants.ten` → `'(đã xoá)'`, `trang_thai` → `'da_xoa'`;
3. **APPEND** một hàng audit `xoa_tenant` — chính việc xoá cũng phải để lại dấu vết.

Không có `DELETE` ⇒ không cascade ⇒ trigger không kích hoạt ⇒ **không còn xung đột nào để hoà giải.** `security.md` giữ nguyên, không phải sửa luật để né.

**(c) MST được giải phóng bằng UNIQUE một phần.**
Thay unique toàn phần trên `tenants.mst` bằng `UNIQUE (mst) WHERE trang_thai <> 'da_xoa'`, để cùng doanh nghiệp đăng ký lại được. MST **giữ nguyên** ở hàng đã xoá: đó là dữ liệu đăng ký kinh doanh công khai của một *tổ chức*, hữu ích để phát hiện trùng lặp và gian lận.

**(d) `da_xoa` là trạng thái CUỐI và KHÔNG đăng nhập được.**
Không có ô chuyển nào rời khỏi `da_xoa` trong `CHUYEN_HOP_LE`. Cổng trạng thái ở `routes/auth.ts` chỉ cho `active` nên không phải sửa — **nhưng phải có test** khẳng định điều đó, vì "mặc định đã đúng" là thứ âm thầm hỏng khi ai đó nới cổng.

### 2.4 Điều KHÔNG giải quyết được bằng kỹ thuật
Các hàng `audit_log` **đã ghi** vẫn còn email thô, và theo đúng thiết kế thì không sửa được. Sau (a) thì vết thương ngừng chảy, nhưng phần cũ vẫn ở đó.

Hai hướng, **cần quyết định của con người, không phải của mã**:
- **Giữ lại**, dựa trên nghĩa vụ lưu trữ theo pháp luật (NĐ 123/2020 về hoá đơn điện tử, và nhu cầu chống gian lận). Rẻ, và nhiều khả năng hợp lệ.
- **Một migration ẩn danh hoá một lần**, có review, tắt trigger rồi bật lại trong cùng giao dịch.

⚠️ **Đây là câu hỏi PHÁP LÝ, không phải câu hỏi kỹ thuật.** Tôi không đủ thẩm quyền kết luận việc giữ lại có hợp NĐ 13/2023 hay không. Trước khi nhận khách trả phí, **phải hỏi người có chuyên môn pháp lý**. Điểm nhẹ nhõm: hiện chỉ có **một** tenant thật, nên khối lượng dữ liệu cũ gần như bằng không — sửa (a) ngay bây giờ thì vấn đề gần như không bao giờ lớn lên.

---

## 3. Hệ quả
- QĐ-13 (Resend) **bị thay thế**. Ưu điểm "dựng nhanh" không còn ý nghĩa khi SES đã sẵn 50.000/ngày, và trần 100/ngày là nhược điểm thật.
- Nợ "không xoá được tenant" chuyển từ **mâu thuẫn chưa có lời giải** sang **việc có thể thực thi** (U34f), trừ phần pháp lý ở §2.4.
- Thêm phụ thuộc mới `aws4fetch` — theo Hiến pháp, việc thêm phụ thuộc cần quyết định ở tầng phù hợp; ADR này chính là tầng đó.

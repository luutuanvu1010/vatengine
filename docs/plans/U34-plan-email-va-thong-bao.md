# U34 — Xác thực email khi đăng ký + báo admin + khai tử mật khẩu tạm

> Chốt 2026-07-22. Tài liệu này là **phương án đã duyệt**, chưa qua QA1 chi tiết cho từng đơn vị.
> Đọc cùng: `COMMERCIAL-LAYER-tinh-hinh.md` (§4 sổ quyết định), `.claude/rules/security.md`.

## 1. Vì sao có U34

U33 vừa mở cổng đăng ký cho người lạ. Ngay sau đó lộ ra ba lỗ hổng **vận hành** (không phải lỗi mã):

1. **Không ai báo cho admin** khi có hồ sơ mới. Kiểm chứng bằng mã: `routes/dangKy.ts` chỉ INSERT vào DB; `apps/api` không có thư viện gửi email nào; Cổng Admin không polling, không badge.
2. **Khách đăng ký xong không nhận được gì.** Không biết hệ thống đã nhận chưa, chờ bao lâu, hỏi ai.
3. **Email chưa từng được xác thực.** Ai cũng gõ được địa chỉ của người khác vào form.

Và một món nợ mức CAO đang treo sẵn: mật khẩu tạm 6 chữ số được thiết kế với **ba** ràng buộc bù ("thiếu một là hỏng cả lập luận"), mà QĐ-7 và QĐ-11 đã lấy mất hai — chỉ còn hạn 72h.

U34 giải quyết cả bốn bằng **một** hạ tầng: đường email.

## 2. Quyết định đã chốt (chủ dự án, 2026-07-22)

| Mã | Quyết định | Lý do |
|---|---|---|
| **QĐ-12** | **KHÔNG có nút duyệt bằng đường link trong email.** Thông báo chỉ chứa **deep link** mở hồ sơ trong Cổng Admin (đã sau Cloudflare Access); thao tác Duyệt vẫn là `POST` sau `requireSuperAdmin`. Nút inline Telegram (`callback_query`) là giai đoạn 2, làm sau khi giai đoạn 1 chạy ổn. | Link duyệt trong email là **thao tác GHI diễn đạt như câu đọc** — cùng lớp lỗi với sự cố Hyperdrive đã ghi trong sổ. Email client, Telegram, phần mềm diệt virus và bộ quét link doanh nghiệp **tự động fetch URL**; tenant sẽ được duyệt trước khi người đọc kịp mở thư. Thêm nữa URL chính là chìa khoá duy nhất: forward thư = trao quyền duyệt. |
| **QĐ-13 (ĐÃ BỊ THAY THẾ bởi QĐ-16 — xem ADR-0007)** | ~~Resend~~ | API gọi thẳng được từ Workers, dựng nhanh nhất. **Đã tra tài liệu chính thức 2026-07-22:** bậc miễn phí = 3.000 email/tháng **nhưng chặn 100 email/ngày**, 1 tên miền, lưu vết 30 ngày; bậc Pro $20/tháng = 50.000/tháng, bỏ trần ngày. SES rẻ hơn khi lượng lớn nhưng phải xác minh miền + xin thoát sandbox + ký SigV4 — để dành cho lúc thật sự cần. |
| **QĐ-14** | **Bỏ hẳn mật khẩu tạm 6 chữ số.** Duyệt xong thì gửi khách **link đặt mật khẩu dùng một lần, hạn 72h**. | Xoá luôn món nợ mức CAO thay vì đi cứu một lập luận đã mất 2/3 chân. Admin thôi phải nhìn thấy và đọc mật khẩu của khách. |
| **QĐ-15** | **Admin chỉ được báo SAU khi khách đã xác thực email.** | Nếu báo ngay lúc đăng ký, kênh Telegram/email của admin trở thành đích spam — chính cổng công khai vừa mở ra. Xác thực email là bộ lọc đặt trước người thật. |

## 3. Chuỗi trạng thái mới

```
đăng ký (Turnstile)
  → tenant `cho_xac_thuc_email`                      ← TRẠNG THÁI MỚI
  → email tới KHÁCH: link xác thực, 1 lần, hạn 24h
  → khách bấm link
  → tenant `cho_duyet`
  → BÁO ADMIN: Telegram + email, kèm deep link       ← QĐ-15: chỉ ở bước này
  → admin mở Cổng Admin, bấm Duyệt (POST, có Access)
  → tenant `active`
  → email tới KHÁCH: link đặt mật khẩu, 1 lần, hạn 72h
  → khách tự đặt mật khẩu → đăng nhập được
```

**Sửa `tenantStateMachine.ts`** — thêm hai ô vào `CHUYEN_HOP_LE`:
```
["cho_xac_thuc_email", "xac_thuc_email", "cho_duyet"]
["cho_xac_thuc_email", "tu_choi",        "tu_choi"]     // dọn hồ sơ chết
```
`cho_xac_thuc_email` **không** đăng nhập được (cổng trạng thái ở `routes/auth.ts` chỉ cho `active` — không phải sửa gì, nhưng **phải có test** khẳng định trạng thái mới cũng bị chặn, nếu không nó lọt qua vì mặc định).

## 4. Phân rã đơn vị

| Đơn vị | Nội dung | Phụ thuộc | Ước lượng |
|---|---|---|---|
| **U34a** | Webhook Telegram báo hồ sơ mới + deep link. Fail-silent. | không | nhỏ |
| **U34b** | Hạ tầng email: adapter `EmailTransport` + **SES v2 qua `aws4fetch`** + SPF/DKIM/DMARC + kiểm MX trước khi gửi | không | vừa |
| **U34c** | Xác thực email khi đăng ký: trạng thái mới + bảng token + trang xác thực | U34b | vừa |
| **U34d** | Email khi được duyệt + link đặt mật khẩu → **gỡ mật khẩu tạm 6 số** | U34b, U34c | vừa |
| **U34e** | Nút inline Telegram 1 chạm (`callback_query`) | U34a | nhỏ |
| **U34f** | Ẩn danh hoá tenant (`da_xoa`) + `maskSensitive` che email + UNIQUE một phần trên `mst` | không | vừa |

**U34a làm trước** vì nó không phụ thuộc email và giải quyết ngay nỗi đau lớn nhất ("có người đăng ký mà không ai biết"). Các bước sau đi theo thứ tự phụ thuộc.

## 5. Ràng buộc bắt buộc (không thương lượng)

### 5.1 Token phải được đối xử như mật khẩu
Token xác thực email và token đặt mật khẩu đều là **chìa khoá vào tài khoản**:
- sinh bằng `crypto.getRandomValues`, tối thiểu 32 byte;
- **lưu ở dạng băm** trong DB (đúng như `password_hash`) — rò DB không được thành rò quyền truy cập;
- **dùng một lần**: tiêu ngay khi dùng, trong cùng giao dịch với thao tác nó cho phép;
- có hạn (24h / 72h) và kiểm hạn **phía máy chủ**;
- so sánh theo thời gian hằng định.

### 5.2 Cổng gửi email PHẢI có chốt nhịp riêng
Endpoint gửi email theo yêu cầu là **vũ khí dội thư**: kẻ xấu nhập địa chỉ nạn nhân liên tục, hệ thống ta thay họ spam, và `tourdao.vn` vào danh sách đen.

Nghiêm trọng hơn vì **QĐ-13**: trần **100 email/ngày** của bậc miễn phí tự nó là đích tấn công — kích cạn hạn mức là **email đặt mật khẩu của khách thật cũng không gửi được**, và chuỗi onboard đứng im mà không báo lỗi rõ ràng.

Bắt buộc:
- **cooldown theo địa chỉ email** cho nút "gửi lại" (lưu `gui_lai_sau` trong DB, không dùng Durable Object — QĐ-11 đã gỡ hết);
- **trần cứng theo ngày ở tầng ứng dụng**, đặt THẤP HƠN trần nhà cung cấp, và khi chạm trần phải **ghi log cảnh báo rõ ràng** thay vì im lặng hỏng;
- ⚠️ **Rule rate-limit WAF ở tầng zone Cloudflare chuyển từ "nên có" sang ĐIỀU KIỆN BẮT BUỘC trước khi bật email.** Nợ này đang mở trong sổ.

### 5.3 Không rò thông tin
- Đăng ký với email đã tồn tại phải trả lời **giống hệt** email mới (chống dò tài khoản) — hợp đồng `da_ton_tai` hiện tại cần soát lại theo tiêu chí này khi làm U34c.
- Nội dung Telegram/email gửi admin **không** chứa mật khẩu, không chứa token; PII che bằng `maskSensitive` đã có sẵn.
- Webhook/email là nơi lưu vết **ngoài** tầm kiểm soát tenant — `security.md` cấm ghi dữ liệu nhạy cảm ra đó.

### 5.4 Thông báo hỏng KHÔNG được làm hỏng nghiệp vụ
Gửi Telegram và gửi email đều phải **fail-silent** đối với luồng chính: Telegram sập thì khách vẫn đăng ký được. Đây đúng lớp lỗi F9 đã gặp (một `catch` phụ trợ ném đè lên kết quả chính) — phải có test riêng cho nhánh này.

### 5.5 Cô lập nhà cung cấp
Mọi lời gọi ra Resend đi qua interface **`EmailTransport`** hoán đổi được, cùng khuôn mẫu `GdtTransport`. Đổi sang SES sau này chỉ sửa một chỗ. Không gọi `fetch()` tới Resend trong logic nghiệp vụ.

## 6. Bí mật cần nạp
`RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Nạp qua `wrangler secret put`, **không** khai ở `vars` (`security.md`). U34e thêm `TELEGRAM_WEBHOOK_SECRET`.

## 7. Điều CHƯA chốt — cần quyết khi tới nơi
- ~~**Hồ sơ không xác thực email trong 24h thì xử lý sao?**~~ ✅ **Đã chốt 22-07 (QĐ-18 / ADR-0007 §2):** chuyển sang `da_xoa` bằng `admin_xoa_tenant()` — ẩn danh hoá tại chỗ, không `DELETE`. Món nợ "không xoá được tenant" đã có lời giải.
- ⚠️ **Phần CÒN LẠI của món nợ đó là câu hỏi PHÁP LÝ, không phải kỹ thuật:** các hàng `audit_log` ĐÃ ghi vẫn còn email thô và theo thiết kế thì không sửa được. Giữ lại (dựa nghĩa vụ lưu trữ theo NĐ 123/2020) hay chạy một migration ẩn danh hoá một lần — **phải hỏi người có chuyên môn pháp lý** trước khi nhận khách trả phí. Xem ADR-0007 §2.4.
- **Tên miền gửi**: `vatengine.tourdao.vn` hay `mail.tourdao.vn`? Gửi từ tên miền con bảo vệ uy tín của tên miền gốc — nhưng cần xác nhận không đụng bản ghi DNS đang phục vụ Worker.
- Có gửi email cho khách khi bị **từ chối** không, và nội dung tới đâu.

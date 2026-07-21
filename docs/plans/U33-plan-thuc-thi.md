# U33 — Gỡ rate-limit tầng ứng dụng, thay bằng Cloudflare Turnstile

> Trạng thái: **⬜ KẾ HOẠCH.** Lập 2026-07-21 theo quyết định chủ dự án cùng ngày.
> Nhánh: `feat/u33-turnstile`, cắt từ trunk sau khi U20 đã merge + deploy.

---

## 1. Quyết định chủ dự án (2026-07-21)

> *"Tất cả rate limit (tường lửa) đều do lớp Proxied của Cloudflare làm. Trong lớp này chỉ cần tích hợp captcha từ Cloudflare là được."*

| | Quyết định | Ghi chú |
|---|---|---|
| `SignupLimiter` (theo **IP**) | **GỠ** | WAF làm đúng việc này và làm tốt hơn — thấy toàn cảnh lưu lượng, có dữ liệu danh tiếng IP |
| `LoginLimiter` (theo **TÀI KHOẢN**) | **GỠ** | ⚠️ Xem §2 — đã nêu rủi ro, chủ dự án chốt gỡ |
| Turnstile | **Đăng ký + Đăng nhập khách** | KHÔNG gắn cho Cổng Admin (đã sau Cloudflare Access) |

---

## 2. ⚠️ Hệ quả đã nêu và được chấp nhận — ghi để người sau không hiểu nhầm là bỏ sót

`LoginLimiter` khoá theo **tài khoản** (10 lần sai / 15 phút). WAF của Cloudflare giới hạn theo **IP**. Hai thứ này **không thay thế nhau**: một cuộc tấn công phân tán qua nhiều IP nhắm vào một tài khoản sẽ đi lọt hoàn toàn dưới giới hạn theo IP.

Mật khẩu **tạm** là **6 chữ số** — 10⁶ khả năng. U18 chấp nhận con số nhỏ đó nhờ **ba** điều kiện bù (`U18-plan` §103):

| # | Điều kiện bù | Sau U33 |
|---|---|---|
| 1 | Hết hạn 72 giờ | ✅ còn |
| 2 | Buộc đổi lần đầu | ❌ bỏ ở QĐ-7 |
| 3 | Rate-limit theo tài khoản | ❌ **bỏ ở U33** |

⇒ **Sau U33, mật khẩu tạm 6 số chỉ còn MỘT điều kiện bù: hạn 72 giờ.**

Turnstile chặn bớt **bot**, nhưng nó phân biệt *người với máy* — không ngăn được một người kiên nhẫn dò 6 chữ số của một tài khoản cụ thể trong cửa sổ 72h.

**Đây là đánh đổi chủ dự án chọn có ý thức sau khi được nêu rõ, không phải sơ suất.** Nếu sau này thấy cần siết lại, hai đường rẻ nhất: (a) đổi mật khẩu tạm sang chuỗi dài hơn (10 ký tự chữ+số ⇒ không gian lớn hơn ~10⁹ lần), hoặc (b) rút hạn 72h xuống ngắn hơn.

---

## 3. Thứ tự làm — Turnstile TRƯỚC, gỡ limiter SAU

**Bắt buộc theo thứ tự này.** Gỡ limiter rồi mới thêm Turnstile sẽ tạo một cửa sổ mà cổng ghi công khai duy nhất của hệ thống **không có lớp bảo vệ nào** ở tầng ứng dụng. Deploy cả hai trong **một lượt**.

---

## 4. Turnstile — phần việc thật, không chỉ bật trong dashboard

Token do widget sinh ra **phải được máy chủ xác minh**. Không xác minh thì kẻ tấn công gọi thẳng API và bỏ qua widget hoàn toàn.

**Xác minh (đã tra tài liệu 2026-07-21):**
- `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
- Tham số: `secret` (bắt buộc), `response` (bắt buộc — token), `remoteip` (tuỳ chọn), `idempotency_key` (tuỳ chọn)
- Phản hồi: `success`, `error-codes[]`, `challenge_ts`, `hostname`
- **Token dùng MỘT LẦN**, hiệu lực **300 giây**, tối đa 2048 ký tự
- Mã lỗi đáng xử riêng: `timeout-or-duplicate` (token cũ/đã dùng — người dùng nên thử lại), `invalid-input-response` (token rác)

**Client:** script `https://challenges.cloudflare.com/turnstile/v0/api.js`; đặt trong `<form>` thì tự sinh input ẩn tên **`cf-turnstile-response`**.

**🔴 CSP SẼ CHẶN — điểm dễ bỏ sót nhất.** Cả `apps/web/worker.ts` lẫn `apps/admin/worker.ts` đang đặt `script-src 'self'`. Turnstile nạp script và render iframe từ `challenges.cloudflare.com` ⇒ **bị chặn, hỏng câm** (widget không hiện, không lỗi rõ ràng). Phải nới CSP cho `apps/web`:
- `script-src 'self' https://challenges.cloudflare.com`
- `frame-src https://challenges.cloudflare.com`

**KHÔNG nới CSP của `apps/admin`** — Cổng Admin không dùng Turnstile, giữ bề mặt hẹp.

**Bí mật:** `TURNSTILE_SECRET_KEY` qua `wrangler secret put`. Site key là **công khai**, nhúng thẳng vào build qua `VITE_TURNSTILE_SITE_KEY`.

**Fail-closed hay fail-open?** → **FAIL-CLOSED**: thiếu `TURNSTILE_SECRET_KEY` ⇒ `/dang-ky` và `/auth/login` trả **503**, không phải cho qua. Sau khi gỡ limiter, Turnstile là lớp duy nhất còn lại ở tầng ứng dụng; fail-open nghĩa là một lần cấu hình sai sẽ âm thầm mở toang cổng ghi công khai. (Khác `SignupLimiter` vốn fail-open — khi đó nó chỉ là một trong nhiều lớp.)

---

## 5. Gỡ limiter — 21 file bị đụng

```
XOÁ:  apps/api/src/loginLimiter.ts, loginLimiterDO.ts
      apps/api/src/signupLimiter.ts, signupLimiterDO.ts
      apps/api/test/unit/{loginLimiter,signupLimiter}.test.ts
SỬA:  apps/api/src/routes/{auth,dangKy}.ts     bỏ lời gọi limiter
      apps/api/src/types.ts                    bỏ LoginLimiterClient/SignupLimiterClient khỏi AppDeps
      apps/api/src/index.ts                    bỏ export DO
      apps/api/wrangler.jsonc                  bỏ binding LOGIN_LIMITER/SIGNUP_LIMITER + migration tag
      apps/api/src/configClamp.ts              bỏ `dangky_max_moi_ip_gio` nếu không còn ai đọc
      apps/api/test/helpers.ts                 bỏ factory giả
      test/integration/{auth.hardening,dangKy,auth.doiMatKhau}.test.ts
```

⚠️ **Durable Object migration:** xoá một DO class cần khai `deleted_classes` trong `wrangler.jsonc`, không phải chỉ xoá binding. Bỏ qua bước này thì deploy sẽ lỗi.

⚠️ `cau_hinh_he_thong.dangky_max_moi_ip_gio` để lại trong DB cũng vô hại (không ai đọc nữa), nhưng nên xoá hàng để không ai tưởng nó còn tác dụng.

---

## 6. Test viết trước

1. `/dang-ky` **thiếu** `cf-turnstile-response` → **400**, KHÔNG tạo tenant.
2. Token sai (`invalid-input-response`) → 400, không tạo tenant.
3. Token đã dùng (`timeout-or-duplicate`) → 400 kèm mã riêng để UI bảo "thử lại".
4. Token hợp lệ → 201 như cũ.
5. 🔴 Thiếu `TURNSTILE_SECRET_KEY` → **503**, KHÔNG cho qua (fail-closed).
6. Tương tự (1)(4)(5) cho `/auth/login`.
7. Xác minh gửi đúng `secret` + `response` tới đúng endpoint (mock `fetch`).
8. 🔴 Không còn tham chiếu nào tới `LoginLimiter`/`SignupLimiter` trong `apps/api/src`.
9. Đăng nhập sai **20 lần liên tiếp** vẫn trả 401 (không còn khoá) — khẳng định hành vi ĐÃ ĐỔI là có chủ ý, không phải test cũ chết.
10. Frontend: form đăng ký/đăng nhập gửi kèm `cf-turnstile-response`; chưa có token → nút gửi vô hiệu.

---

## 7. Điều kiện đầu vào — cần chủ dự án cấp

- [ ] Tạo widget Turnstile: **Cloudflare dashboard → Turnstile → Add widget**, hostname `vatengine.tourdao.vn`. Chế độ **Managed** (Cloudflare tự quyết có đố hay không) là mặc định hợp lý.
- [ ] Đưa **Site Key** (công khai) và **Secret Key** — Secret Key đặt vào `packages/db/.dev.vars` như các khoá khác, tôi sẽ `wrangler secret put`.

---

## 8. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh; 10 test §6; **deploy Turnstile và gỡ limiter trong CÙNG một lượt**; smoke production: đăng ký không token → 400, đăng ký qua trình duyệt thật → 201; sổ quyết định `COMMERCIAL-LAYER-tinh-hinh.md` cập nhật QĐ-11 kèm hệ quả §2.

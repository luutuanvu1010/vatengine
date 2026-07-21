# U32 — Thiết kế: Đăng nhập liên kết Google (OIDC), backend + luồng, chuẩn SaaS

> **Trạng thái: THIẾT KẾ ĐỀ XUẤT** (2026-07-21) — chờ chủ dự án duyệt trước khi viết plan hiện thực (U32-plan) rồi code theo TDD.
>
> **Nguồn gốc:** nối tiếp [NGHIEN-CUU-dang-nhap-google-vneid.md](NGHIEN-CUU-dang-nhap-google-vneid.md). Đơn vị này CHỈ làm Google; VNeID tách nghiên cứu khả thi riêng.
>
> **Luật áp dụng:** `security.md` (bí mật, audit, không rò), `multi-tenant.md` (mọi truy vấn gắn `tenant_id`), `testing.md` (TDD, coverage ≥ 80%). **KHÔNG** đụng `gdt-adapter.md` (không gọi GDT).
>
> **Vị trí:** tầng xác thực người dùng SaaS (U8), song song đường `POST /auth/login` email+mật khẩu. **Không** thay thế đường cũ — thêm một đường phát hành CÙNG loại phiên.

---

## 1. Vấn đề & phạm vi

Hiện chỉ có đăng nhập email+mật khẩu (`apps/api/src/routes/auth.ts`). Thêm **"Đăng nhập với Google"** để: (a) giảm ma sát đăng nhập, (b) bỏ gánh nặng quản lý mật khẩu cho người dùng chọn Google. Google chỉ là **nguồn xác thực bên ngoài** — sau khi xác thực xong, hệ thống phát hành **đúng phiên nội bộ hiện có** (JWT HS256 + cookie HttpOnly), nên toàn bộ RLS/RBAC/CSRF không đổi.

**Trong phạm vi:** 2 route OIDC (redirect + callback), xác minh `id_token`, liên kết user theo email đã xác thực, phát hành phiên qua `signToken`+`setSessionCookie` có sẵn, secret Google, cột liên kết `google_sub`, audit, feature flag đăng ký-mới-qua-Google, test.

**Ngoài phạm vi:** VNeID (nghiên cứu riêng); UI nút bấm chi tiết (frontend U15 tiêu thụ, đơn vị này lo tới điểm API + luồng chuyển hướng); các nhà cung cấp OIDC khác (Facebook/Apple — mở rộng sau, thiết kế để dễ thêm nhưng không làm nay); đăng nhập lại tự động (không liên quan).

---

## 2. Quyết định đã chốt (chủ dự án, 2026-07-21)

| # | Quyết định | Chốt |
|---|---|---|
| 1 | Tạo tài khoản | **Cả hai, có cờ.** Mặc định `GOOGLE_ALLOW_SIGNUP=false` → chỉ liên kết user ĐÃ tồn tại + tenant `active`. Bật cờ → cho tạo tenant mới trạng thái `cho_duyet` (vẫn qua cổng duyệt U17). |
| 2 | Liên kết tài khoản | **Tự động theo email đã xác thực.** `email_verified=true` + email khớp `nguoi_dung` đã có → tự gắn `google_sub`, đăng nhập ngay. Không bắt bước liên kết thủ công. |
| 3 | Loại flow OIDC | **Authorization Code Flow** (không implicit) — code đổi token ở backend, `id_token` không lộ ra trình duyệt. |
| 4 | Nơi phát hành phiên | **Tái dùng nguyên `signToken` + `setSessionCookie`** — phiên Google giống hệt phiên mật khẩu, không nhánh phiên riêng. |

---

## 3. Kiến trúc & luồng (Authorization Code Flow)

```
Trình duyệt            apps/web (front-door)        apps/api               Google
   │  bấm "ĐN Google"        │                          │                     │
   ├────────────────────────>│  GET /api/auth/google    │                     │
   │                         ├─────────────────────────>│  tạo state+nonce    │
   │                         │                          │  lưu KV (TTL ngắn)  │
   │  302 → accounts.google  │<─────────────────────────┤  302 redirect       │
   ├──────────────────────────────────────────────────────────────────────────>│
   │  người dùng đồng ý, Google 302 về /api/auth/google/callback?code&state     │
   │                         │                          │                     │
   │                         ├─────────────────────────>│ verify state (KV)   │
   │                         │                          │ POST token endpoint ─┼──> đổi code
   │                         │                          │ verify id_token JWT  │    lấy id_token
   │                         │                          │  (JWKS, iss/aud/exp/ │
   │                         │                          │   nonce, email_verif)│
   │                         │                          │ tìm/tạo nguoi_dung   │
   │                         │                          │ signToken + cookie   │
   │  302 → /app (đã đăng nhập)                          │                     │
```

Mọi gọi ra Google qua `fetch()` của Worker + verify JWT bằng `crypto.subtle` (đúng năng lực đã dùng ở `password.ts`/`gdt-client`). **Không thư viện OIDC nặng.**

---

## 4. Endpoint (dưới `/auth`, mount ở `app.ts` cùng `authRoutes`)

Cả hai KHÔNG qua `requireTenant` (đây là đường phát hành phiên, xảy ra TRƯỚC khi biết tenant — giống `POST /auth/login`).

| Endpoint | Việc |
|---|---|
| `GET /auth/google` | Sinh `state` (chống CSRF) + `nonce` (chống replay), lưu vào **KV TTL ~10 phút** (hoặc cookie ký ngắn hạn). Redirect 302 tới Google `authorization_endpoint` với `client_id`, `redirect_uri`, `scope=openid email profile`, `state`, `nonce`, `access_type=online`, `prompt=select_account`. |
| `GET /auth/google/callback` | Nhận `code`+`state`. Kiểm `state` khớp KV (thiếu/sai → 400, xoá dùng-một-lần). Đổi `code`→`id_token` tại `token_endpoint`. Verify `id_token`. Tìm/tạo user. `setSessionCookie`. Redirect 302 về app. |

**Bỏ endpoint discovery cứng hoá:** đọc `authorization_endpoint`/`token_endpoint`/`jwks_uri` từ **document discovery** `https://accounts.google.com/.well-known/openid-configuration` (cache trong Worker/KV) thay vì hardcode URL — Google có thể đổi, tài liệu discovery là hợp đồng ổn định.

---

## 5. Xác minh `id_token` (CỔNG BẢO MẬT — không được bỏ bước nào)

`id_token` là JWT RS256. Trước khi tin bất kỳ claim nào, verify ĐỦ:

1. **Chữ ký** bằng khóa công khai Google (JWKS từ `jwks_uri`, cache theo `Cache-Control`/`kid`). Sai chữ ký → từ chối.
2. **`iss`** = `https://accounts.google.com` (hoặc `accounts.google.com`).
3. **`aud`** = đúng `GOOGLE_CLIENT_ID` của mình (chống token phát cho app khác).
4. **`exp`** chưa hết hạn; **`iat`** hợp lý.
5. **`nonce`** khớp `nonce` đã lưu ở bước redirect (chống replay).
6. **`email_verified === true`** — BẮT BUỘC. Không có/false → từ chối liên kết (chống mượn email chưa xác thực).

Chỉ sau khi qua đủ 6 bước mới dùng `email` (chuẩn hoá `trim().toLowerCase()` — ĐÚNG như đường login hiện tại, xem `auth.ts:88`) và `sub` (ID Google ổn định, lưu `google_sub`).

---

## 6. Tìm/tạo người dùng — trung tâm của multi-tenant

Login hiện tại tra user qua hàm SECURITY DEFINER `auth_lookup_user(email)` vì `nguoi_dung` bật **FORCE RLS** (SELECT thường thấy 0 hàng). Google callback cũng chạy TRƯỚC khi biết tenant → **phải đi qua cùng cơ chế**.

### 6a. Nhánh mặc định (`GOOGLE_ALLOW_SIGNUP=false`) — chỉ liên kết user đã duyệt

1. Tra `auth_lookup_user(email)` (tái dùng, KHÔNG viết đường tra mới).
2. Không có hàng → **từ chối** (redirect về trang login kèm mã lỗi thân thiện "email chưa có tài khoản"). Không tạo gì.
3. Có hàng nhưng `tenant_trang_thai !== 'active'` → **từ chối** (giống cổng trạng thái login hiện tại).
4. Có hàng + active → nếu `google_sub` NULL thì gắn `google_sub` (liên kết lần đầu, trong `withTenant` để thoả RLS ghi); nếu đã có thì kiểm khớp. Phát hành phiên.

### 6b. Nhánh bật cờ (`GOOGLE_ALLOW_SIGNUP=true`) — cho đăng ký mới

Không có user khớp email → tạo tenant mới trạng thái **`cho_duyet`** + user vai `quan_tri`, **tái dùng đúng đường ghi của `dangKy.ts`** (QĐ-1 của U17: `withTenant(UUID tự sinh)`, không thêm hàm BYPASSRLS). **KHÔNG cho đăng nhập ngay** — vẫn chờ admin duyệt (U18), đúng cổng `cho_duyet`. Vấn đề mở cần chốt ở plan: **MST** — `dangKy.ts` yêu cầu `mst`, mà Google không cung cấp MST → hoặc thu thập MST ở bước tiếp sau đăng nhập Google, hoặc cho MST tạm rỗng + bắt bổ sung trước khi duyệt. **Ghi nhận là điểm cần quyết ở plan.**

### 6c. Quyết định schema: lưu `google_sub` ở đâu

Thêm cột `google_sub text` (nullable, UNIQUE) trên `nguoi_dung`. Dùng `sub` (không phải email) làm khóa liên kết bền vững vì email Google có thể đổi; email chỉ dùng để **match lần đầu**.

⚠️ **Bài học migration `auth_lookup_user` (0009):** nếu muốn callback đọc `google_sub` qua hàm này, phải mở rộng `RETURNS TABLE` → buộc **DROP + CREATE** hàm (Postgres cấm đổi return type qua REPLACE, lỗi 42P13) → **mất sạch GRANT EXECUTE cho `vat_app`** ⇒ hỏng toàn bộ login production nếu quên cấp lại. Migration 0009 đã ghi lại đầy đủ nghi thức ownership + least-privilege phải lặp. **Nếu cần sửa hàm này, BẮT BUỘC theo đúng khuôn 0009.** Cân nhắc phương án tránh: tra `google_sub` bằng một hàm SECURITY DEFINER **riêng** (`auth_lookup_by_google_sub`) thay vì mở rộng hàm cũ → không đụng quyền đường login đang chạy. **Chốt phương án ở plan.**

---

## 7. Secret & cấu hình (security.md — không hardcode)

Khai báo trong `Env` (`apps/api/src/types.ts`) và `.dev.vars.example`:

- `GOOGLE_CLIENT_ID` — công khai được, nhưng để cùng chỗ cho gọn.
- `GOOGLE_CLIENT_SECRET` — **Workers Secret** (`wrangler secret put`), KHÔNG vào git/log.
- `GOOGLE_REDIRECT_URI` — URL callback tuyệt đối (khớp cấu hình trong Google Cloud Console).
- `GOOGLE_ALLOW_SIGNUP` — var wrangler (không nhạy cảm), mặc định `false` (QĐ-1).

Redirect URI phải đăng ký chính xác trong Google Cloud Console (OAuth consent screen + credentials). Ghi vào README bước tạo project.

---

## 8. Bảo mật (đối chiếu văn hoá `auth.ts`/`session.ts` hiện có)

- **`state`** bắt buộc, lưu server-side (KV) dùng-một-lần, TTL ngắn — chống CSRF trên bước callback.
- **`nonce`** trong `id_token` — chống replay.
- **`GOOGLE_CLIENT_SECRET`** chỉ ở backend; code đổi token ở server (Authorization Code Flow) nên token không qua trình duyệt.
- **Cookie phiên** giữ nguyên hợp đồng `session.ts`: HttpOnly, SameSite=Strict, Secure khi HTTPS. Không trả token trong body.
- **Audit** (`auditLog`, append-only): đăng nhập Google thành công / thất bại / liên kết `google_sub` lần đầu. **Không log `id_token`/`code`/`client_secret`** — mask (`security.md`).
- **Không rò tồn tại tài khoản:** thông điệp từ chối ở nhánh 6a bước 2/3 nên trung tính, không phân biệt "email chưa đăng ký" vs "chưa duyệt" ở mức lộ ra ngoài (cân nhắc UX ở plan — có thể chấp nhận lộ nhẹ hơn login mật khẩu vì Google đã xác thực email, nhưng mặc định giữ trung tính).
- **Rate-limit:** callback có thể tái dùng tinh thần limiter hiện có; bước redirect ít rủi ro. Chi tiết ngưỡng ở plan.

---

## 9. Kiểm thử (TDD)

**unit** (mock `fetch` Google + JWKS, PGlite):
- Verify `id_token` hợp lệ → qua; sai chữ ký / sai `aud` / `iss` sai / hết `exp` / `nonce` lệch / `email_verified=false` → mỗi ca từ chối (một test mỗi ca).
- `state` thiếu/sai/đã dùng → 400, không phát hành phiên.
- Nhánh 6a: email khớp user active → phát hành phiên + cookie đúng hợp đồng; email không có (cờ tắt) → từ chối, không tạo gì; tenant `cho_duyet` → từ chối.
- Nhánh 6b (cờ bật): email mới → tạo tenant `cho_duyet`, **không** cấp phiên ngay.
- Liên kết: user active chưa có `google_sub` → gắn đúng; `google_sub` đã khác → xử lý xung đột.
- Cách ly tenant: liên kết/tra không rò dữ liệu tenant khác.
- Audit ghi đúng kết quả; **assert không có `id_token`/`code`/secret trong bản ghi/log**.

**integration** (route thật, PGlite, role production non-superuser): đường ghi `google_sub` + đường tạo tenant mới chạy dưới FORCE RLS như thật.

**Không có contract test gọi Google thật** trong CI (cần tài khoản người thật + đồng ý) — verify JWKS bằng khóa test tự ký, mock discovery. Kiểm chứng đầu-cuối với Google thật là **thao tác thủ công một lần** khi thiết lập, ghi kết quả (giống probe `authenticate` U14).

Coverage ≥ 80% tầng nghiệp vụ.

---

## 10. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh; không lộ `client_secret`/`id_token`/`code` trong code/log; audit đủ; migration (nếu có) theo đúng khuôn quyền 0009; cập nhật `README` (tạo Google project + secret) + `.dev.vars.example`; commit nhỏ; **review chéo bằng subagent** (`security-reviewer` bắt buộc — đây là đường xác thực) trước khi coi xong.

---

## 11. Các điểm CẦN CHỦ DỰ ÁN / PLAN CHỐT (không giả định thầm)

1. **MST cho nhánh đăng ký mới qua Google (6b):** thu ở bước sau đăng nhập, hay cho tạm rỗng + bắt bổ sung trước duyệt? (§6b)
2. **Cách đọc `google_sub`:** mở rộng `auth_lookup_user` (theo khuôn 0009) hay thêm hàm riêng `auth_lookup_by_google_sub`? (§6c) — khuyến nghị hàm riêng để không đụng đường login đang chạy.
3. **Lưu `state`/`nonce`:** Workers KV (cần binding mới) hay cookie ký ngắn hạn (không cần binding)? Cân nhắc: KV sạch hơn nhưng thêm hạ tầng; cookie đơn giản hơn.
4. **Thông điệp từ chối** ở nhánh chưa-có-tài-khoản: trung tính hoàn toàn hay thân thiện hơn? (§8)

---

## 12. Giới hạn bằng chứng

- Luồng OIDC + verify `id_token`: dựa trên **chuẩn OpenID Connect ổn định** — độ tin cậy cao, nhưng URL/tham số cụ thể của Google phải **kiểm chứng lại bằng document discovery thật** khi code (không hardcode theo trí nhớ).
- Mọi tham chiếu mã dự án (`auth.ts`, `session.ts`, `auth_lookup_user`, `dangKy.ts`, `types.ts`, migration 0009): **[ĐÃ KIỂM CHỨNG]** đọc trực tiếp 2026-07-21.

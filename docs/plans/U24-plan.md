# Kế hoạch U24 — Quản lý thành viên nội bộ tenant (mời/đổi vai) + hạ tầng gửi email (AWS SES) + quên mật khẩu

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** File này chỉ là đặc tả + phân rã bước để duyệt; chưa có dòng code nào.
>
> Nguồn gốc: mục backlog `docs/BACKLOG-y-tuong-va-de-xuat.md` — *"[2026-07-16] Quản lý người dùng nội bộ tenant (tạo/mời/đổi vai) + hạ tầng gửi email"* (ưu tiên **Cao**). Yêu cầu chủ dự án, phiên Cowork 2026-07-16.
>
> Quyết định đã chốt (chủ dự án 2026-07-16, ghi trong backlog):
> - **Hạ tầng gửi email = AWS SES** (không cân nhắc dịch vụ khác). SES v2 REST + `aws4fetch` (SigV4) trên Workers. Hạn mức 50.000 email/24h (ngoài sandbox — xác nhận lại region+quota ở SES Console trước khi triển khai thật).
> - Làm **chung một lượt với "Quên mật khẩu"** (mục treo O3/A4) vì dùng chung hạ tầng email.
>
> Luật áp dụng: `multi-tenant.md` (mời thành viên gắn ĐÚNG tenant người mời; không cho xuyên-tenant), `security.md` (không hardcode bí mật, không log token/mật khẩu/nội dung email nhạy cảm, audit hành động mời/đổi vai), `testing.md` (TDD, coverage ≥80%). KHÔNG đụng `gdt-adapter.md` (U24 không gọi GDT).
>
> **Phân biệt với lớp Admin U18–U21** (đã đối chiếu trong backlog §"Đối chiếu"): U24 là **`quan_tri` của MỘT doanh nghiệp tự mời thêm người vào CHÍNH công ty mình** — KHÔNG trùng U18/U19 (chỉ super-admin/chủ phần mềm quản lý ở cấp tenant). Hai luồng độc lập, cùng cần làm.

---

## 1. Tiền đề đã kiểm chứng (đọc từ mã nguồn 2026-07-16 — KHÔNG suy đoán)

| Thành phần đã có | Sự thật (dẫn nguồn `file:line`) | Hệ quả cho U24 |
|---|---|---|
| Bảng `nguoi_dung` | `packages/db/src/schema/nguoiDung.ts` — cột `id, tenant_id(FK), email, password_hash(nullable), vai_tro(default 'ke_toan'), ngay_tao`. `email` **UNIQUE TOÀN CỤC** (`nguoi_dung_email_unique`). Bật **FORCE RLS** theo `tenant_id` (`tenantIsolationPolicy`). | Có sẵn chỗ chứa thành viên. Mời = INSERT `nguoi_dung` cùng `tenant_id`, `password_hash=NULL` (chờ đặt lần đầu). Email UNIQUE toàn cục ⇒ một email không thuộc 2 tenant → **cần xử lý va chạm rõ ràng** (409 khi mời email đã tồn tại). |
| RLS trên `nguoi_dung` | Migration `0001` — FORCE RLS; login đi qua hàm **SECURITY DEFINER** `auth_lookup_user(email)` vì login xảy ra TRƯỚC khi biết tenant. | **CRUD thành viên KHÁC login:** `quan_tri` đã có JWT mang `tenant_id` → chạy trong `withTenant(tenantId)` là ĐỦ (RLS chỉ chặn chéo tenant, trong-tenant vẫn thao tác được). **KHÔNG cần SECURITY DEFINER mới** cho list/create/update thành viên trong cùng tenant. *(Ngoại lệ: đặt-mật-khẩu-lần-đầu & quên-mật-khẩu xảy ra khi CHƯA đăng nhập → cần đường SECURITY DEFINER riêng như `auth_lookup_user`; xem §4C.)* |
| RBAC 3 vai | `apps/api/src/rbac.ts` — `ROLES=['ke_toan','ke_toan_truong','quan_tri']`, `requireRole(...)` gác 403. Nguồn chân lý DUY NHẤT của tập vai. | Quản lý thành viên chỉ `quan_tri`. Đổi vai chỉ được đặt giá trị trong `ROLES` (validate qua `isRole`). Backlog xác nhận: RBAC đã xây đủ nhưng **chưa tenant nào tạo được người thứ 2** để dùng 2 vai còn lại → U24 mở khóa giá trị này. |
| `PATCH /me` | `apps/api/src/routes/me.ts` — `quan_tri` sửa `ten/ghiChu` của TENANT, **KHÔNG đụng `vai_tro`** và không quản người dùng khác. `.strict()` khóa field lạ. | Khuôn route + audit (`cap_nhat_cau_hinh`, chi_tiet chỉ TÊN trường) để nhân bản cho route thành viên. U24 thêm route MỚI, không sửa `/me`. |
| Băm mật khẩu | `apps/api/src/password.ts` — `hashPassword`/`verifyPassword` PBKDF2 WebCrypto, hash tự mô tả số vòng. `resolvePbkdf2Iterations(env)`. | Đặt-mật-khẩu-lần-đầu & reset dùng lại `hashPassword` y hệt. Không viết lại. |
| Audit đăng nhập SaaS | `apps/api/src/routes/auth.ts` — đã ghi `hanh_dong='dang_nhap_saas'` (thành/bại), qua `withTenant`, `maskSensitive`. Khóa per-account (login limiter DO). | U24 thêm hành động audit MỚI: `moi_thanh_vien`, `doi_vai_tro`, `vo_hieu_thanh_vien`, `dat_mat_khau_lan_dau`, `yeu_cau_dat_lai_mat_khau`. Tái dùng `maskSensitive` (không log email/mật khẩu thô). |
| Hạ tầng email | `grep SES\|EMAIL\|aws4fetch\|send_email` trên `apps/api/src` + `wrangler.jsonc`: **KHÔNG có gì** — chưa tích hợp email. `wrangler.jsonc` mới có KV comment sẵn, chưa bật. | U24 **xây hạ tầng email TỪ ĐẦU** (SES). Đây là phần việc mới độc lập, nên tách thành package/module riêng có interface đổi được (giống nguyên tắc `GdtTransport`). |
| Nợ O3/A4 | `docs/plans/production-deploy.md:103` — O3: "A4 quên-mật-khẩu (email) còn treo"; reset-password qua email cũng là **kênh tự mở khóa** account-lockout (giảm rủi ro H-A.5b). | Làm chung email + quên-mật-khẩu ở U24 đóng luôn nợ O3/A4. |

**CHƯA KIỂM CHỨNG (phải xác minh trong bước hiện thực — KHÔNG chốt ở kế hoạch này):**
- Quota + region SES thật (chủ dự án nói 50.000/24h nhưng chưa tự kiểm từ AWS Console) → xác nhận lại SES Console "Account dashboard → Sending limits" ngay trước khi triển khai.
- Domain gửi (vd `mail.tourdao.vn`) đã verify DNS trong SES chưa (điều kiện HẠ TẦNG, không phải code) — phải xong trước khi test gửi thật.
- `aws4fetch` hoạt động đúng trên workerd runtime với endpoint SES v2 — cần một smoke test thật (gửi 1 email tới địa chỉ nội bộ) trước khi coi là chốt.

---

## 2. Vấn đề & mục tiêu

**Vấn đề:** hiện chỉ tạo được người dùng thứ 2/3 của một tenant bằng **SQL tay** (không có route `nguoi_dung`), và `PATCH /me` không đổi được vai. Hệ quả: RBAC 3 vai đã xây đầy đủ nhưng **chưa tenant thật nào dùng tới 2 vai còn lại**; không thể onboard 100.000 doanh nghiệp bằng SQL tay; thiếu luôn luồng "quên mật khẩu" vì cùng phụ thuộc hạ tầng email chưa có.

**Mục tiêu U24:** `quan_tri` của một doanh nghiệp **tự mời/đổi vai/vô hiệu hóa thành viên** trong CHÍNH công ty mình qua sản phẩm (không SQL tay); người được mời **đặt mật khẩu lần đầu qua email**; mọi người dùng có thể **quên mật khẩu → đặt lại qua email**. Xây hạ tầng gửi email SES tái dùng được.

**Ngoài phạm vi U24:**
- Admin xuyên-tenant/super-admin (U18–U21 — luồng riêng).
- Đăng nhập bằng username thay email; mô hình "công ty dịch vụ" đa tenant (mục backlog khác).
- Gói trả phí/hạn mức tải (mục backlog khác).

---

## 3. Tiêu chí nghiệm thu (Definition of Done cho U24)

Mỗi tiêu chí có test tự động phủ, toàn bộ xanh; `make lint` sạch; coverage tầng nghiệp vụ ≥80%; không lộ bí mật trong code/log; cập nhật tài liệu; commit nhỏ theo lát cắt.

1. **AC1 — Mời thành viên.** `POST /users` (chỉ `quan_tri`) tạo `nguoi_dung` cùng `tenant_id` người mời, `password_hash=NULL`, `vai_tro` ∈ ROLES (mặc định `ke_toan`), **gửi email link đặt mật khẩu lần đầu** (token dùng-một-lần, hết hạn). Mời email đã tồn tại (UNIQUE toàn cục) → `409` rõ ràng, không rò tenant nào đang giữ email đó. Cách ly tenant tuyệt đối.
2. **AC2 — Danh sách thành viên.** `GET /users` (chỉ `quan_tri`) trả thành viên **trong tenant hiện tại** (email, vai_tro, ngay_tao, trạng thái kích hoạt) — KHÔNG trả `password_hash`. Không thấy người dùng tenant khác (RLS + lọc `tenant_id`).
3. **AC3 — Đổi vai.** `PATCH /users/:id` (chỉ `quan_tri`) đổi `vai_tro` sang giá trị trong ROLES. Chặn tự-hạ-vai người `quan_tri` cuối cùng của tenant (không để tenant mất hết quản trị). Đổi người ngoài tenant → `404`.
4. **AC4 — Vô hiệu hóa/xóa thành viên.** `quan_tri` vô hiệu hóa/xóa một thành viên (không tự xóa mình nếu là quản trị cuối). Người bị vô hiệu không đăng nhập được nữa.
5. **AC5 — Đặt mật khẩu lần đầu.** Đường công khai (chưa đăng nhập) nhận token mời hợp lệ → đặt `password_hash` qua `hashPassword`, kích hoạt tài khoản. Token hết hạn/đã dùng → từ chối rõ ràng. (Cần SECURITY DEFINER hẹp vì FORCE RLS — §4C.)
6. **AC6 — Quên & đặt lại mật khẩu.** `POST /auth/forgot` (công khai) gửi email link đặt lại (enumeration-neutral: phản hồi giống nhau dù email có thật hay không). `POST /auth/reset` đổi mật khẩu bằng token hợp lệ. Đặt lại thành công cũng **mở khóa** login-limiter (đóng nợ H-A.5b).
7. **AC7 — Hạ tầng email SES tái dùng được.** Một module/`packages/email` với interface `EmailSender` (đổi được — giống `GdtTransport`); hiện thực SES v2 REST + `aws4fetch` SigV4. Bí mật `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` nạp qua `wrangler secret put` (không hardcode). Có test đơn vị mock HTTP (không gọi AWS thật trong `make test`) + một smoke test tách riêng (gọi SES thật, như `make test-contract`).
8. **AC8 — Audit + bảo mật.** Mọi hành động nhạy cảm (mời, đổi vai, vô hiệu, đặt/đổi mật khẩu) ghi `audit_log` với `maskSensitive` — KHÔNG log email đầy đủ/mật khẩu/token thô. Token mời/reset lưu **băm** (không lưu token thô). Mọi query gắn `tenant_id` tường minh.

---

## 4. Thiết kế (khối chức năng — chi tiết chốt ở bước hiện thực)

### 4A. Package email (`packages/email`)
- Interface `EmailSender { send(msg): Promise<Result> }` — đổi được (SES hôm nay, provider khác mai sau) đúng tinh thần adapter của dự án.
- Hiện thực `SesEmailSender`: dựng request SES v2 (`POST https://email.<region>.amazonaws.com/v2/email/outbound-emails`), ký SigV4 bằng `aws4fetch`. Cùng nền WebCrypto mà `packages/crypto/src/envelope.ts` đã dùng → không xung đột runtime.
- Template email tối thiểu: (1) mời thành viên + link đặt mật khẩu, (2) đặt lại mật khẩu. Nội dung tiếng Việt, không nhúng bí mật.

### 4B. Token mời / reset (dùng-một-lần, có hạn)
- Bảng mới `user_token` (hoặc tái dùng KV có TTL — cân nhắc ở bước hiện thực): `id, tenant_id, nguoi_dung_id, loai(invite|reset), token_hash, het_han, da_dung`. **Lưu băm token**, không lưu thô (như session/CSRF chuẩn). Token thô chỉ nằm trong link email gửi đi.
- Sinh token: `crypto.getRandomValues` → base64url; băm SHA-256 lưu DB; so khớp bằng băm.

### 4C. Đường công khai qua SECURITY DEFINER hẹp
- Đặt-mật-khẩu-lần-đầu & reset xảy ra khi **chưa đăng nhập** → không có `tenant_id` trong context → gặp FORCE RLS. Nhân bản khuôn `auth_lookup_user`: một hàm SECURITY DEFINER **bề mặt hẹp** chỉ đủ để (a) xác thực token băm, (b) cập nhật đúng `password_hash` của đúng người dùng gắn token. KHÔNG mở SELECT rộng. Đây là điểm **bắt buộc security-review** (giống U18).

### 4D. API (`apps/api`, Hono)
- `POST /users`, `GET /users`, `PATCH /users/:id`, `DELETE /users/:id` (hoặc PATCH trạng thái) — tất cả `requireTenant` + `requireRole('quan_tri')`, chạy trong `withTenant`.
- `POST /users/:id/resend-invite` (tùy chọn) — gửi lại email mời.
- `POST /auth/forgot`, `POST /auth/reset`, `POST /auth/set-password` (đặt lần đầu) — công khai, qua đường SECURITY DEFINER §4C, enumeration-neutral.

### 4E. Frontend (`apps/web`)
- Màn "Quản lý thành viên" trong Cài đặt — **chỉ `quan_tri` thấy** (theo `apps/web/src/lib/rbac.ts`, ẩn/khóa đúng ma trận, không dựa server để giấu). Danh sách + nút mời (nhập email + chọn vai) + đổi vai + vô hiệu.
- Màn công khai "Đặt mật khẩu" / "Quên mật khẩu" / "Đặt lại mật khẩu" (ngoài luồng đăng nhập).

---

## 5. Phân rã bước (lát cắt con — mỗi lát tự chạy + tự test, theo vòng lặp U0–U12)

- **B1 — Package email + `SesEmailSender` (AC7).** Interface `EmailSender`; hiện thực SES v2 + `aws4fetch`; test đơn vị mock `fetch` (khẳng định URL/headers/SigV4 present, body đúng). Smoke test SES thật tách riêng (không chạy trong `make test`).
- **B2 — Token mời/reset (AC8 phần token, 4B).** Sinh + băm + lưu + xác thực + hết hạn/dùng-một-lần. Test thuần + integration DB.
- **B3 — `POST /users` + `GET /users` (AC1, AC2).** Producer email dùng B1; token dùng B2; audit `moi_thanh_vien`; xử lý va chạm email UNIQUE (409); cách ly tenant. Test route + cách ly chéo tenant.
- **B4 — `PATCH /users/:id` đổi vai + vô hiệu/xóa (AC3, AC4).** Chặn mất quản trị cuối cùng; validate `isRole`; audit. Test biên (tự-hạ-vai, người ngoài tenant → 404).
- **B5 — Đặt-mật-khẩu-lần-đầu (AC5) + đường SECURITY DEFINER hẹp (4C).** Migration hàm DEFINER; route công khai. **Bắt buộc security-review.** Test: token hợp lệ/hết hạn/đã dùng.
- **B6 — Quên & đặt lại mật khẩu (AC6).** `POST /auth/forgot` enumeration-neutral + `POST /auth/reset`; reset mở khóa login-limiter. Test enumeration-neutral (phản hồi đồng nhất) + mở khóa.
- **B7 — Frontend (AC quan_tri thấy).** Màn Quản lý thành viên + các màn công khai đặt/quên mật khẩu. Test component + ẩn/khóa theo vai.
- **B8 — Contract/soát khớp cuối (verification).** Rà toàn bộ AC; `make test`; **security-review subagent** cho B5/B6/đường DEFINER (đơn vị nhạy cảm bảo mật); smoke test SES thật (1 email); cập nhật `docs/BACKLOG` (đánh dấu đã lên kế hoạch → trỏ file này) + đóng nợ O3/A4 trong `production-deploy.md`.

---

## 6. Rủi ro & phụ thuộc

- **Email UNIQUE toàn cục** — một email chỉ thuộc 1 tenant. Mời email đã tồn tại ở tenant khác phải trả `409` mà **không rò** email đó đang ở đâu (chống dò xuyên-tenant). Đây là ràng buộc bảo mật, không phải lỗi UX đơn thuần.
- **Đường công khai + FORCE RLS** (B5/B6) là bề mặt tấn công nhạy cảm nhất của U24 — bắt buộc security-review, giữ SECURITY DEFINER hẹp tối đa (chỉ đủ cập nhật `password_hash` theo token), enumeration-neutral.
- **Điều kiện hạ tầng SES ngoài code** (verify DNS domain gửi + xác nhận quota/region) phải xong TRƯỚC khi smoke test thật — nếu chưa, B1 chỉ chạy được với mock, chưa "chốt" gửi thật (đúng Nguyên tắc bằng chứng: chưa gửi thật ⇒ chưa kiểm chứng).
- **Không log rò rỉ** — email, mật khẩu, token mời/reset đều nhạy cảm; mọi audit qua `maskSensitive`; token lưu băm.
- **Phụ thuộc secret** — `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` của IAM chỉ quyền `ses:SendEmail` (least-privilege), nạp qua `wrangler secret put` như `JWT_SECRET`/`TOKEN_KEK`.

---

## 7. Không làm (ranh giới rõ ràng)
- Không đụng luồng Admin xuyên-tenant U18–U21.
- Không thêm login bằng username, không mô hình đa-tenant "công ty dịch vụ".
- Không thêm gói trả phí/hạn mức tải.
- Không nới SECURITY DEFINER quá bề mặt tối thiểu; không lưu token thô; không log bí mật.

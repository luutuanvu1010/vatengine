# Kế hoạch U18 — Backend: Admin API (super-admin toàn hệ thống)

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** Đơn vị **thứ hai** của lớp thương mại. Thuần backend. Dựng **danh tính super-admin đứng NGOÀI mô hình tenant** + con đường **đọc/ghi xuyên-tenant có kiểm soát** để chủ phần mềm điều khiển toàn hệ thống. Đây là đơn vị **nhạy cảm bảo mật nhất** của cả dự án — mọi quyết định phải qua `security-reviewer`.
>
> Luật áp dụng: `security.md` (audit, bí mật, không rò), `multi-tenant.md` (cách ly — U18 là NGOẠI LỆ có kiểm soát duy nhất, phải chứng minh không phá cách ly cho token khách), `testing.md`. **KHÔNG** đụng GDT.

## 1. Vấn đề & phạm vi

Sau U17 có tenant `cho_duyet` nhưng **không ai duyệt được** — chưa có danh tính chủ, chưa có API quản trị. U18 dựng lớp đó. Chủ dự án đã chốt: **super-admin toàn hệ thống (vai MỚI, ngoài tenant)** + **Cổng Admin tách hoàn toàn** (token riêng).

**Trong phạm vi:**
- Bảng `quan_tri_he_thong` (danh tính chủ; email + password_hash; KHÔNG có `tenant_id`).
- `POST /admin/auth/login` → **token admin riêng** (khác secret/`aud` với token khách).
- Middleware `requireSuperAdmin` (chỉ chấp token admin; từ chối token khách).
- Con đường đọc/ghi **xuyên-tenant có kiểm soát** (chốt cơ chế — §4).
- Endpoint quản trị tenant: liệt kê + duyệt + khóa + mở + từ chối. Audit từng thao tác.
- (Nếu chọn luồng onboard tại đây) đặt/reset mật khẩu tài khoản khách sau duyệt.

**Ngoài phạm vi:** UI Cổng Admin (U19), quản lý gói trả phí, chỉnh sửa hóa đơn của khách (chủ **không** thao tác dữ liệu nghiệp vụ của khách trong v1.0 — chỉ quản trị vòng đời tài khoản; giảm bề mặt rủi ro & pháp lý).

## 2. Vì sao super-admin KHÔNG phải một giá trị trong `vai_tro`

`nguoi_dung.vai_tro` ∈ {`ke_toan`,`ke_toan_truong`,`quan_tri`} và mọi hàng `nguoi_dung` **buộc** `tenant_id` (FK notNull). Super-admin **không thuộc tenant nào** ⇒ không thể biểu diễn bằng một hàng `nguoi_dung`. Thêm `vai_tro='super_admin'` sẽ:
- Phá nguyên tắc "`ROLES` là 1 nguồn chân lý cho vai IN-tenant".
- Buộc gán một `tenant_id` giả → rò rỉ khái niệm, dễ nhầm RLS.

⇒ **Danh tính riêng, bảng riêng, token riêng, middleware riêng.** Đây là sự tách bạch chủ ↔ khách mà chủ dự án nhấn mạnh, thực thi ở tầng dữ liệu chứ không chỉ UI.

## 3. Bảng `quan_tri_he_thong` + token admin

**Migration** `0005_super_admin.sql`:
```
CREATE TABLE quan_tri_he_thong (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,          -- PBKDF2 (WebCrypto), như nguoi_dung
  ten text,
  trang_thai text NOT NULL DEFAULT 'active' CHECK (trang_thai IN ('active','khoa')),
  ngay_tao timestamptz NOT NULL DEFAULT now(),
  dang_nhap_cuoi timestamptz
);
-- KHÔNG bật tenant RLS (bảng này không thuộc trục tenant).
-- Bảo vệ: chỉ hàm SECURITY DEFINER hẹp mới đọc password_hash (giống auth_lookup_user).
```
- **Seed super-admin đầu tiên** qua migration/script có kiểm soát (không endpoint tạo super-admin công khai). Email + mật khẩu chủ dự án cấp; **không hardcode** — nạp qua secret/script.
- **Token admin:** JWT ký bằng **secret RIÊNG** `ADMIN_JWT_SECRET` (khác `JWT_SECRET` của khách) và claim `aud: "admin"`. TTL ngắn hơn (đề xuất 2h). ⇒ token khách (khác secret, `aud` khác) **không bao giờ** verify được ở middleware admin, và ngược lại. *Tách hoàn toàn ở tầng mật mã.*

`POST /admin/auth/login {email,password}` → tra `admin_lookup(email)` (SECURITY DEFINER hẹp) → verify PBKDF2 → phát token admin. Sai → 401 gọn. Audit `admin_login` / `admin_login_fail`.

## 4. Con đường xuyên-tenant CÓ KIỂM SOÁT — hai phương án (chốt khi code)

Super-admin cần **đọc mọi tenant** (liệt kê) và **ghi trạng thái** (duyệt/khóa). RLS hiện chặn xuyên tenant. Hai cách, cùng nguyên tắc "bề mặt hẹp, có audit, không mở toàn cục":

**Phương án A — Hàm SECURITY DEFINER chuyên dụng (đề xuất mặc định).**
Mỗi thao tác admin = một hàm DB owner-BYPASSRLS, bề mặt hẹp: `admin_liet_ke_tenant(loc)`, `admin_duyet_tenant(id)`, `admin_khoa_tenant(id)`, `admin_mo_tenant(id)`, `admin_tu_choi_tenant(id)`. Route admin gọi các hàm này. **Ưu:** khớp pattern đã có (`auth_lookup_user`); mỗi hàm là một "cửa" hẹp, dễ audit & review; không cấp role rộng cho app. **Nhược:** thêm vài hàm SQL.

**Phương án B — Role DB riêng BYPASSRLS + connection riêng.**
Một Postgres role `admin_app` có BYPASSRLS; route admin dùng connection riêng dưới role đó. **Ưu:** ít hàm SQL, linh hoạt query. **Nhược:** role BYPASSRLS là "khẩu súng đã lên đạn" — mọi bug ở route admin thành lỗ rò toàn cục; bề mặt rộng hơn, khó review hơn.

→ **Đề xuất A** (bề mặt hẹp, đúng tinh thần `multi-tenant.md` "RLS là phòng thủ, ngoại lệ phải hẹp"). Chốt cuối khi code + `security-reviewer` duyệt. **Bất biến kiểm bằng test:** dù chọn gì, **token khách vẫn KHÔNG xuyên tenant** (con đường xuyên-tenant chỉ mở sau `requireSuperAdmin`).

## 5. Endpoint quản trị (dưới `/admin`, sau `requireSuperAdmin`)

| Endpoint | Việc | Trả về |
|---|---|---|
| `GET /admin/tenants?trang_thai=&q=&limit=&offset=` | Liệt kê tenant + lọc trạng thái + tìm theo MST/email/tên | `{ items:[{id,ten,mst,email,trang_thai,goi_dich_vu,ngay_tao}], total }` |
| `GET /admin/tenants/:id` | Chi tiết 1 tenant (gồm người dùng, lần đăng bộ gần nhất — chỉ metadata, KHÔNG hóa đơn) | `{ … }` |
| `POST /admin/tenants/:id/duyet` | `cho_duyet` → `active`; kích hoạt luồng onboard (§6) | `{ ok }` |
| `POST /admin/tenants/:id/tu-choi` | `cho_duyet` → `tu_choi` (+ lý do tùy chọn) | `{ ok }` |
| `POST /admin/tenants/:id/khoa` | `active` → `khoa` (chặn login ngay) | `{ ok }` |
| `POST /admin/tenants/:id/mo-khoa` | `khoa` → `active` | `{ ok }` |
| `PATCH /admin/tenants/:id` | Sửa metadata: `ten`, email người dùng chính, `goi_dich_vu`. **KHÔNG** MST/hóa đơn | `{ ok }` |
| `POST /admin/tenants/:id/reset-mat-khau` | Sinh mật khẩu tạm 6 số mới + gửi email + `phai_doi_mat_khau=true` | `{ ok }` |
| `GET /admin/audit?limit=&offset=` | Xem audit gần đây (thao tác admin + login-fail khách) | `{ items, total }` |

**Chi tiết tenant (`GET /admin/tenants/:id`)** trả kèm **trạng thái token GDT** của mỗi tài khoản thuế: `{ con_han | sap_het | het_han, token_het_han }` — **suy từ `token_het_han` đã lưu (U14), KHÔNG BAO GIỜ trả token thô** (`security.md`). "Sắp hết" = còn < ngưỡng (vd 24h). Phục vụ U19/U21 nhắc khách kết nối lại. (Chốt 2026-07-15: chỉ trạng thái + thời điểm, không nút nhắc tự động ở v1.0.)

**Chuyển trạng thái hợp lệ (state machine, kiểm bằng test):**
```
cho_duyet ──duyet──▶ active ──khoa──▶ khoa ──mo-khoa──▶ active
    └────tu-choi───▶ tu_choi
```
Chuyển sai (vd `active`→`duyet`) → 409. Mọi thao tác → `auditLog` (ai=admin id, hành động, tenant đích, thời điểm). **Không** log bí mật.

## 6. Luồng onboard sau duyệt — CHỐT: hệ thống tự gửi email mật khẩu tạm 6 số (2026-07-15)

U17 tạo `nguoi_dung(password_hash=null)`. **Chủ dự án chốt:** khi Admin bấm **Duyệt**, hệ thống **tự sinh mật khẩu tạm 6 chữ số** + **tự gửi email** cho khách. Khách đăng nhập bằng mật khẩu đó, **buộc đổi mật khẩu ở lần đăng nhập đầu**.

**Luồng `POST /admin/tenants/:id/duyet`:**
1. `cho_duyet` → `active`.
2. Sinh mật khẩu tạm **6 chữ số** bằng **nguồn ngẫu nhiên mật mã** (`crypto.getRandomValues`, KHÔNG `Math.random`). Gán `password_hash = PBKDF2(mật khẩu tạm)` + cờ `phai_doi_mat_khau = true` (cột mới trên `nguoi_dung`).
3. Gửi email chứa mật khẩu tạm tới email khách.
4. Audit `duyet_tenant` — **KHÔNG log mật khẩu tạm** (chỉ ghi đã gửi email, tới địa chỉ nào — mask nếu cần).

**Cột mới (migration U18 hoặc gộp U17):** `nguoi_dung.phai_doi_mat_khau boolean NOT NULL DEFAULT false`. Login khách (U17/U20): nếu `phai_doi_mat_khau` → phát token nhưng frontend **buộc màn đổi mật khẩu** trước khi vào app; endpoint `POST /auth/doi-mat-khau` đặt mật khẩu mới + tắt cờ.

**Hạ tầng email (mới — cần chốt provider):** gửi email giao dịch cần một provider. Lựa chọn trên Cloudflare Workers:
- **Cloudflare Email Routing / MailChannels** (từng miễn phí qua Workers — *CHƯA KIỂM CHỨNG trạng thái hiện tại*, cần probe), hoặc
- **Provider ngoài** (Resend/SendGrid/Postmark) qua API — cần API key (secret `EMAIL_API_KEY`), cấu hình miền gửi (SPF/DKIM).

⚠️ **Nguyên tắc bằng chứng:** khả năng gửi email từ Workers + provider cụ thể là **hành vi hệ thống ngoài — CHƯA KIỂM CHỨNG**. Trước khi chốt provider vào kiến trúc, **probe gửi thật một email test + ghi kết quả**. Cô lập sau interface `EmailTransport` (giống `GdtTransport`) để hoán đổi provider. Không hardcode một provider trước khi kiểm chứng gửi được.

**Bảo mật mật khẩu tạm:** 6 chữ số = không gian 10^6 → yếu nếu để lâu. Ràng buộc: **hết hạn** (vd 72h — quá hạn phải yêu cầu Admin duyệt lại/gửi lại), **buộc đổi ngay lần đầu**, **rate-limit** thử đăng nhập (chống dò 6 số). Cân nhắc dùng nhiều hơn 6 số hoặc chữ+số nếu chủ chấp nhận — nhưng chủ đã chốt 6 số ⇒ **bù bằng hết hạn + buộc đổi + rate-limit login** (ghi rõ ràng buộc này là điều kiện bảo mật bắt buộc).

## 7. Kiểm thử (TDD) — nặng về ranh giới bảo mật

**unit:** state machine chuyển trạng thái (mọi cặp hợp lệ/không hợp lệ); tách token (verify token khách bằng secret admin → fail; ngược lại → fail).

**integration** (Hono + PGlite, role production):
- `POST /admin/auth/login` đúng/sai; token phát có `aud:"admin"`.
- `requireSuperAdmin`: **token khách bị từ chối** (401/403); thiếu token → 401.
- **Bất biến cách ly (bắt buộc):** một token **khách** gọi endpoint `/invoices` **vẫn chỉ thấy tenant mình** sau khi U18 mở con đường admin — tức con đường xuyên-tenant KHÔNG rò cho khách. Test rõ ràng ca này.
- `GET /admin/tenants` thấy **nhiều** tenant (xuyên tenant) — chỉ khi token admin.
- Duyệt: `cho_duyet`→`active`, sau đó khách login được (nối U17 §7). Từ chối/khóa/mở đúng máy trạng thái. Chuyển sai → 409.
- Mọi thao tác ghi audit đúng (ai/gì/tenant nào); không có bí mật trong audit.

Coverage ≥ 80% tầng nghiệp vụ.

## 8. File tạo/sửa (dự kiến)

```
packages/db/
├── migrations/0005_super_admin.sql                 # (MỚI) bảng quan_tri_he_thong + hàm admin_* (nếu PA A)
├── migrations/meta/…                               # (SỬA) snapshot
└── src/schema/quanTriHeThong.ts                    # (MỚI) schema Drizzle
apps/api/src/
├── admin/adminAuth.ts                              # (MỚI) signAdminToken/verify (secret+aud riêng)
├── admin/requireSuperAdmin.ts                      # (MỚI) middleware
├── routes/admin/auth.ts                            # (MỚI) POST /admin/auth/login
├── routes/admin/tenants.ts                         # (MỚI) liệt kê/duyệt/khóa/mở/từ chối
├── routes/admin/audit.ts                           # (MỚI) GET /admin/audit
└── app.ts                                          # (SỬA) mount /admin/*, ADMIN_JWT_SECRET
apps/api/test/
├── unit/adminStateMachine.test.ts                  # (MỚI)
├── unit/adminTokenIsolation.test.ts                # (MỚI)
└── integration/admin.route.test.ts                 # (MỚI) gồm bất biến cách ly khách
scripts/seed-super-admin.ts                          # (MỚI) seed chủ đầu tiên có kiểm soát
```

## 9. Secret mới

- `ADMIN_JWT_SECRET` — `wrangler secret put`, khác `JWT_SECRET`. Khai báo `.dev.vars.example`. **Không hardcode.**

## 10. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh; coverage giữ ngưỡng; **bất biến cách ly khách được test tường minh** (điều kiện xong bắt buộc); tách token khách/admin có test; audit đầy đủ; migration sạch; **hai review chéo: `security-reviewer` + một pass rà cách ly tenant** trước khi coi xong; commit nhỏ. **Điểm chuyển U19:** Admin API sẵn sàng cho Cổng Admin frontend tiêu thụ.

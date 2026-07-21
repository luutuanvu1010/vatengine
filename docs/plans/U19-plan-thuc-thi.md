# U19 — Kế hoạch thực thi (đối chiếu với U18 đã hiện thực)

> Nguồn: `docs/plans/U19-plan.md` (spec gốc, lập 2026-07-15 — **trước** khi U18 được hiện thực). File này ghi kết quả đối chiếu với Admin API thật và chốt các điểm spec gốc đã lỗi thời.
>
> Nhánh: `feat/u19-cong-admin`, cắt từ `feat/u18-admin-api` (U19 tiêu thụ API của U18, chưa merge vào trunk nên phải cắt từ đó).
> Ngày lập: 2026-07-21. Phụ thuộc cứng: PR #27 (U18).

---

## 0. Bốn điểm spec gốc đã lỗi thời

| # | Spec gốc nói | Thực tế U18 | Xử lý |
|---|---|---|---|
| **D1** | Nhận token admin → lưu ở kênh riêng → `Authorization: Bearer` | U18 phát **cookie HttpOnly** `vat_admin_session`; thân phản hồi login **không chứa token** | Frontend **không cầm token**. Dùng `credentials: "same-origin"`, đúng khuôn `apps/web/src/lib/apiClient.ts` sau ADR-0003 Amendment #1 |
| **D2** | "app riêng hay route `/admin`— chốt khi code" | Cookie `SameSite=Strict` chỉ đi khi SPA và API **cùng origin**; và front-door khách đã **chặn** `/api/admin/*` (U18) | **`apps/admin` Worker riêng là BẮT BUỘC**, không còn là lựa chọn. Xem §2 |
| **D3** | Duyệt → hệ thống gửi email mật khẩu tạm | QĐ-1: API trả `mat_khau_tam` **một lần** trong body | Màn hình mới: hiện mã một lần + nút sao chép + cảnh báo không hiện lại |
| **D4** | Sửa metadata gồm `email` | `admin_sua_metadata_tenant` chỉ nhận `ten`/`goi_dich_vu`/`ghi_chu` | UI **không** có ô sửa email |

---

## 1. Phạm vi

Mặt điều khiển để chủ dự án duyệt/khóa/mở/từ chối tenant và xem nhật ký quản trị — tiêu thụ Admin API (U18).

**Trong phạm vi:** app `apps/admin` (Worker + SPA); đăng nhập Admin riêng; guard phiên; danh sách tenant (lọc trạng thái, tìm, phân trang); 4 thao tác vòng đời + hộp thoại xác nhận; màn hiện mật khẩu tạm; chi tiết tenant; sửa metadata; reset mật khẩu; trang audit.

**NGOÀI phạm vi:** dashboard giám sát/KPI (**U21**); quản lý thành viên trong tenant (**U24**); trang Đăng ký phía khách (**U20**); xem/sửa hóa đơn khách (ranh giới pháp lý cứng — U18 không mở endpoint).

---

## 2. Kiến trúc — hai origin, hai hũ cookie

```
adminvatengine.tourdao.vn            vatengine.tourdao.vn
  └─ vat-admin (Worker MỚI)            └─ vat-web
       ├─ SPA admin (Static Assets)         ├─ SPA khách
       └─ proxy /api/* ─────┐               └─ proxy /api/* ─────┐
            CHỈ /api/admin/*│                  CHẶN /api/admin/* │
                            └────────► vat-api ◄─────────────────┘
                                   (service binding)
```

**Vì sao phải proxy chứ không gọi thẳng `vat-api`:** cookie `SameSite=Strict` do `apps/api` đặt chỉ được trình duyệt gửi kèm khi request **cùng origin** với trang. Cho SPA admin gọi thẳng một hostname khác ⇒ cookie không bao giờ được gửi ⇒ phiên hỏng. Đây đúng cái bẫy mà `apps/web/vite.config.ts` đã ghi chú cho môi trường dev (C7).

**Đối xứng bảo mật (mới, không có trong spec gốc):** front-door admin chỉ cho `/api/admin/*` đi qua và **chặn endpoint khách**. U18 đã chặn chiều ngược lại. Kết quả: hai origin không với sang miền của nhau được, ở cả hai hướng — cookie khách gửi tới origin admin cũng vô dụng vì đường tới `/invoices` bị đóng ngay tại front-door.

**Cloudflare Access** (QĐ-4/P5, nợ bàn giao từ U18): gắn cho `adminvatengine.tourdao.vn` lúc deploy. Là lớp **thêm**, không thay `requireSuperAdmin`.

---

## 3. File tạo/sửa

```
apps/admin/                                   (MỚI — Vite + React, khuôn apps/web)
├── package.json, tsconfig.json, index.html
├── vite.config.ts                            proxy /api → :8787 (dev same-origin, C7)
├── vitest.config.ts, wrangler.jsonc          route adminvatengine.tourdao.vn
├── worker.ts                                 front-door: CHỈ /api/admin/* + security header
├── src/main.tsx, src/app.tsx
├── src/lib/adminApiClient.ts                 credentials same-origin, KHÔNG cầm token
├── src/features/auth/admin-auth-context.tsx  phiên admin, tách hoàn toàn
├── src/features/auth/AdminLoginPage.tsx
├── src/features/tenants/TenantsPage.tsx      danh sách + lọc + tìm + thao tác
├── src/features/tenants/MatKhauTamDialog.tsx D3 — hiện một lần
├── src/features/tenants/TenantDetail.tsx
├── src/features/audit/AuditPage.tsx
└── src/styles/                               tái dùng tokens.css của apps/web
apps/admin/test/                              component + worker
package.json (gốc)                            (SỬA) thêm workspace nếu cần
```

---

## 4. Test viết trước (TDD)

**worker (front-door admin)**
1. `/api/admin/tenants` → proxy tới `vat-api` với path `/admin/tenants` (bóc `/api`).
2. 🔴 `/api/invoices`, `/api/me`, `/api/exports` → **404, KHÔNG chạm** API worker (đối xứng U18).
3. Security header đủ trên mọi phản hồi (asset, proxy, 404).

**component**
4. 🔴 Chưa đăng nhập → màn đăng nhập **Admin**, KHÔNG rơi vào login khách.
5. 🔴 `adminApiClient` **không** đọc/ghi `localStorage`, không gửi `Authorization` — phiên chỉ đi bằng cookie.
6. Nút hiện đúng theo trạng thái: `cho_duyet`→[Duyệt, Từ chối]; `active`→[Khóa]; `khoa`→[Mở khóa]; `tu_choi`→ chỉ xem.
7. Duyệt → gọi đúng endpoint → hiện `MatKhauTamDialog` với mã 6 số; đóng dialog rồi thì **không** lấy lại được.
8. 409 (ai đó vừa đổi trạng thái) → thông báo rõ, refetch danh sách.
9. 401 → về màn đăng nhập Admin.
10. 4 trạng thái UI (loading/rỗng/lỗi+thử lại/dữ liệu) trên danh sách và audit.
11. Lọc trạng thái + tìm → gọi API đúng tham số; mặc định mở tab **Chờ duyệt**.
12. D4 — form sửa metadata **không có** ô email.

---

## 5. Ràng buộc bắt buộc

- **R1** — Không cầm token ở JS. Không `localStorage`/`sessionStorage` cho phiên. (`security.md`: không bí mật ở client.)
- **R2** — Front-door admin chỉ mở `/api/admin/*`. Fail-closed: đường không khớp → 404.
- **R3** — Không hiển thị dữ liệu nghiệp vụ của khách. API không trả, UI cũng không có chỗ để hiện.
- **R4** — Mật khẩu tạm: hiện một lần, **không** ghi vào `localStorage`, **không** log, không đưa vào URL.
- **R5** — Nhận diện trực quan khác app khách (nhãn "KHU VỰC QUẢN TRỊ") để không thao tác nhầm ngữ cảnh.
- **R6** — Giờ VN (UTC+7), i18n tiếng Việt, `lang="vi"`, body 16px.

---

## 6. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh; **test tách phiên (#4, #5) và test đối xứng front-door (#2) là điều kiện xong bắt buộc**; thao tác khớp máy trạng thái U18; review chéo trước khi coi xong; commit nhỏ.

**Điểm chuyển:** chủ dự án duyệt được tenant bằng giao diện, không cần `curl`. Deploy một lượt cùng U18.

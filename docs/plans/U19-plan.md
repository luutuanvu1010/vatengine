# Kế hoạch U19 — Frontend: Cổng Admin tách biệt (`/admin`)

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** Đơn vị **thứ ba** của lớp thương mại. Thuần frontend, tiêu thụ **Admin API (U18)**. Hiện thực yêu cầu "vô cùng quan trọng" của chủ dự án: **giao diện đăng nhập Admin TÁCH BẠCH hoàn toàn khỏi khách**, và một giao diện Admin riêng để **điều khiển toàn bộ**.
>
> Luật áp dụng: `security.md` (không bí mật ở client, token tách), `testing.md`. **KHÔNG** đụng `gdt-adapter.md`, không gọi GDT, không thêm endpoint backend.

## 1. Vấn đề & phạm vi

U18 đã có Admin API nhưng **chưa có mặt điều khiển**. U19 dựng Cổng Admin. Chủ dự án chốt **"tách hoàn toàn: đường dẫn + đăng nhập riêng, token riêng"** ⇒ ranh giới phải rõ ở cả routing, shell UI, và lưu token.

**Trong phạm vi:**
- Màn **đăng nhập Admin riêng** (`/admin/dang-nhap`) — KHÔNG dùng lại `LoginPage` của khách.
- Store token admin **tách hoàn toàn** khỏi token khách (khác khóa lưu, khác context).
- Shell/layout Admin riêng (nhận diện trực quan khác app khách — tránh nhầm chủ ↔ khách).
- Bảng điều khiển tenant: danh sách + lọc trạng thái + tìm MST/email + nút Duyệt/Từ chối/Khóa/Mở.
- Trang xem audit gần đây.

**Ngoài phạm vi:** **dashboard giám sát** (tách sang **U21** — sức khỏe hệ thống, thống kê tăng trưởng, cảnh báo token; U19 chỉ quản lý thành viên + khung), xem/sửa **hóa đơn** của khách (U18 không expose — chủ không chạm dữ liệu nghiệp vụ khách v1.0), phân quyền nhiều cấp admin (một cấp super-admin v1.0), quản lý gói trả phí (v1.0 chỉ Free; cột `goi_dich_vu` sửa được để chuẩn bị).

## 1b. Quản lý thành viên — 4 năng lực (chốt chủ dự án 2026-07-15)

Chủ dự án chốt Cổng Admin quản lý thành viên đầy đủ ở mức **metadata + vòng đời**, KHÔNG chạm hóa đơn:

| Năng lực | Nguồn API | Ghi chú |
|---|---|---|
| **Duyệt / khóa / mở / từ chối** | `POST /admin/tenants/:id/{duyet,khoa,mo-khoa,tu-choi}` (U18) | Vòng đời cơ bản — state machine U18. |
| **Gửi lại / đặt lại mật khẩu** | `POST /admin/tenants/:id/reset-mat-khau` (endpoint mới — bổ sung vào U18) | Sinh mật khẩu tạm 6 số mới + gửi email lại + đặt `phai_doi_mat_khau=true`. Audit; **không log mật khẩu**. |
| **Sửa metadata tenant** (tên DN, email liên hệ, gói) | `PATCH /admin/tenants/:id` (endpoint mới — bổ sung vào U18) | Chỉ `ten`, `email` người dùng chính, `goi_dich_vu`. **KHÔNG** sửa MST (khóa tự nhiên) hay dữ liệu hóa đơn. Audit từng thay đổi. |
| **Xem chi tiết hoạt động 1 tenant** (metadata) | `GET /admin/tenants/:id` (U18) | Người dùng của tenant, lịch sử `lan_dong_bo`, trạng thái token GDT (còn hạn/sắp/hết — KHÔNG hiện token). KHÔNG nội dung hóa đơn. |

> **Mức can thiệp chốt (2026-07-15):** Admin **sửa metadata + reset mật khẩu**, **tuyệt đối KHÔNG đọc/sửa hóa đơn**. Mọi thao tác ghi audit. Đây là ranh giới pháp lý cứng — khớp cam kết trang Cài đặt "không can thiệp trái phép dữ liệu khách".

> **Bổ sung ngược vào U18:** hai endpoint mới `POST /admin/tenants/:id/reset-mat-khau` và `PATCH /admin/tenants/:id` cần thêm vào U18 (backend) trước khi U19 tiêu thụ. Ghi rõ ở U18 §5 khi hiện thực.

## 2. Quyết định thiết kế: `apps/admin` riêng hay `/admin` trong `apps/web`? (chốt đầu U19)

| | App riêng `apps/admin` | Route `/admin` trong `apps/web` |
|---|---|---|
| Tách token | Tách vật lý (origin/bundle riêng) — **mạnh nhất** | Tách logic (context + khóa lưu riêng) — đủ nếu kỷ luật |
| Hạ tầng | Thêm 1 Vite app + 1 deploy target | Không thêm; cùng bundle |
| Rủi ro lẫn | Gần như 0 | Phải cẩn thận không rò token chéo qua code dùng chung |
| Bề mặt tấn công | Nhỏ, tách biệt | Chung bundle với app khách |

→ **Đề xuất `apps/admin` app riêng** — khớp tinh thần "tách hoàn toàn" của chủ dự án ở mức mạnh nhất (bundle + origin tách, không thể lẫn token qua bộ nhớ chung). Tái dùng **primitives/tokens/i18n** từ `apps/web` qua package chia sẻ hoặc copy có kiểm soát. *Đánh đổi:* thêm hạ tầng build/deploy — chấp nhận được cho ranh giới bảo mật quan trọng này. Chốt cuối khi code (nếu hạ tầng deploy là rào cản, fallback route `/admin` với context token tách — vẫn đạt yêu cầu tách token, kém phần tách vật lý).

## 2b. Hosting Cổng Admin — nơi host & phạm vi đọc (trả lời câu hỏi chủ dự án 2026-07-15)

**Host ở đâu:** cùng hệ sinh thái **Cloudflare** với phần còn lại (ADR-0001/0003, `production-deploy.md`). Cụ thể đề xuất:
- Cổng Admin = **Cloudflare Worker Static Assets riêng** (`vat-admin`), deploy trên **subdomain tách** khỏi app khách. App khách ở `vatengine.tourdao.vn`; **Admin chốt: `adminvatengine.tourdao.vn`** (2026-07-15) — **origin khác** app khách ⇒ tách vật lý token (cookie/bộ nhớ không chia sẻ giữa hai origin).
- Admin gọi **cùng `vat-api`** (Worker backend đã có) nhưng chỉ các endpoint `/admin/*` (U18), qua service binding same-origin giống app khách. **Không** có backend riêng cho Admin — chỉ một mặt UI khác + token khác.
- **Ẩn:** Cổng Admin **không** liên kết công khai từ app khách; chỉ chủ biết đường vào. Có thể thêm lớp chặn hạ tầng (Cloudflare Access / IP allowlist) trước `admin.*` nếu chủ muốn — **tùy chọn tăng cường, chốt khi deploy**.

**Có đọc được toàn bộ hệ thống không:** Có — **theo thiết kế, nhưng CÓ GIỚI HẠN CHỦ ĐÍCH.** Super-admin (U18) là danh tính toàn hệ thống, thấy **mọi tenant** để quản trị vòng đời tài khoản. NHƯNG phạm vi đọc bị **giới hạn ở METADATA quản trị**, KHÔNG phải dữ liệu nghiệp vụ:
- ✅ Thấy: danh sách tenant, MST, email, trạng thái, gói, ngày tạo, metadata lần đồng bộ, audit log.
- ❌ KHÔNG expose (U18 cố ý không mở endpoint): **nội dung hóa đơn của khách**, dòng hàng, token GDT, mật khẩu. Chủ **không** đọc/sửa dữ liệu kế toán của khách trong v1.0 — giảm bề mặt rủi ro pháp lý & lộ dữ liệu (khớp cam kết "không lưu/không can thiệp trái phép" ở trang pháp lý).
- Về mặt kỹ thuật super-admin **có khả năng** đọc mọi bảng (qua hàm SECURITY DEFINER), nhưng **chỉ những "cửa" hẹp được mở ra endpoint** mới dùng được. Muốn xem hóa đơn khách = phải mở endpoint mới có chủ đích + audit — không phải mặc định.

> Tóm tắt cho chủ: Cổng Admin host trên Cloudflare, subdomain riêng tách khỏi app khách; đọc được **toàn hệ thống ở mức quản trị tài khoản** (mọi tenant), nhưng **cố ý KHÔNG chạm nội dung hóa đơn của khách** ở v1.0.

## 3. Đăng nhập & phiên Admin (tách hoàn toàn)

- Màn `/admin/dang-nhap`: email + mật khẩu → `POST /admin/auth/login` → nhận **token admin** (`aud:"admin"`).
- Lưu token admin ở **kênh riêng** (nếu app riêng: bộ nhớ/khóa riêng của app admin; nếu route chung: context + khóa `localStorage` KHÁC hẳn khách, hoặc chỉ bộ nhớ). **Không** dùng chung `auth-context` của khách.
- `apiClient` admin đính `Authorization: Bearer <admin token>` cho **chỉ** endpoint `/admin/*`. 401 → về `/admin/dang-nhap`. Không bao giờ gửi token admin tới endpoint khách và ngược lại.
- Guard: mọi route `/admin/*` (trừ đăng nhập) yêu cầu token admin hợp lệ; thiếu → về đăng nhập Admin (KHÔNG về login khách).
- **Nhận diện trực quan khác biệt:** header/màu nền/nhãn "KHU VỰC QUẢN TRỊ" rõ ràng để chủ không nhầm đang ở app khách (giảm lỗi thao tác nhầm ngữ cảnh).

## 4. Bảng điều khiển tenant

**Danh sách** (`GET /admin/tenants`): bảng cột `Tên DN · MST · Email · Trạng thái · Gói · Ngày tạo · Thao tác`.
- **Bộ lọc trạng thái:** tab/nút nhanh `Chờ duyệt · Đang hoạt động · Đã khóa · Đã từ chối · Tất cả`. Mặc định mở **Chờ duyệt** (việc cần làm của chủ).
- **Tìm:** ô nhập → lọc theo MST/email/tên (query `q`).
- **Phân trang** (limit/offset — như pattern `apps/web`).
- Badge trạng thái màu (dùng `--brand`/token, không hardcode hex).

**Thao tác theo trạng thái (khớp state machine U18):**

| Trạng thái | Nút hiện |
|---|---|
| `cho_duyet` | **Duyệt** · **Từ chối** |
| `active` | **Khóa** |
| `khoa` | **Mở khóa** |
| `tu_choi` | (chỉ xem) |

- Mỗi thao tác → xác nhận (dialog) → gọi endpoint U18 → refetch. Lỗi → thông báo. Thành công → toast + cập nhật hàng.
- **Chi tiết tenant** (`GET /admin/tenants/:id`): panel/side sheet — thông tin DN, người dùng, lần đồng bộ gần nhất (metadata, KHÔNG hóa đơn).

## 5. Trang audit

`GET /admin/audit`: bảng thời gian — `Thời điểm (giờ VN) · Admin · Hành động · Tenant đích`. Chỉ đọc. Phục vụ chủ theo dõi thao tác quản trị + login-fail đáng ngờ của khách.

## 6. Trạng thái UI & khả dụng

- Mọi màn 4 trạng thái tường minh (loading skeleton / rỗng / lỗi + thử lại / dữ liệu) — nhất quán chuẩn U15.
- **Body font 16px** (nhất quán yêu cầu chủ — kế thừa token, xem U20 §font).
- i18n tiếng Việt. `lang="vi"`. Khả truy cập cơ bản (bàn phím, tương phản, ARIA cho bảng).
- Ngày giờ hiển thị **giờ VN (UTC+7)**.

## 7. Kiểm thử

**component/unit** (Vitest + Testing Library):
- Guard: chưa có token admin → màn đăng nhập Admin (KHÔNG rơi vào login khách).
- **Tách token:** helper store admin không đọc/ghi token khách (test không rò chéo).
- Bảng thao tác hiện đúng theo trạng thái (state machine §4).
- Gọi endpoint đúng params khi Duyệt/Khóa/… (mock apiClient).
- 4 trạng thái UI render đúng.

**E2E happy-path** (Playwright, mock API): đăng nhập Admin → thấy danh sách chờ duyệt → Duyệt 1 tenant → hàng chuyển `active`.

## 8. File tạo/sửa (dự kiến — theo phương án app riêng)

```
apps/admin/                                         # (MỚI) nếu chọn app riêng
├── src/main.tsx, app.tsx
├── src/routes/AdminRouter.tsx                       # /admin/dang-nhap + /admin/tenants + /admin/audit
├── src/features/auth/AdminLoginPage.tsx             # đăng nhập Admin RIÊNG
├── src/features/auth/admin-auth-context.tsx         # phiên admin tách hoàn toàn
├── src/features/tenants/TenantsPage.tsx             # danh sách + lọc + thao tác
├── src/features/tenants/TenantDetail.tsx
├── src/features/audit/AuditPage.tsx
├── src/lib/adminApiClient.ts                        # đính token admin, chỉ /admin/*
└── (tái dùng) tokens.css / primitives / i18n từ apps/web (package chung hoặc đồng bộ)
apps/admin/test/…                                    # component + Playwright
# HOẶC (fallback route chung): apps/web/src/routes/admin/* + admin-auth-context tách
```

## 9. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh (nhánh admin nối vào harness chung); **tách token có test tường minh** (điều kiện xong bắt buộc); guard đúng; state machine thao tác khớp U18; font 16px; i18n vi; review chéo (UI/RBAC + rà tách token) trước khi coi xong; commit nhỏ. **Điểm chuyển U20:** chủ đã có mặt điều khiển để duyệt khách đăng ký từ U20.

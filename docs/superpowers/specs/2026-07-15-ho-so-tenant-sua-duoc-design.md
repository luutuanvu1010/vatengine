# Thiết kế — Hồ sơ tenant sửa được + ánh xạ menu avatar

- **Ngày:** 2026-07-15
- **Trạng thái:** Đã duyệt thiết kế (chờ review spec)
- **Phạm vi:** DB migration + API (`GET/PATCH /me`) + Frontend (dropdown avatar + form Cài đặt)

## 1. Mục tiêu

Cho phép người dùng SaaS xem và **sửa** thông tin hồ sơ tổ chức trong "Cài đặt chung", lưu bền vững vào Postgres, và **ánh xạ hiển thị** ra menu avatar góc phải của Bảng Điều Khiển.

Bốn trường:

| Trường | Nguồn dữ liệu | Sửa được? | Ai sửa |
|---|---|---|---|
| Tên cá nhân / doanh nghiệp | `tenants.ten` (đã có) | ✅ | chỉ `quan_tri` |
| Email đăng nhập | `nguoi_dung.email` (client đã có sau đăng nhập) | ❌ chỉ hiển thị | — |
| Bản quyền | `tenants.ban_quyen` (MỚI, default `'Mặc định'`) | ❌ chỉ hiển thị (hệ thống cấp) | — |
| Ghi chú | `tenants.ghi_chu` (MỚI, nullable) | ✅ | chỉ `quan_tri` |

## 2. Ràng buộc (từ Hiến pháp + luật)

- **Không bịa dữ liệu**: `ban_quyen` là cột thật với default thật (`'Mặc định'`), không render hằng số ở tầng view. `email` không đưa vào `/me` (giữ nguyên quyết định cũ: client biết từ lúc đăng nhập).
- **Cách ly tenant** (`multi-tenant.md`): `tenant_id` LẤY TỪ TOKEN, không nhận từ client. Mọi truy vấn trong `withTenant` (RLS lớp 2) + `eq(tenants.id, tenantId)` (lớp 1). Phải có test cách ly A≠B.
- **Bảo mật** (`security.md`): PATCH ghi audit log ("đổi cấu hình tenant"). Không log giá trị nhạy cảm. Không đụng mật khẩu/token.
- **TDD** (`testing.md`): test đỏ→xanh trước code; coverage nghiệp vụ ≥ 80%.

## 3. Data & Migration

Migration Drizzle mới cho bảng `tenants`:

```
ALTER TABLE tenants ADD COLUMN ghi_chu text;                       -- nullable
ALTER TABLE tenants ADD COLUMN ban_quyen text NOT NULL DEFAULT 'Mặc định';
```

- Cập nhật `packages/db/src/schema/tenants.ts` thêm 2 cột tương ứng.
- Không đổi RLS policy (đã keyed theo `id`). Không đụng `nguoi_dung`.

## 4. API

### GET /me (mở rộng)
Response hiện tại `{ ten, mst, goiDichVu, role }` → thêm `banQuyen`, `ghiChu`:
```
{ ten, mst, goiDichVu, role, banQuyen, ghiChu }
```
Vẫn KHÔNG trả email/bí mật. Đọc-only, mọi vai (`requireTenant`).

### PATCH /me (mới)
- **Auth:** `requireTenant` + chặn vai: chỉ `quan_tri` qua; vai khác → **403** (không thân thiện hoá lỗi thành 200).
- **Body (Zod):**
  ```
  { ten?: string(trim, 1..200), ghiChu?: string(max 1000) | null }
  ```
  - Ít nhất một trường; từ chối (400) nếu body rỗng hoặc chứa khoá lạ (`mst`, `goiDichVu`, `banQuyen`, `email`…) — dùng Zod `.strict()`.
  - `ten` rỗng/whitespace → 400.
- **Ghi:** trong `withTenant(tenantId)`, `update(tenants).set({...}).where(eq(tenants.id, tenantId))`. Chỉ set trường có mặt.
- **Audit:** append 1 bản ghi audit "đổi cấu hình tenant" (không ghi giá trị nhạy cảm).
- **Response:** bản ghi sau cập nhật, cùng shape `GET /me`.

## 5. Frontend

### 5.1 Dropdown avatar (`AppLayout` header)
- Avatar chữ cái trở thành nút mở menu (`aria-haspopup`, `aria-expanded`).
- Menu hiện: **Tên**, **Email** (từ `useAuth().email`), **Bản quyền**, **Ghi chú** + nút **"Sửa hồ sơ"** (→ `/settings`) + **Đăng xuất** (dời nút logout vào đây).
- Đóng khi: bấm ngoài (overlay/click-away), phím Esc. Khớp mẫu a11y drawer đã có.
- Pill tên ở header vẫn giữ, phản ánh `me.ten` hiện hành.

### 5.2 Trang Cài đặt chung (`SettingsPage`)
- Với `quan_tri`: Tên + Ghi chú là **input sửa được**, có nút **Lưu** → `PATCH /me`.
  - Lưu thành công → cập nhật `me` trong `auth-context` (đề xuất: `refreshMe()` hoặc set state cục bộ) để pill header + dropdown + form đồng bộ ngay, không cần tải lại trang.
  - Trạng thái: đang lưu (disable), lỗi (Alert), thành công (thông báo nhẹ).
- Với vai khác: hiển thị chỉ-đọc (không có input/nút Lưu).
- Email + Bản quyền: luôn chỉ-đọc.

### 5.3 auth-context
- Bổ sung cách làm mới `me` sau PATCH (gọi lại `GET /me` hoặc nhận response PATCH và set trực tiếp). Giữ nguồn `me` là một.

## 6. Kiểm thử (TDD)

**API (`apps/api`, integration PGlite):**
- `PATCH /me` cập nhật `ten` + `ghiChu`, trả bản ghi mới.
- Vai `ke_toan` / `ke_toan_truong` → 403, KHÔNG ghi.
- Cách ly tenant: PATCH của A không đụng B.
- Body chứa khoá lạ (`mst`/`banQuyen`) → 400, KHÔNG ghi.
- `ten` rỗng → 400.
- `GET /me` trả `banQuyen` + `ghiChu`.
- Audit log được append đúng 1 bản ghi khi PATCH thành công.

**Web (`apps/web`):**
- `quan_tri`: sửa Tên/Ghi chú → bấm Lưu → gọi `PATCH /me` + `me` refresh (pill/dropdown đổi).
- Vai khác: form chỉ-đọc, không nút Lưu.
- Dropdown avatar: mở/đóng (click-away + Esc), hiện đủ 4 trường + có nút "Sửa hồ sơ" và "Đăng xuất".

## 7. Thứ tự triển khai (đơn vị công việc)

1. **U-a — DB:** migration + schema 2 cột. Test: schema/migration áp được.
2. **U-b — API:** `GET /me` mở rộng + `PATCH /me` (RBAC + Zod strict + audit + cách ly). Test integration.
3. **U-c — Web:** dropdown avatar + form sửa ở Cài đặt + refresh `me`. Test component.

Mỗi đơn vị: TDD, `make lint && make test` xanh, review chéo subagent (security-reviewer cho U-b), commit nhỏ.

## 8. Ngoài phạm vi (YAGNI)

- Không cho sửa email / MST / gói dịch vụ / bản quyền qua UI.
- Không làm trang quản trị cấp bản quyền (chỉ default).
- Không đụng flakiness `freshDb()` của `apps/api` (đơn vị riêng nếu cần).

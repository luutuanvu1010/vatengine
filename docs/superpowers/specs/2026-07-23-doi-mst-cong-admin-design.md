# Sửa mã số thuế trong Cổng Admin — Thiết kế

> Chốt 2026-07-23. Xuất phát từ một lỗi thật: khách đăng ký gõ nhầm MST, và phần mềm chỉ
> họ *"cập nhật MST ở Cài đặt chung"* — nơi MST chỉ là dòng hiển thị, không có ô nhập.
> Phần mềm đang bảo người dùng làm một việc không làm được.

## 1. Bối cảnh & ràng buộc đang chi phối

MST bị khoá **có chủ ý**, ba lớp:

| Lớp | Nội dung |
|---|---|
| DB | `tenants_mst_unique` — UNIQUE trên `tenants.mst` (migration 0006) |
| Admin API | `PATCH /admin/tenants/:id` dùng `.strict()`; gửi `mst` → **400** |
| Lý do (U23-D) | *"MST là khoá tự nhiên (1 MST ↔ 1 tenant); đổi được nó là đổi được danh tính pháp lý của một doanh nghiệp"* |

Đây là **quyết định kiến trúc U23-D**. Thiết kế này KHÔNG bẻ nó — nó mở một cửa hẹp, có
kiểm soát, **chỉ cho super-admin**, và giữ nguyên bất biến 1 MST ↔ 1 tenant.

### Dữ liệu thật (đo 2026-07-23, không phải trí nhớ)

Bộ nhớ dự án ghi *"1 MST, 1 người dùng"* — **không còn đúng**. Thực tế 6 tenant:

| MST | Trạng thái | TK thuế | Hoá đơn | Rơi vào ca |
|---|---|---|---|---|
| `4201969169` | active | 1 | **22.350** | ⛔ CHẶN — có hoá đơn |
| `1234567899` | active | 1 | 0 | ✅ đổi được, tự ngắt kết nối |
| `0302290383` | active | 0 | 0 | ✅ đổi được, không có gì để ngắt |
| `9999999*` ×3 | khoá | — | — | hồ sơ smoke cũ |

Chi tiết dễ sót: `tai_khoan_thue.username` được **tự gán = MST** lúc kết nối (U23-D2). Đổi
MST mà để nguyên tài khoản thuế thì kết nối trỏ vào một MST không còn tồn tại — **hỏng câm,
không ai báo**. Vì vậy đổi MST phải xoá luôn tài khoản thuế.

## 2. Quyết định đã chốt

| # | Quyết định | Vì sao |
|---|---|---|
| Đ-1 | **Chỉ super-admin sửa, trong Cổng Admin.** App khách không đụng | Giữ chốt con người trên một trường là danh tính pháp lý (U23-D) |
| Đ-2 | **Chặn cứng khi tenant đã có hoá đơn** | Đổi MST của tenant có 22.350 hoá đơn = bỏ rơi toàn bộ dữ liệu thật thành mồ côi. Không hoàn tác được |
| Đ-3 | **Có kết nối thuế (0 hoá đơn) → cho đổi + TỰ NGẮT** (xoá `tai_khoan_thue` của tenant) | `username = MST cũ`; giữ lại là để một kết nối chết trỏ vào MST không tồn tại |
| Đ-4 | **Cả đổi MST lẫn xoá tài khoản thuế nằm TRONG MỘT giao dịch** | Đổi được MST mà xoá tài khoản thuế hỏng ⇒ trạng thái nửa vời không cứu được |
| Đ-5 | **Không đụng `admin_sua_metadata_tenant`** — làm hàm SQL RIÊNG | Hàm đó cố ý không nhận `mst`; nhét vào là phá ranh giới nó dựng lên. Đổi MST đáng có audit riêng, đường riêng |
| Đ-6 | **Vá câu chỉ đường sai ở app khách** trong cùng lát | Câu *"cập nhật ở Cài đặt chung"* là lỗi độc lập, nhưng cùng gốc; sửa một lần cho gọn |

## 3. Các mảnh & interface

### 3.1 DB — migration mới `00NN_admin_doi_mst.sql`

Hàm `admin_doi_mst(p_id uuid, p_mst_moi text)` → `TABLE (id uuid, mst_cu text, mst_moi text, so_tk_thue_da_xoa int)`.

Khuôn mẫu SECURITY DEFINER giống `admin_*` ở 0011: `SET search_path = public`, owner
`admin_api`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE` cho `vat_app`/`app_user`.

Logic (plpgsql, một giao dịch):
```
1. SELECT mst, (đếm hoa_don của tenant) FOR UPDATE hàng tenant.
   - tenant không tồn tại → ném EXCEPTION 'khong_thay'.
2. Nếu mst_moi = mst_cu → trả về ngay, so_tk_thue_da_xoa = 0, KHÔNG xoá gì
   (đổi sang chính nó không được ngắt kết nối oan — đường lỗi 4).
3. Nếu số hoá đơn > 0 → ném EXCEPTION 'co_hoa_don' (Đ-2, chặn ở DB không tin mỗi UI).
4. DELETE FROM tai_khoan_thue WHERE tenant_id = p_id → đếm số hàng xoá (Đ-3).
5. UPDATE tenants SET mst = p_mst_moi WHERE id = p_id.
   - UNIQUE tenants_mst_unique vi phạm → SQLSTATE 23505 nổi lên nguyên vẹn (đường lỗi 1).
6. RETURN QUERY id, mst_cu, mst_moi, so_tk_thue_da_xoa.
```

Route bắt EXCEPTION theo `SQLSTATE`/`MESSAGE`: `khong_thay` → 404, `co_hoa_don` → 409,
`23505` → 409 `mst_da_ton_tai`.

⚠️ **Nghi thức migration** (bài học 0009/0011/0013): nếu tạo/đổi hàm cần `DROP`+`CREATE` thì
nhớ cấp lại `GRANT EXECUTE` — `DROP FUNCTION` xoá sạch quyền. Ở đây là hàm MỚI nên chỉ cần
nghi thức owner chuẩn. **PGlite chạy superuser** nên test chỉ kiểm được khai báo — hậu kiểm
quyền trên production sau `make migrate` là bắt buộc (giống Lát cắt 3).

### 3.2 API — `POST /admin/tenants/:id/doi-mst`

Trong `apps/api/src/routes/admin/tenants.ts`, sau `requireSuperAdmin` (đã gác toàn router).

- Body: `{ mst: string }`, Zod `.strict()`.
- Validate `MST_RE = /^\d{10}$|^\d{13}$/` (verbatim như `/dang-ky`) → 400 `mst_khong_hop_le`.
- `isUuid(id)` sai → 400 `bad_request`.
- Gọi `admin_doi_mst`, map lỗi:

| Kết quả | HTTP |
|---|---|
| OK | 200 `{ ok: true, mst_cu, mst_moi, so_tk_thue_da_xoa }` |
| `khong_thay` | 404 `{ error: "not_found" }` |
| `co_hoa_don` | 409 `{ error: "co_hoa_don_khong_doi_duoc" }` |
| `23505` | 409 `{ error: "mst_da_ton_tai" }` |
| dạng MST sai | 400 `{ error: "mst_khong_hop_le" }` |

Audit `doi_mst_tenant`, `chi_tiet: { cu: mst_cu, moi: mst_moi, tk_thue_da_xoa: n }` — MST là
định danh doanh nghiệp, KHÔNG phải dữ liệu cá nhân (QĐ-17 phân biệt), nên ghi cũ→mới là đúng
và cần: nhật ký phải trả lời được "đổi thành cái gì".

### 3.3 Cổng Admin — ô nhập MST trong chi tiết tenant

⚠️ **U19 còn 15%: panel chi tiết tenant CHƯA có** (`COMMERCIAL-LAYER-tinh-hinh.md` §7). Chỗ
đặt ô đổi MST phụ thuộc panel đó. Kế hoạch thực thi phải xác định: hoặc dựng panel tối
thiểu, hoặc gắn tạm vào `TenantsPage` như một hành động hàng. **Quyết định để lại cho bước
writing-plans sau khi đọc `ChiTietTenant` hiện có.**

Ràng buộc UI (theo `.claude/rules/ui.md`, áp cho `apps/admin` tương tự): dùng primitive +
token; nút "Đổi MST" **ẩn/mờ khi tenant đã có hoá đơn** (đọc từ `ChiTietTenant`); trước khi
gọi, `window.confirm` cảnh báo *"Đổi MST sẽ NGẮT mọi kết nối Tổng cục Thuế của doanh nghiệp
này. Khách phải kết nối lại bằng MST mới."*; hiện đủ trạng thái đang-gửi / lỗi / xong.

Client là UX, KHÔNG phải lớp bảo vệ — backend vẫn ép cả ba chốt (hoá đơn, dạng MST, trùng).

### 3.4 App khách — vá câu chỉ đường sai

`apps/web/src/features/taxAccounts/TaxAccountsPage.tsx`, nhánh `if (!mst)`:

Từ: *"Vui lòng cập nhật MST ở **Cài đặt chung** trước khi kết nối..."*
Thành: *"Vui lòng **liên hệ hỗ trợ** để cập nhật mã số thuế trước khi kết nối..."*

Không thêm ô nhập nào ở app khách (Đ-1). Chỉ thôi nói dối.

## 4. Bốn đường lỗi — bảng đối chiếu

| Tình huống | Xử lý | Chốt ở đâu |
|---|---|---|
| 1. Đổi sang MST đã có tenant khác | 409 `mst_da_ton_tai` | UNIQUE DB (không tin mỗi UI) |
| 2. Đổi khi tenant có hoá đơn | 409 `co_hoa_don_khong_doi_duoc` | Hàm DB đếm hoá đơn (Đ-2) |
| 3. MST gõ sai định dạng | 400 `mst_khong_hop_le` | Zod ở route |
| 4. Đổi MST trùng MST cũ | 200, không xoá kết nối | Nhánh sớm trong hàm DB (Đ-3 phản đề) |

## 5. Kiểm thử

- **DB (integration, PGlite):** đổi thành công + xoá đúng số `tai_khoan_thue`; chặn khi có
  hoá đơn (seed 1 hoá đơn → ném `co_hoa_don`); trùng MST tenant khác → 23505; đổi sang chính
  nó → không xoá kết nối; tenant không tồn tại → `khong_thay`; **hàm thuộc `admin_api`,
  PUBLIC không gọi được** (khai báo — production hậu kiểm mới chứng thi hành).
- **API (integration):** 5 mã lỗi ở bảng §3.2 trả đúng HTTP; audit ghi cũ→mới + số tk xoá;
  route sau `requireSuperAdmin` (token khách → 401).
- **Cổng Admin (component):** nút mờ khi có hoá đơn; `confirm` chặn khi bấm Hủy; đổi thành
  công cập nhật danh sách; 409 hiện đúng thông điệp.
- **App khách:** nhánh `!mst` hiện câu MỚI, không còn chữ "Cài đặt chung".
- **Nghiệm thu người thật:** trên `1234567899` (0 hoá đơn, có kết nối) — chủ dự án đổi MST
  trong Cổng Admin → kết nối thuế biến mất → khách kết nối lại bằng MST mới được. Và thử
  đổi `4201969169` → nút mờ / 409.

## 6. Ngoài phạm vi (YAGNI)

- Khách tự đổi MST — đã bác (Đ-1).
- Đổi MST cho tenant có hoá đơn (di trú dữ liệu sang MST mới) — không làm; nếu có ngày cần,
  đó là bài toán khác hẳn (gộp/tách doanh nghiệp), không phải sửa lỗi gõ nhầm.
- Lịch sử đổi MST hiển thị cho khách — audit đã ghi, chưa cần bề mặt.

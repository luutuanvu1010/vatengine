# 06-BINDING_MAP — Ánh xạ dữ liệu API → bề mặt (Frontend U15)

> **Vai trò của tài liệu:** đây là **đầu vào bắt buộc cho vai Design** (CLAUDE.md §3: "Đọc `06-BINDING_MAP` trước… Chỉ tạo mockup/token/đề xuất bề mặt bám vào binding map"). Nó khoá **mọi bề mặt UI phải truy được về dữ liệu và hợp đồng API đã tồn tại** — Design/Claude Design KHÔNG được tạo màn/không trường nào ngoài ánh xạ ở đây, KHÔNG quyết kiến trúc, KHÔNG chạm dữ liệu, KHÔNG tạo nguồn token thứ hai.
>
> **Trạng thái:** 🟢 Chính thức 2026-07-14 — **ADR-0003 đã Accepted** (React+Vite · gồm màn kết nối thuế · JWT in-memory) ⇒ đây là **nguồn chính thức cho vai Design / Claude Design**. Nguồn "làm gì/UX chi tiết": `docs/plans/U15-plan.md`. Tài liệu này **thay phần fence "màn login thuế" đã lỗi thời** trong U15-plan (U14 đã có backend).
>
> **Nguyên tắc:** mọi hợp đồng dưới đây đọc TỪ MÃ (không suy đoán) — nguồn chân lý ghi ở cột cuối. Khi backend đổi shape, sửa ở đây + `apiClient` (một chỗ).

---

## 1. Nguồn chân lý (đọc khi cần chi tiết)

| Chủ đề | File |
|---|---|
| Bộ lọc + phân trang | `packages/query/src/filters.ts` |
| Cột bảng hóa đơn | `packages/export/src/columns.ts` (`EXPORT_COLUMNS`) |
| Cột dòng hàng kết xuất (U23-B) | `packages/export/src/columns.ts` (`lineDetailRenderColumns`) |
| Tổng hợp | `packages/query/src/summarize.ts` |
| Vai trò RBAC | `apps/api/src/rbac.ts` (`ROLES`) |
| Đối chiếu | `packages/reconcile/src/types.ts` |
| Profile kết xuất kế toán | `packages/export/src/profiles/registry.ts` |
| Kết nối tài khoản thuế (U14) | `apps/api/src/routes/taxAccounts.ts` |
| Đăng nhập nội bộ | `apps/api/src/routes/auth.ts` |

---

## 2. Bề mặt (màn hình) — suy ra TỪ hợp đồng API

| # | Bề mặt | Nguồn dữ liệu (API) | RBAC thấy được |
|---|---|---|---|
| S0 | **Đăng nhập nội bộ** (email + mật khẩu SaaS) | `POST /auth/login` | công khai |
| S1 | **Danh sách hóa đơn** (lọc kỳ/chiều/nguồn/MST + phân trang) | `GET /invoices`, `GET /invoices/summary` | 3 vai |
| S2 | **Chi tiết hóa đơn** (header + bảng dòng hàng) | `GET /invoices/:id` | 3 vai |
| S3 | **Kết xuất & Convert** (xlsx/csv + profile kế toán; xlsx 2 sheet / csv 2 khối: hóa đơn + Chi tiết dòng hàng — U23-B) → tải file | `POST /exports`, `POST /exports/convert`, `GET /exports/:id` | ⚠️ chỉ `ke_toan_truong` + `quan_tri` |
| S4 | **Đối chiếu** (4 loại phát hiện + tóm tắt) | `GET /reconcile` | 3 vai |
| S5 | **Kết nối tài khoản thuế (GDT)** — đăng ký MST → ủy quyền → captcha → đăng nhập lưu token | `POST /tax-accounts`, `/:id/authorize`, `GET /:id/captcha`, `POST /:id/login` | ⚠️ chỉ `ke_toan_truong` + `quan_tri` |

## 3. Hợp đồng API đầy đủ (đã kiểm chứng từ mã)

> Mọi route (trừ `POST /auth/login`) chạy sau `requireTenant` (JWT nội bộ) — `tenant_id` LẤY TỪ TOKEN, **không bao giờ nhận từ client**.

| Method + path | Request | Response OK | Lỗi | RBAC |
|---|---|---|---|---|
| `POST /auth/login` | `{email, password}` | `200 {token}` (JWT HS256, `tenant_id`+`role`, 8h) | `400` sai định dạng · `401` sai thông tin (gộp, không phân biệt email/mật khẩu) | công khai |
| `GET /invoices` | query: bộ lọc chuẩn + `limit`(≤200,mđ 50) + `offset`(≥0) | `200 {rows[], total, limit, offset}` | `400` | 3 vai |
| `GET /invoices/summary` | query: bộ lọc chuẩn | `200 {byChieu:[{chieu,count,tongTcthue,tongTthue,tongTtbso}], total:{count,tongTcthue,tongTthue,tongTtbso}}` (tiền = chuỗi/null) | `400` | 3 vai |
| `GET /invoices/:id` | `:id` UUID | `200 {...header, dongHangHoa: DongHangHoaRow[]}` (dòng hàng sort theo stt; tiền/số = chuỗi) | `400` id sai · `404` | 3 vai |
| `POST /exports` | query: `format=xlsx\|csv` + bộ lọc | `201 {id, key, url}` — file có thêm sheet/khối "Chi tiết dòng hàng" (khóa `shdon`; U23-B) | `400` | `ke_toan_truong`,`quan_tri` (`ke_toan`→403) |
| `POST /exports/convert` | query: `profile` + `format` + bộ lọc | `201 {id, key, url, profile}` | `400` profile/format sai | `ke_toan_truong`,`quan_tri` |
| `GET /exports/:id` | `:id` (mã kết xuất) | `200` file stream (R2, giới hạn tenant) | `400` · `404` | `ke_toan_truong`,`quan_tri` |
| `GET /reconcile` | query: bộ lọc chuẩn | `200 {findings[], summary}` | `400` | 3 vai |
| **`POST /tax-accounts`** | `{username (MST), loai?: "chinh"\|"con"}` | `201 {id}` | `400` | `ke_toan_truong`,`quan_tri` |
| **`POST /tax-accounts/:id/authorize`** | `:id` UUID | `200 {ok:true}` (đặt `uy_quyen_luc`, ghi audit) | `400` · `404` (khác tenant) | `ke_toan_truong`,`quan_tri` |
| **`GET /tax-accounts/:id/captcha`** | `:id` UUID | `200 {key, content}` — `content` = **SVG markup thô** (không base64) | `400` | `ke_toan_truong`,`quan_tri` |
| **`POST /tax-accounts/:id/login`** | `{password, ckey, cvalue}` | `200 {ok:true, tokenHetHan}` (lưu token GDT mã hoá) | `400` · `401` GDT từ chối (sai captcha/mật khẩu — KHÔNG lưu) · `404` · **`409` chưa ủy quyền** | `ke_toan_truong`,`quan_tri` |

## 3b. Endpoint bổ sung U15 (A1/A2 — ĐÃ có trong mã, chủ dự án chuẩn thuận 2026-07-15)

> Xem `docs/plans/U15-buoc4-soat-khop-va-quyet-dinh.md` §4. Đọc-only, không lộ bí mật.

| Method + path | Request | Response OK | RBAC | Nguồn |
|---|---|---|---|---|
| `GET /me` | — (tenant từ token) | `200 {ten, mst, goiDichVu, role}` (hồ sơ tenant + vai; email KHÔNG trả — client biết từ login) | 3 vai | `apps/api/src/routes/me.ts` |
| `GET /tax-accounts` | — | `200 [{id, username, loai, uyQuyenLuc, tokenHetHan, ngayTao}]` (KHÔNG `tokenHienTai`/`secretRef`) | `ke_toan_truong`,`quan_tri` | `apps/api/src/routes/taxAccounts.ts` |
| `GET /tax-accounts/:id` | `:id` UUID | `200 {…}` · `404` khác tenant | `ke_toan_truong`,`quan_tri` | như trên |

Bề mặt UI bổ sung (ngoài S0–S5, từ brief §3 + quyết định): **Dashboard** (`/invoices/summary` + `/reconcile`) · **Cài đặt chung** (`/me` — bỏ địa chỉ, hiện MST; B6). S5 dùng A2 để khôi phục stepper + panel token. S0 "Ghi nhớ đăng nhập"/"Quên mật khẩu?" dựng sẵn chỗ, chờ backend A3/A4 (tách unit sau).

## 4. Ánh xạ trường dữ liệu (API → hiển thị)

### 4.1. Cột bảng hóa đơn = `EXPORT_COLUMNS` (nguồn chân lý — KHÔNG bịa cột mới)

`tdlap` Ngày lập · `khmshdon` Ký hiệu mẫu số · `khhdon` Ký hiệu HĐ · `shdon` Số HĐ · `nbmst` MST người bán · `nbten` Tên người bán · `nmmst` MST người mua · `nmten` Tên người mua · `tgtcthue` Tiền chưa thuế · `tgtthue` Tiền thuế · `tgtttbso` Tổng thanh toán · `dvtte` Tiền tệ · `ttxly` Trạng thái xử lý (mã) · `tthai` Trạng thái HĐ (mã) · `chieu` Chiều · `nguon` Nguồn.

### 4.2. Quy tắc hiển thị (BẮT BUỘC — sai là lỗi nghiêm trọng)

| Loại trường | Trường | Quy tắc |
|---|---|---|
| **Tiền** (chuỗi numeric, có thể >2^53) | `tgtcthue`,`tgtthue`,`tgtttbso`,`ttcktmai`,`tgia`, các `tong*` | Phân nhóm nghìn bằng **thao tác chuỗi/BigInt/decimal** — **CẤM** `Number()`/`parseFloat`. Căn phải. `null`→ trống. |
| **Thời khắc UTC** | `tdlap`, `ncnhat` | Đổi sang **giờ VN (UTC+7)**, format `dd/MM/yyyy` (giờ khi cần). `tdlap` quan sát luôn `17:00:00Z` = 00:00 giờ VN — **không lệch ngày**. |
| **Mã trạng thái** | `ttxly`, `tthai` | Ánh xạ nhãn **CHỈ mã đã kiểm chứng**; mã chưa probe → hiển thị **số + "(chưa rõ)"**. KHÔNG đoán nhãn (Nguyên tắc bằng chứng — đồng bộ với `@vat/reconcile statusCodes.ts` đang RỖNG có chủ đích). |
| **Enum** | `chieu` | `purchase`→"Mua vào", `sold`→"Bán ra" |
| **Enum** | `nguon` | `normal`→"HĐĐT thường", `sco`→"Máy tính tiền" |

### 4.3. Bộ lọc chuẩn (một tập dùng chung mọi màn danh sách/summary/reconcile/export)

`chieu`∈{purchase,sold} · `nguon`∈{normal,sco} · `tuNgay`/`denNgay` (`YYYY-MM-DD`) · `ttxly`(int) · `tthai`(int) · `nbmst` · `nmmst` · phân trang `limit`≤**200** (mđ 50), `offset`≥0. UX: nút nhanh Tháng/Quý/Năm/Khoảng ngày → quy ra `tuNgay/denNgay`; nhớ bộ lọc gần nhất.

### 4.4. Đối chiếu (`GET /reconcile` → `ReconcileReport`)

4 loại `Finding` + `summary {lechThue, thieuSoDauRa, huy, thayThe}` (4 con số):
- `lech_thue` — lệch số học header (`tgtcthue/ttcktmai/tgtthue/tgtttbso` + `lech` chuỗi). Cảnh báo trực quan.
- `thieu_so_dau_ra` — khoảng trống dãy `shdon` trong nhóm (`nbmst,khhdon,shdonThieu`). **Là NGHI NGỜ** → nhãn UI "**nghi thiếu**", KHÔNG khẳng định.
- `huy` / `thay_the` — theo `tthai/ttxly` (bảng mã production RỖNG → hiện mã, không đoán nhãn).

### 4.5. Convert kế toán (`POST /exports/convert`)

Profile khả dụng: **CHỈ `reference`** (đã kiểm chứng). `misa`/`fast`/`smartktsc` = **PENDING, CHƯA KIỂM CHỨNG → KHÔNG khả dụng** (`registry.ts`). UI: chỉ hiện profile khả dụng; profile pending → ẩn hoặc nêu rõ "sắp có", KHÔNG cho chọn.

## 5. Luồng S5 — Kết nối tài khoản thuế (GDT), mới nhờ U14

Trạng thái một `tax-account` và hành vi UI tương ứng:

1. **Đăng ký:** nhập MST (`username`) [+ loại chính/con] → `POST /tax-accounts` → có `id`.
2. **Ủy quyền (consent NĐ 13/2023):** người dùng xác nhận ủy quyền → `POST /:id/authorize`. **Chưa ủy quyền thì đăng nhập trả `409`** → UI phải chặn bước login tới khi ủy quyền xong.
3. **Lấy captcha:** `GET /:id/captcha` → `{key, content}`. `content` là **SVG thô** → render trực tiếp (`<img>`/inline SVG) cho người **tự gõ** (Hiến pháp — KHÔNG tự giải captcha).
4. **Đăng nhập GDT:** gửi `{password (mật khẩu thuế), ckey=key, cvalue=captcha đã gõ}` → `POST /:id/login`.
   - `200 {ok, tokenHetHan}` → đã lưu token (mã hoá); hiển thị hạn token.
   - `401` → sai captcha/mật khẩu → xin captcha mới, **không** lưu gì.
   - `409` → chưa ủy quyền (quay bước 2).
5. **Token hết hạn** (`tokenHetHan` < hiện tại): nhắc đăng nhập lại (lặp bước 3–4).

**Ràng buộc màn này:** KHÔNG log/hiển thị mật khẩu thuế; KHÔNG lưu mật khẩu ở client; captcha do người nhập; mật khẩu thuế chỉ đi thẳng lên `POST /:id/login`, không giữ lại.

## 6. Ma trận RBAC (nguồn: `apps/api/src/rbac.ts`)

`ke_toan` < `ke_toan_truong` < `quan_tri`.

| Hành động | `ke_toan` | `ke_toan_truong` | `quan_tri` |
|---|:---:|:---:|:---:|
| Đăng nhập, xem danh sách/chi tiết/summary (`/invoices*`) | ✅ | ✅ | ✅ |
| Đối chiếu (`/reconcile`) | ✅ | ✅ | ✅ |
| Kết xuất/Convert/Tải (`/exports*`) | ❌ 403 | ✅ | ✅ |
| Kết nối tài khoản thuế (`/tax-accounts*`) | ❌ 403 | ✅ | ✅ |

UI **phải phản chiếu** ma trận: `ke_toan` **không thấy** nút kết xuất/convert/kết-nối-thuế (ẩn/khoá, không dựa vào server chặn để giấu). Guard client là UX; server vẫn là biên tin cậy.

## 7. Ràng buộc cho Design (BẮT BUỘC — bám khi làm mockup)

- **Không bí mật ở client** (`security.md`): không MST/mật khẩu thuế trong mã; không log token; JWT nội bộ theo ADR-0003 #3 (in-memory mặc định).
- **Cách ly tenant** (`multi-tenant.md`): client KHÔNG là biên tin cậy — `tenant_id` luôn từ token; UI chỉ hiển thị thứ API trả trong phạm vi tenant; KHÔNG gửi/không tin `tenant_id` từ client.
- **Nguyên tắc bằng chứng:** nhãn `ttxly`/`tthai` chỉ cho mã đã kiểm chứng; mã lạ → "số (chưa rõ)".
- **4 trạng thái mỗi màn:** loading (skeleton) · rỗng (hướng dẫn) · lỗi (thông báo + thử lại) · dữ liệu. Không "màn trắng".
- **Ánh xạ mã lỗi → hành vi:** `401`→về đăng nhập · `403`→chặn + báo sai vai · `400`→lỗi nhập liệu · `404`→không tìm thấy · `409`→(login thuế) chưa ủy quyền.
- **A11y + i18n:** WCAG AA (điều hướng bàn phím, tương phản, ARIA bảng/trạng thái), `lang="vi"`, tiếng Việt trước.

## 8. NGOÀI phạm vi (fence — chờ đơn vị backend khác, Design KHÔNG dựng)

- ❌ Cổng Admin (quản lý tenant/người dùng/gói) — chưa có API.
- ❌ Nút "Đồng bộ ngay" (on-demand sync) — sync-worker chạy Cron/Queue, chưa có endpoint HTTP trigger.
- ❌ Màn lịch sử đồng bộ (`lan_dong_bo`) — chưa có route đọc.
- ❌ Dòng hàng chi tiết hóa đơn — `GET /invoices/:id` chỉ trả header (U6 #2).
- ❌ Webhook/pull cho phần mềm kế toán — đã hoãn.
- ❌ Gọi GDT trực tiếp từ client; thêm endpoint backend trong U15.

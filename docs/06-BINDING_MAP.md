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
| Cột file kết xuất phẳng | `packages/domain/src/flatExport.ts` (catalog 31 cột) → `packages/export/src/columns.ts` (`flatRenderColumns`) |
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
| S3 | **Kết xuất & Convert** (xlsx/csv + profile kế toán; MỘT sheet PHẲNG — mỗi mặt hàng một dòng kèm đủ ngữ cảnh hóa đơn) → tải file | `POST /exports`, `POST /exports/convert`, `GET /exports/:id` | ⚠️ chỉ `ke_toan_truong` + `quan_tri` |
| S4 | **Đối chiếu** (4 loại phát hiện + tóm tắt) — ⚠️ **ĐANG ẨN** khỏi SPA bằng cờ `SHOW_RECONCILE=false` (`apps/web/src/lib/featureFlags.ts`, quyết định 2026-07-22): không có mục menu, route tắt → `/reconcile` về Tổng quan. Mã màn + hợp đồng API giữ nguyên, bật lại bằng 1 hằng số. | `GET /reconcile` | 3 vai |
| S5 | **Kết nối tài khoản thuế (GDT)** — MST cố định (auto từ tenant) → ủy quyền → captcha + mật khẩu → đăng nhập lưu token; **ngắt kết nối** (U23-D) | `POST /tax-accounts`, `/:id/authorize`, `GET /:id/captcha`, `POST /:id/login`, `POST /:id/disconnect` | ⚠️ chỉ `ke_toan_truong` + `quan_tri` |

## 3. Hợp đồng API đầy đủ (đã kiểm chứng từ mã)

> Mọi route (trừ `POST /auth/login`) chạy sau `requireTenant` (JWT nội bộ) — `tenant_id` LẤY TỪ TOKEN, **không bao giờ nhận từ client**.

| Method + path | Request | Response OK | Lỗi | RBAC |
|---|---|---|---|---|
| `POST /auth/login` | `{email, password}` | `200 {token}` (JWT HS256, `tenant_id`+`role`, 8h) | `400` sai định dạng · `401` sai thông tin (gộp, không phân biệt email/mật khẩu) | công khai |
| `GET /invoices` | query: bộ lọc chuẩn + `limit`(≤200,mđ 50) + `offset`(≥0) | `200 {rows[], total, limit, offset}` | `400` | 3 vai |
| `GET /invoices/summary` | query: bộ lọc chuẩn | `200 {byChieu: ChieuSummary[], total: MoneyTotals}` — xem §4.6 (tiền = chuỗi/null) | `400` | 3 vai |
| `GET /invoices/:id` | `:id` UUID | `200 {...header, dongHangHoa: DongHangHoaRow[]}` (dòng hàng sort theo stt; tiền/số = chuỗi) | `400` id sai · `404` | 3 vai |
| `POST /exports` | query: `format=xlsx\|csv` + bộ lọc · body: `{ids?, cols?}` (`cols` = key cột theo catalog `@vat/domain`, allowlist ở server; vắng ⇒ 19 cột mặc định) | `201 {id, key, url}` — MỘT sheet phẳng, mỗi mặt hàng một dòng | `400` | `ke_toan_truong`,`quan_tri` (`ke_toan`→403) |
| `POST /exports/convert` | query: `profile` + `format` + bộ lọc | `201 {id, key, url, profile}` | `400` profile/format sai | `ke_toan_truong`,`quan_tri` |
| `GET /exports/:id` | `:id` (mã kết xuất) | `200` file stream (R2, giới hạn tenant) | `400` · `404` | `ke_toan_truong`,`quan_tri` |
| `GET /reconcile` | query: bộ lọc chuẩn | `200 {findings[], summary}` | `400` | 3 vai |
| **`POST /tax-accounts`** | `{loai?: "chinh"\|"con", username?}` — **chính**: username AUTO = `tenants.mst` (KHÔNG nhận từ body); **con** (sau cờ, mặc định TẮT) validate `startsWith(mst)` | `201 {id}` | `400` MST rỗng / con-tắt / tiền tố sai · **`409` đạt hạn mức** (getGioiHanTkThue, tạm=1; U23-D2) | `ke_toan_truong`,`quan_tri` |
| **`POST /tax-accounts/:id/authorize`** | `:id` UUID | `200 {ok:true}` (đặt `uy_quyen_luc`, ghi audit) | `400` · `404` (khác tenant) | `ke_toan_truong`,`quan_tri` |
| **`GET /tax-accounts/:id/captcha`** | `:id` UUID | `200 {key, content}` — `content` = **SVG markup thô** (không base64) | `400` | `ke_toan_truong`,`quan_tri` |
| **`POST /tax-accounts/:id/login`** | `{password, ckey, cvalue}` | `200 {ok:true, tokenHetHan}` (lưu token GDT mã hoá) | `400` · `401` GDT từ chối (sai captcha/mật khẩu — KHÔNG lưu) · `404` · **`409` chưa ủy quyền** | `ke_toan_truong`,`quan_tri` |
| **`POST /tax-accounts/:id/disconnect`** | `:id` UUID | `200 {ok:true}` — xóa token đã lưu (`tokenHienTai`+`tokenHetHan`→null), GIỮ bản ghi MST, audit `ngat_ket_noi_thue` (U23-D3) | `400` · `404` (khác tenant) | `ke_toan_truong`,`quan_tri` |

## 3b. Endpoint bổ sung U15 (A1/A2 — ĐÃ có trong mã, chủ dự án chuẩn thuận 2026-07-15)

> Xem `docs/plans/U15-buoc4-soat-khop-va-quyet-dinh.md` §4. Đọc-only, không lộ bí mật.

| Method + path | Request | Response OK | RBAC | Nguồn |
|---|---|---|---|---|
| `GET /me` | — (tenant từ token) | `200 {ten, mst, goiDichVu, role}` (hồ sơ tenant + vai; email KHÔNG trả — client biết từ login) | 3 vai | `apps/api/src/routes/me.ts` |
| `GET /tax-accounts` | — | `200 [{id, username, loai, uyQuyenLuc, tokenHetHan, ngayTao}]` (KHÔNG `tokenHienTai`/`secretRef`) | `ke_toan_truong`,`quan_tri` | `apps/api/src/routes/taxAccounts.ts` |
| `GET /tax-accounts/:id` | `:id` UUID | `200 {…}` · `404` khác tenant | `ke_toan_truong`,`quan_tri` | như trên |

## 3c. Endpoint bổ sung U35 (lưu vết + cảnh báo thay đổi trạng thái hóa đơn, 2026-07-27)

> Đọc/đánh dấu kho nội bộ `lich_su_thay_doi_hoa_don` (ghi bởi trigger DB) — KHÔNG endpoint nào gọi GDT.
>
> ⚠️ **Từ 2026-07-29 (U40) KHÔNG còn giao diện nào gọi hai endpoint này.** Nút "Hóa đơn vừa thay đổi" đã đổi ruột thành "Hóa đơn bị sửa ở kỳ khác", đọc `GET /invoices?biSua=true` và tính DẪN XUẤT (không còn khái niệm "đã đọc"). Lý do đổi: trigger `AFTER UPDATE` chỉ ghi khi trạng thái ĐỔI trong lúc hệ thống theo dõi, nên 16/17 hóa đơn mã 4 không bao giờ xuất hiện — nút báo "1" trong khi thực có 17. Endpoint và bảng **GIỮ NGUYÊN** làm dấu vết kiểm toán ("phát hiện thay đổi lúc nào"); cần màn lịch sử thì thêm lại lời gọi ở `apiClient`.

| Method + path | Request | Response OK | RBAC | Nguồn |
|---|---|---|---|---|
| `GET /invoices/changes` | query: `unread?` + `tuNgay?/denNgay?` (YYYY-MM-DD, giờ VN) + `limit`(≤200,mđ 50) + `offset`(≥0) | `200 {rows: [{id,hoaDonId,truong,giaTriCu,giaTriMoi,lanDongBoId,phatHienLuc,daDoc,khmshdon,khhdon,shdon,nbten}], total, limit, offset, unreadCount}` — `unreadCount` LUÔN của TOÀN tenant (không phụ thuộc filter) · `400` sai định dạng | 3 vai | `apps/api/src/routes/invoiceChanges.ts` |
| `POST /invoices/changes/mark-read` | `{ids?: string[]}` — thiếu/rỗng = đánh dấu TẤT CẢ chưa đọc; thân rỗng cũng hợp lệ (= mark-all) | `200 {ok:true, markedCount}` — id thuộc tenant khác trong `ids[]` → lặng lẽ không đổi (không 403/404, không rò tồn tại chéo tenant) · `400` JSON hỏng hoặc `ids[]` không phải UUID | 3 vai | như trên |

## 3d. Endpoint bổ sung U37b (tải hóa đơn GỐC cho một khách hàng, chia sẻ qua link công khai, 2026-07-29)

> Đọc **TỪ MÃ** (`apps/api/src/routes/goiChiaSe.ts`, `apps/api/src/routes/invoices.ts`), không chép từ kế hoạch.
>
> Bề mặt: nút **"Tải hóa đơn gốc"** trong thanh lọc trang *Danh sách hóa đơn*
> (`apps/web/src/features/invoices/TaiHoaDonGoc.tsx`), và ô **tìm khách hàng** thay ô nhập MST thô
> (`ChonKhachHang.tsx`). KHÔNG có màn riêng — dùng chung bộ lọc của trang (QĐ-B5).

| Method + path | Request | Response OK | Lỗi | RBAC | Nguồn |
|---|---|---|---|---|---|
| `GET /invoices/khach-hang` | — | `200 {items:[{nmmst,nmten,soHoaDon}], biCatBot}` — gộp theo MST, chỉ chiều bán ra, chỉ khách có ĐỦ MST+tên; sắp theo tên; trần 2.000 và báo `biCatBot` khi cắt | `401` | 3 vai | `routes/invoices.ts` |
| `POST /goi-chia-se` | `{nmmst, tuNgay, denNgay}` — Zod `.strict()`, **cả ba BẮT BUỘC** | `201 {id, soHoaDon, trangThai:"dang_tao"}` | `400` `bad_request` (thiếu trường / gửi kèm `ref`) · `400` `khoang_ngay_khong_hop_le` · `400` `khong_co_hoa_don` · `409` `thieu_tai_khoan_thue` · `503` `sync_unavailable` | `ke_toan_truong`,`quan_tri` | `routes/goiChiaSe.ts` |
| `GET /goi-chia-se` | — | `200 {items:[{id,nmmst,tuNgay,denNgay,soHoaDon,kichThuoc,trangThai,taoLuc,hetHanLuc,url}]}` — `url` chỉ khác `null` khi `san_sang` | `401` | 3 vai | như trên |
| `GET /goi-chia-se/:id` | `:id` UUID | `200 {id,trangThai,soHoaDon,tienDo:{tong,xong,khongCoHoSoGoc,loi,conCho},hetHanLuc,url}` — **THUẦN ĐỌC**, không đóng gói | `400` · `404` | 3 vai | như trên |
| `POST /goi-chia-se/:id/dong-goi` | `:id` UUID | `200 {id,trangThai:"san_sang",soHoaDon,soThieu,hetHanLuc,url}` | `409` `chua_du` (kèm `tienDo`) · `409` `khong_tai_duoc_hoa_don_nao` · `409` `dang_dong_goi` · `409` `trang_thai_khong_hop_le` · `404` | `ke_toan_truong`,`quan_tri` | như trên |
| `POST /goi-chia-se/:id/thu-hoi` | `:id` UUID | `200 {id, trangThai:"da_thu_hoi"}` — idempotent | `400` · `404` | **3 vai** (thu hồi là hành động GIẢM rủi ro) | như trên |

**Trạng thái gói** (`TRANG_THAI_GOI_CHIA_SE`, `packages/db/src/schema/goiChiaSe.ts`):
`dang_tao` → `dang_dong_goi` → `san_sang` → `da_thu_hoi`; nhánh lỗi `loi`.

**Ràng buộc bề mặt phải tôn trọng:**
- Nút mở khi và chỉ khi **đủ BA vế**: đã CHỌN khách hàng (không phải "ô tìm có chữ") ∧ chiều = bán ra
  ∧ có đủ `tuNgay`+`denNgay`. Thiếu vế nào báo đúng lý do vế đó.
- Trước khi phát hành phải có **cảnh báo link công khai + checkbox xác nhận** (QĐ-7).
- Thời hiệu nói **"khoảng 1 tuần"**, KHÔNG hứa mốc chính xác — Cloudflare chỉ bảo đảm xóa trong
  vòng 24h sau mốc. Khớp lifecycle `het-han-1-tuan` trên bucket `vat-chia-se`.
- `url` là đường dẫn CÔNG KHAI không cần đăng nhập ⇒ chỉ hiện khi `san_sang`, ẩn khi đã thu hồi.

Bề mặt UI bổ sung (ngoài S0–S5, từ brief §3 + quyết định): **Dashboard** (chỉ `GET /tax-accounts` — 1 dòng trạng thái kết nối GDT theo `tokenHetHan`, KHÔNG số tiền/đối chiếu; U23-C) · **Cài đặt chung** (`/me` — bỏ địa chỉ, hiện MST; B6). S5 dùng A2 để khôi phục stepper + panel token. S0 "Ghi nhớ đăng nhập"/"Quên mật khẩu?" dựng sẵn chỗ, chờ backend A3/A4 (tách unit sau).

## 4. Ánh xạ trường dữ liệu (API → hiển thị)

### 4.1. Cột bảng hóa đơn = `EXPORT_COLUMNS` (nguồn chân lý — KHÔNG bịa cột mới)

`tdlap` Ngày lập · `khmshdon` Ký hiệu mẫu số · `khhdon` Ký hiệu HĐ · `shdon` Số HĐ · `nbmst` MST người bán · `nbten` Tên người bán · `nmmst` MST người mua · `nmten` Tên người mua · `tgtcthue` Tiền chưa thuế · `tgtthue` Tiền thuế · `tgtttbso` Tổng thanh toán · `dvtte` Tiền tệ · `ttxly` Trạng thái xử lý (mã) · `tthai` Trạng thái HĐ (mã) · `chieu` Chiều · `nguon` Nguồn.

### 4.2. Quy tắc hiển thị (BẮT BUỘC — sai là lỗi nghiêm trọng)

| Loại trường | Trường | Quy tắc |
|---|---|---|
| **Tiền** (chuỗi numeric, có thể >2^53) | `tgtcthue`,`tgtthue`,`tgtttbso`,`ttcktmai`,`tgia`, các `tong*` | Phân nhóm nghìn bằng **thao tác chuỗi/BigInt/decimal** — **CẤM** `Number()`/`parseFloat`. Căn phải. `null`→ trống. |
| **Thời khắc UTC** | `tdlap`, `ncnhat` | Đổi sang **giờ VN (UTC+7)**, format `dd/MM/yyyy` (giờ khi cần). `tdlap` quan sát luôn `17:00:00Z` = 00:00 giờ VN — **không lệch ngày**. |
| **Mã trạng thái** | `tthai` | `1` Gốc · `2` Thay thế · `3` Điều chỉnh · `4` Bị thay thế · `5` Bị điều chỉnh — ĐÃ KIỂM CHỨNG 2026-07-28 (`docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md` §3). Nhãn lấy từ `@vat/domain` `nhanTthai()`, mã ngoài tập → **số + "(chưa rõ)"** + cảnh báo. Chip: chỉ mã `1` tô `--success-*`; `2`–`5` trung tính (QĐ-11). |
| **Mã trạng thái** | `ttxly` | **CHƯA KIỂM CHỨNG** — không đổi khi hóa đơn bị thay thế, bám theo họ hóa đơn/tiến trình xử lý (biên bản §4). Bảng nhãn GIỮ RỖNG ⇒ mọi mã hiển thị **số + "(chưa rõ)"**, trung tính. |
| **Enum** | `chieu` | `purchase`→"Mua vào", `sold`→"Bán ra" |
| **Enum** | `nguon` | `normal`→"HĐĐT thường", `sco`→"Máy tính tiền" |

### 4.3. Bộ lọc chuẩn (một tập dùng chung mọi màn danh sách/summary/reconcile/export)

`chieu`∈{purchase,sold} · `nguon`∈{normal,sco} · `tuNgay`/`denNgay` (`YYYY-MM-DD`) · `ttxly`(int) · `tthai`(int) · `nbmst` · `nmmst` · phân trang `limit`≤**200** (mđ 50), `offset`≥0. UX: nút nhanh Tháng/Quý/Năm/Khoảng ngày → quy ra `tuNgay/denNgay`; nhớ bộ lọc gần nhất.

### 4.4. Đối chiếu (`GET /reconcile` → `ReconcileReport`)

4 loại `Finding` + `summary {lechThue, thieuSoDauRa, huy, thayThe}` (4 con số):
- `lech_thue` — lệch số học header (`tgtcthue/ttcktmai/tgtthue/tgtttbso` + `lech` chuỗi). Cảnh báo trực quan.
- `thieu_so_dau_ra` — khoảng trống dãy `shdon` trong nhóm (`nbmst,khhdon,shdonThieu`). **Là NGHI NGỜ** → nhãn UI "**nghi thiếu**", KHÔNG khẳng định.
- `huy` / `thay_the` — theo `tthai`/`ttxly` (`packages/reconcile/src/statusCodes.ts`). Từ 2026-07-28: `thayThe.tthai = [4]`; `huy` và MỌI `ttxly` vẫn **RỖNG** (mã hủy pháp lý chưa từng xuất hiện trong dữ liệu, ý nghĩa `ttxly` chưa kiểm chứng) ⇒ `summary.huy` luôn 0. Reconcile CỐ Ý **không** áp loại trừ mã 4: nó không có phép cộng tiền nào, loại đi sẽ tạo "thiếu số đầu ra" GIẢ và giấu hóa đơn mã 4 bị lệch thuế.

### 4.6. Tổng hợp (`GET /invoices/summary` → `InvoiceSummary`)

> Ghi TỪ MÃ `packages/query/src/summarize.ts` (gương ở `apps/web/src/types/api.ts`), 2026-07-28.

`{ byChieu: ChieuSummary[], total: MoneyTotals }`. Mọi số tiền là **chuỗi** (numeric, có thể >2^53).

`MoneyTotals` — có ở CẢ `total` lẫn từng chiều:

| Trường | Nghĩa |
|---|---|
| `count` | Hóa đơn **khớp bộ lọc**. ⚠️ **KHÔNG** trừ hóa đơn bị thay thế (QĐ-7): trang Danh sách coi `count === 0` là "kỳ rỗng" và **tự gọi đồng bộ lên Tổng cục Thuế** — trừ đi sẽ tự kích hoạt đồng bộ oan cho kỳ chỉ chứa hóa đơn mã 4. |
| `countTinhTong` | Hóa đơn ĐƯỢC cộng vào tiền |
| `soLoaiKhoiTong` | Hóa đơn bị loại khỏi tiền (hiện chỉ `tthai=4`). `count = countTinhTong + soLoaiKhoiTong` |
| `tongTcthue` · `tongTthue` · `tongTtbso` | Tổng tiền **ĐÃ loại `tthai=4`**. Giữ **nullable** (không COALESCE) để `null` → `—` như trước |

`ChieuSummary extends MoneyTotals` — thêm `chieu` và khối "thay đổi". Khối này **CHỈ ở cấp chiều**, cố ý không có ở `total`: cộng số mua vào với bán ra là trộn hai nghiệp vụ ngược dấu.

| Trường | Nghĩa |
|---|---|
| `soDuocDieuChinh` · `soHdThayThe` · `soHdDieuChinh` | Số hóa đơn `tthai` = 5 · 2 · 3 |
| `soMaLa` | Hóa đơn mang mã ngoài tập 1–5 → giao diện **phải cảnh báo** (QĐ-6). `tthai` NULL KHÔNG tính vào đây |
| `thueDaLoai` · `ttbsoDaLoai` | Σ tiền của hóa đơn đã bị loại khỏi tổng — số **DƯƠNG**, `coalesce 0` (giao diện tự thêm dấu trừ `-` ASCII) |
| `thueThayTheDieuChinh` · `ttbsoThayTheDieuChinh` | Σ tiền hóa đơn `tthai` ∈ {2,3} lập trong kỳ — quy mô cần rà soát, ĐÃ nằm trong tổng |

**Thuế phải nộp** dẫn xuất hoàn toàn ở client, KHÔNG có trong hợp đồng:
`Δ = −thueDaLoai(sold) + thueDaLoai(purchase)` — hai chiều **ngược dấu**; tính bằng BigInt trên chuỗi (`@vat/domain` `truTienChuoi`).

**Tương thích ngược:** `queryKey` phía client không đổi sau deploy ⇒ tab đang mở giữ dữ liệu shape CŨ tới lần refetch. Mọi trường mới khai `?` ở client và phải chịu được `undefined`.

### 4.5. Convert kế toán (`POST /exports/convert`)

Profile khả dụng: **CHỈ `reference`** (đã kiểm chứng). `misa`/`fast`/`smartktsc` = **PENDING, CHƯA KIỂM CHỨNG → KHÔNG khả dụng** (`registry.ts`). UI: chỉ hiện profile khả dụng; profile pending → ẩn hoặc nêu rõ "sắp có", KHÔNG cho chọn.

## 5. Luồng S5 — Kết nối tài khoản thuế (GDT), mới nhờ U14

Trạng thái một `tax-account` và hành vi UI tương ứng:

1. **Kết nối (U23-D):** MST **cố định** theo doanh nghiệp (`/me`, read-only đã che) — KHÔNG nhập tay → `POST /tax-accounts` (không body) → backend auto username = `tenants.mst`, có `id`. Tài khoản con ẩn sau cờ (mặc định TẮT). Hạn mức đạt → `409`.
2. **Ủy quyền (consent NĐ 13/2023):** người dùng xác nhận ủy quyền → `POST /:id/authorize`. **Chưa ủy quyền thì đăng nhập trả `409`** → UI phải chặn bước login tới khi ủy quyền xong.
3. **Lấy captcha:** `GET /:id/captcha` → `{key, content}`. `content` là **SVG thô** → render trực tiếp (`<img>`/inline SVG) cho người **tự gõ** (Hiến pháp — KHÔNG tự giải captcha).
4. **Đăng nhập GDT:** gửi `{password (mật khẩu thuế), ckey=key, cvalue=captcha đã gõ}` → `POST /:id/login`.
   - `200 {ok, tokenHetHan}` → đã lưu token (mã hoá); hiển thị hạn token.
   - `401` → sai captcha/mật khẩu → xin captcha mới, **không** lưu gì.
   - `409` → chưa ủy quyền (quay bước 2).
5. **Token hết hạn** (`tokenHetHan` < hiện tại): nhắc đăng nhập lại (lặp bước 3–4).
6. **Ngắt kết nối (U23-D3):** `POST /:id/disconnect` (có bước xác nhận UI) → xóa token đã lưu, GIỮ bản ghi MST; quay về trạng thái chưa đăng nhập.

**Ràng buộc màn này:** KHÔNG log/hiển thị mật khẩu thuế; KHÔNG lưu mật khẩu ở client; captcha do người nhập; mật khẩu thuế chỉ đi thẳng lên `POST /:id/login`, không giữ lại.

## 6. Ma trận RBAC (nguồn: `apps/api/src/rbac.ts`)

`ke_toan` < `ke_toan_truong` < `quan_tri`.

| Hành động | `ke_toan` | `ke_toan_truong` | `quan_tri` |
|---|:---:|:---:|:---:|
| Đăng nhập, xem danh sách/chi tiết/summary (`/invoices*`) | ✅ | ✅ | ✅ |
| Đối chiếu (`/reconcile`) — API mở cho 3 vai, nhưng **màn S4 đang ẩn** với mọi vai (cờ `SHOW_RECONCILE`, không phải RBAC) | ✅ | ✅ | ✅ |
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

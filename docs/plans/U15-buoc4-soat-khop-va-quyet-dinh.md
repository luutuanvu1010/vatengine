# U15 Bước 4.1 — Kết quả soát khớp hợp đồng + Quyết định chủ dự án (2026-07-14)

> **Vai:** Code. **Cổng:** 4.1 (soát khớp bản export Claude Design ↔ `06-BINDING_MAP` + mã nguồn chân lý) — **ĐÃ QUA**, chủ dự án đã duyệt. Đây là bản ghi quyết định để 4.2/4.3 truy vết được. Mọi điểm dẫn `file:line` (đọc từ mã, không suy đoán — Nguyên tắc bằng chứng).

## 0. Nguyên liệu đã soát

7 màn export (`docs/design/claude-design/*.html` = app React nén gzip + 7 ảnh PNG). Bộ endpoint thật (đọc từ [`apps/api/src/app.ts`](../../apps/api/src/app.ts)): `POST /auth/login` · `GET /invoices|/summary|/:id` · `POST /exports|/convert` + `GET /exports/:id` · `GET /reconcile` · `POST /tax-accounts` + `/:id/authorize` + `GET /:id/captcha` + `POST /:id/login` · `GET /health`. **KHÔNG có** `/me`, `GET /tax-accounts`, `forgot-password`, refresh/remember.

## 1. Lệch đã phát hiện (BLOCKER — vi phạm hợp đồng)

| Mã | Màn | Lệch | Bằng chứng | Xử lý đã duyệt |
|---|---|---|---|---|
| B1 | S1 · Dashboard · S4 | Nhãn trạng thái tự bịa "Hóa đơn gốc/Đã thay thế/Đã hủy" cho `ttxly`/`tthai` | `columns.ts:27-28` (nhãn = "…(mã)", "KHÔNG nhãn tiếng Việt"); `statusCodes.ts:14-17` map RỖNG có chủ đích; BINDING_MAP §4.2 | Hiện **số mã + "(chưa rõ)"**; tách `ttxly` và `tthai` riêng, không gộp |
| B2 | S4 | "Nghi thiếu đầu ra" dùng logic bịa (% so kỳ trước) | `reconcile/types.ts:28-33` `SequenceGapFinding={nbmst,khhdon,shdonThieu}` = khoảng trống dãy số | Hiện `nbmst+khhdon+shdonThieu`; giữ nhãn "nghi thiếu/chưa khẳng định" |
| B3 | S4 | "Bị thay thế: thay bằng HĐ X" — liên kết bịa | `types.ts:36-42` `StatusFinding={hoaDonId,shdon,tthai,ttxly}` — không có trường HĐ thay thế | Chỉ hiện `shdon` + mã (chưa rõ) |
| B4 | S1 | Ô tìm "số HĐ, MST, tên đối tác" — filter bịa | `filters.ts:15-24` chỉ có chieu/nguon/tuNgay/denNgay/ttxly/tthai/nbmst/nmmst; nbmst/nmmst = `eq` | Thu về đúng ô MST bán/mua (khớp chính xác); bỏ tìm theo số HĐ/tên |
| B5 | S0 | "Quên mật khẩu?" + "Ghi nhớ đăng nhập" chưa có backend | `auth.ts:34-69` chỉ `POST /login→{token}` | **GIỮ** (quyết định dưới) → bổ sung backend A3/A4; S0 dựng sẵn, nối sau |
| B6 | Header + Cài đặt chung | Tên/địa chỉ/gói DN không nguồn API | Token chỉ có `tenantId+role+sub` (`auth.ts:61-64`); không `/me` | **GIỮ** màn → bổ sung `GET /me` (A1). Địa chỉ: **BỎ, hiện MST** |
| B7 | S5 | Panel "token còn hiệu lực" + stepper ✓ cần đọc trạng thái, không có GET | Không `GET /tax-accounts`/`:id`; `tokenHetHan` chỉ trả ngay sau login | **GIỮ** → bổ sung `GET /tax-accounts`+`/:id` (A2) |

## 2. Lệch nhẹ (M) + đã đạt (giữ)

- **M1** S1 thiếu cột `dvtte` (Tiền tệ) + `nguon` (Nguồn) — `columns.ts:26,30` có → bổ sung hiển thị.
- **M2** S4 khung "Lệch thuế" diễn giải sai: thực chất lệch số học tổng header `(tgtcthue−ttcktmai+tgtthue)≠tgtttbso` + trường `lech` (`types.ts:13-24`), KHÔNG có "thuế tính toán" → diễn đạt lại đúng cấu phần.
- **M3** Cả 7 màn dùng data demo cứng + toggle "Trạng thái màn (demo)" → viết lại nối API thật (TanStack Query), 4 trạng thái thật, bỏ toggle + data cứng.
- **Đạt:** S3 (reference "Khả dụng"; MISA/FAST/SMART "Sắp có" khóa — khớp `registry.ts`); Dashboard/S4 summary 4 số + 2 thẻ mua/bán (khớp `ReconcileSummary` + `summarizeInvoices.byChieu`); tiền dấu chấm nghìn/căn phải/không float; ngày dd/MM/yyyy + VN(UTC+7); enum Chiều; nút kỳ + "ghi nhớ bộ lọc"; phân trang; S5 stepper 4 bước + captcha SVG người tự gõ + MST che + mật khẩu không lưu client.
- **RBAC khi dịch:** ẩn với `ke_toan` các nút **Kết xuất & Convert**, **Kết nối tài khoản thuế** + 2 lối tắt Dashboard (`rbac.ts:19`; BINDING_MAP §6). Đổi subtitle lối tắt "Kết nối… · Đồng bộ từ GDT" để không gợi ý nút sync on-demand (fenced §8).

## 3. Quyết định chủ dự án (2026-07-14)

1. **Giữ** màn "Cài đặt chung", "Quên mật khẩu?", "Ghi nhớ đăng nhập" — bổ sung mô hình hợp lý.
2. **Nhịp backend:** A1+A2 làm ngay (nhỏ, data đã có); **A3+A4 tách unit backend sau**; S0 dựng sẵn chỗ cho remember-me + quên-mật-khẩu, nối khi có endpoint.
3. **Địa chỉ** ở Cài đặt chung: **bỏ, hiện MST** (chưa thêm cột `dia_chi`).
4. Sửa B1–B4, B7 theo hướng **hiện field/mã thật, gỡ nhãn/liên kết/filter bịa**.

> **Đính chính (so với lượt soát đầu):** "Ghi nhớ đăng nhập" **KHÔNG mâu thuẫn** ADR-0003 #3. #3 cho phép sẵn: *"in-memory… nếu cần nhớ phiên → cookie HttpOnly do Worker phát, KHÔNG localStorage."* ⇒ A3 = cookie HttpOnly refresh.

## 4. Backend bổ sung — đặc tả để dựng (TDD, spec cho unit sau)

> Đây là **endpoint MỚI** (vượt ranh giới "U15 không thêm backend" — đã được chủ dự án chuẩn thuận). Khi dựng xong sẽ cập nhật `06-BINDING_MAP` **từ mã**. Đều đọc-only, không lộ bí mật.

### A1 — `GET /me` (ĐÃ LÀM)
- Sau `requireTenant` (cả 3 vai). `tenant_id` từ token.
- Response `200 {ten, mst, goiDichVu, role}`: `ten/mst/goiDichVu` từ bảng `tenants` (scope theo `tenantId`, qua `withTenant`/RLS); `role` từ token. **`email` KHÔNG trả** (chốt cuối: client đã biết email từ lúc đăng nhập S0 → khỏi cần `sub`-lookup, tránh chạm middleware).
- Không trả `secret_ref`, không token thuế, không dữ liệu tenant khác.

### A2 — `GET /tax-accounts` + `GET /tax-accounts/:id` (ĐÃ LÀM)
- Sau `requireTenant` + `requireRole(ke_toan_truong, quan_tri)` (khớp các route tax-account khác).
- List `200 [{id, username, loai, uyQuyenLuc, tokenHetHan, ngayTao}]`; single `200 {…}` / `404` khác tenant.
- **KHÔNG** trả `tokenHienTai`/`secretRef`. `username` (MST) trả **đầy đủ** — MST là mã định danh của chính tenant, không phải bí mật (`security.md`); **UI tự che khi hiển thị** (`maskMst`). Chỉ đọc trạng thái: cho S5 khôi phục stepper (đã đăng ký/đã ủy quyền), panel token, và danh sách tài khoản.

### A3 — Remember-me = cookie HttpOnly refresh (unit sau)
- ADR-0003 #3 blessed. Login `remember=true` → Worker set cookie HttpOnly (refresh); endpoint đổi cookie→JWT lúc tải trang. **KHÔNG** localStorage. Cần review bảo mật (security-reviewer).

### A4 — Quên mật khẩu (unit sau, lớn nhất)
- Reset token (bảng mới) + gửi email (Cloudflare Email) + endpoint reset. Security-sensitive → spec + review riêng.

## 5. Bước tiếp

- **4.2 ✅ XONG** — `docs/07-DESIGN_TOKENS.md` chắt từ CSS export (nguồn token DUY NHẤT); serialize vào `apps/web/src/styles/tokens.css`.
- **4.3 ✅ XONG (2026-07-15)** — `apps/web` (React+Vite) đủ 8 màn (S0 · Dashboard · S1 danh sách · S2 chi tiết · S3 kết xuất · S4 đối chiếu · S5 kết nối thuế · Cài đặt chung) + backend A1 `GET /me` + A2 `GET /tax-accounts`(+`/:id`). Sửa trọn B1–B7, M1–M3. `make lint` sạch, `make test` xanh (453 test toàn repo; web 69, api 83), coverage web ~96%, build production OK. QA thị giác S0 khớp ảnh chuẩn. Review chéo: security-reviewer + dod-auditor.
- **Còn treo (unit sau):** A3 remember-me (cookie HttpOnly) + A4 quên-mật-khẩu (email) — S0 đã dựng sẵn chỗ ("sắp có"). QA thị giác các màn sau đăng nhập cần backend có dữ liệu (chờ deploy + seed).

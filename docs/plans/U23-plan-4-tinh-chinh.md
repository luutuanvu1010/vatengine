# Kế hoạch U23 — 4 tinh chỉnh theo chủ dự án (Admin · MST auto · Tổng quan tối giản · Dòng hàng)

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** Soạn 2026-07-16, cập nhật theo 4 quyết định chủ dự án cùng ngày.
> Bám: `U15-plan.md`, `U15-buoc4-soat-khop-va-quyet-dinh.md`, lớp thương mại `U17`–`U21`, `CLAUDE.md` (§Kiến trúc, §Nguyên tắc bằng chứng), luật `multi-tenant.md`/`security.md`/`testing.md`.
> **Kỷ luật bằng chứng:** mọi khẳng định về mã hiện trạng dẫn `file:line`, đọc trực tiếp ngày 2026-07-16. Không suy đoán.

---

## 0. Bối cảnh đã kiểm chứng

`apps/web` **đã là SPA hoàn chỉnh, nối API thật** (không demo): Dashboard, Invoices, InvoiceDetail, Reconcile, Exports, TaxAccounts, Settings, About/Login (`apps/web/src/routes/AppRouter.tsx:51-78`; client `apps/web/src/lib/apiClient.ts:21`; `@tanstack/react-query`). 4 hạng mục dưới là **tinh chỉnh trên nền có sẵn**.

**Quyết định chủ dự án (2026-07-16):**
1. **Admin = cổng quản trị hệ thống của chủ phần mềm (xuyên-tenant)** — KHÔNG phải trang người dùng.
2. **1 tenant = 1 tài khoản thuế** (hạn mức mặc định = 1), **nhưng để sẵn module tài khoản con** (vd `abcd-001`, `abcd-002` thuộc MST gốc `abcd`).
3. Tổng quan: **giữ 1 dòng trạng thái kết nối**, bỏ mọi con số tiền.
4. Dòng hàng (tên HH-DV, số lượng): **có trong file kết xuất**.

---

## 1. Yêu cầu (1) — Admin xuyên-tenant: **ĐÃ CÓ PLAN ĐẦY ĐỦ, chỉ xác nhận & trỏ**

### 1.1 Sự thật đã kiểm chứng

Admin xuyên-tenant mà bạn muốn **đã được lên kế hoạch trọn vẹn** trong lớp thương mại (`COMMERCIAL-LAYER-plan.md`) — **CHƯA hiện thực**, nhưng KHÔNG cần plan mới:

| Unit | Vai trò | Trạng thái |
|---|---|---|
| **U17** `docs/plans/U17-plan.md` | BE: đăng ký công khai + trạng thái duyệt + gói dịch vụ | ⬜ chưa làm |
| **U18** `docs/plans/U18-plan.md` | BE: **Admin API — super-admin đứng NGOÀI tenant** + đọc/ghi xuyên-tenant có kiểm soát. *Đơn vị nhạy cảm bảo mật nhất* — mọi quyết định qua `security-reviewer` | ⬜ chưa làm |
| **U19** `docs/plans/U19-plan.md` | FE: **Cổng Admin tách biệt `/admin`**, đăng nhập tách hẳn khỏi khách | ⬜ chưa làm |
| **U21** `docs/plans/U21-plan.md` | FE: **Dashboard giám sát Admin** (số liệu xuyên-tenant qua con đường super-admin U18) | ⬜ chưa làm |

Hiện trạng mã khớp: `apps/` chỉ có `api`/`sync-worker`/`web`; **chưa có app/route `/admin`**, **chưa có super-admin xuyên-tenant** (`apps/api/src/rbac.ts:17` — `quan_tri` vẫn bị RLS trong tenant của mình). Nghĩa là plan U18/U19 **đúng hướng** và chưa bị bỏ sót.

### 1.2 Việc cần làm

**Không viết plan Admin mới.** Yêu cầu (1) = **thực thi U17→U18→U19→U21** khi tới lượt. Hành động ở U23: chỉ **xác nhận** bốn plan này còn khớp hiện trạng (đã xác nhận ở trên) và **chốt thứ tự**: lớp thương mại (U17–U21) chạy **sau** 3 tinh chỉnh khách hàng dưới đây, vì Admin nặng và nhạy cảm hơn.

> ⚠️ **Cảnh báo bảo mật (nhắc lại từ U18):** super-admin xuyên-tenant là bề mặt rủi ro lớn nhất dự án. Khi hiện thực, bắt buộc: danh tính admin tách khỏi bảng khách, đăng nhập/ţoken tách, audit mọi truy cập xuyên-tenant, **không** để lộ token thuế/nội dung hóa đơn của khách. Chạy `security-reviewer` trước commit.

---

## 2. Yêu cầu (2) — MST auto + hạn mức 1 tài khoản thuế (để sẵn module tài khoản con)

### 2.1 Sự thật đã kiểm chứng

- `tenants.mst` **đã có** (`packages/db/src/schema/tenants.ts:11`; DDL `migrations/0000_equal_wendigo.sql:97`); chưa `UNIQUE`. Chỉ đọc qua `GET /me` (`apps/api/src/routes/me.ts:38,50`); `PATCH /me` chặn sửa `mst` (`me.ts:16,61`).
- `tai_khoan_thue.username` (= MST đăng nhập GDT) **nhập tự do** (`apps/api/src/routes/taxAccounts.ts:21-22,55-58`); tenant↔taiKhoanThue **1–nhiều**; cột `loai` ∈ {chinh, con} **đã có sẵn** (`taiKhoanThue.ts:12-16`) → *module tài khoản con đã có nền*. **KHÔNG** unique trên `username`/`(tenant_id, username)`, **KHÔNG** ràng buộc với `tenants.mst`.
- Không có route tự đăng ký tenant trong `apps/api/src` (tenant provisioning ngoài / hoặc qua U17 sắp làm).

### 2.2 Mô hình dữ liệu chốt (theo quyết định #2)

- **`tenants.mst` = MST gốc** của doanh nghiệp (vd `abcd`).
- **Tài khoản thuế con** có `username` dạng MST-nhánh (vd `abcd-001`) — **KHÁC** `tenants.mst`, nhưng phải **thuộc cùng MST gốc**. ⇒ Logic auto KHÔNG phải "username = mst" mà là:
  - **Mặc định (hạn mức = 1):** tài khoản thuế đầu tiên `loai='chinh'`, `username` **auto = `tenants.mst`** (không cho nhập).
  - **Module con (để sẵn, mặc định TẮT):** khi bật, cho thêm `loai='con'` với `username` phải **bắt đầu bằng `tenants.mst`** (vd `abcd-001`) — validate tiền tố, không cho MST ngoài doanh nghiệp.
- **Hạn mức** = số tài khoản thuế tối đa/tenant. Mặc định **1**. Cấu hình để nâng khi bật module con (nguồn hạn mức: cột `tenants.gioi_han_tk_thue` mới, hoặc theo gói dịch vụ U17 — chốt ở §6).

### 2.3 Việc cần làm

**BE-1. Migration (`packages/db`):**
- `UNIQUE(mst)` trên `tenants` (1 MST gốc ↔ 1 tenant).
- `UNIQUE(tenant_id, username)` trên `tai_khoan_thue` (chống trùng tài khoản trong tenant).
- (Tùy chốt §6) cột `tenants.gioi_han_tk_thue INT NOT NULL DEFAULT 1` cho hạn mức.
- Test constraint (`packages/db/test/integration/constraints.test.ts` làm mẫu).

**BE-2. Sửa `POST /tax-accounts` (`taxAccounts.ts:38-67`):**
- **Bỏ `username` khỏi body** cho tài khoản **chính**: đọc `tenants.mst` (scope tenant, `withTenant`/RLS), auto-gán `username = mst`, `loai='chinh'`. `mst` rỗng → lỗi rõ ("Doanh nghiệp chưa khai MST").
- **Kiểm hạn mức:** đếm tài khoản thuế hiện có của tenant; ≥ hạn mức → **409/400** ("Đã đạt hạn mức tài khoản thuế").
- **Module con (để sẵn, sau cờ bật):** nếu cho phép `loai='con'`, nhận `username` con nhưng **validate `username.startsWith(tenants.mst)`**; ngược lại 400.
- Audit giữ nguyên (mask).

**BE-3. Endpoint Ngắt kết nối** (kiểm chứng thêm ở bước làm — đọc `taxAccounts.ts` đầy đủ xem đã có chưa):
- Nếu chưa: `POST /tax-accounts/:id/disconnect` — xóa token đã lưu (token vault), reset trạng thái token, audit. RBAC như route tax-account khác. **KHÔNG** xóa bản ghi MST, chỉ ngắt token.

**FE-1. Rút gọn màn kết nối (`apps/web/src/features/taxAccounts/TaxAccountsPage.tsx:15`):**
- Bỏ ô nhập MST. Hiện MST **read-only** từ `GET /me` (`maskMst` khi hiển thị).
- Stepper còn: **(MST cố định) → Ủy quyền → Nhập captcha + Mật khẩu GDT → Đăng nhập**. Mật khẩu không lưu client.
- Thêm **nút Ngắt kết nối** (gọi BE-3, có xác nhận), phản ánh trạng thái token.
- **Chừa chỗ module tài khoản con:** khối "Thêm tài khoản con" ẩn sau cờ (mặc định ẩn) — UI để sẵn, không kích hoạt.
- RBAC: ẩn với `ke_toan`.

### 2.4 Lưu ý
- Đây là **thay đổi hợp đồng** so với U15-buoc4 (B7). Cập nhật `06-BINDING_MAP` từ mã sau khi làm.
- Nếu U17 (đăng ký khách) làm trước, khâu tạo tenant phải set `mst`. Nếu U23 làm trước, giữ provisioning hiện tại (điền `mst` khi cấp tenant).

---

## 3. Yêu cầu (3) — Tổng quan tối giản, giữ 1 dòng trạng thái kết nối

### 3.1 Sự thật đã kiểm chứng
`apps/web/src/features/dashboard/DashboardPage.tsx:98-105` gọi `api.getSummary` + `api.getReconcile`, hiển thị thẻ tiền mua/bán + 4 số đối chiếu + lối tắt.

### 3.2 Việc cần làm — thuần Frontend

**FE-2. Viết lại `DashboardPage.tsx`:**
- **Bỏ toàn bộ thẻ số tiền + số thống kê đối chiếu**; bỏ gọi `api.getSummary`/`api.getReconcile` ở màn này.
- **Giữ 1 dòng trạng thái kết nối GDT** (quyết định #3): "Đã kết nối · token còn hạn đến …" / "Chưa kết nối" — đọc từ `GET /tax-accounts` (trường `tokenHetHan`, đã có). Không con số tiền.
- **Lối tắt (card) theo RBAC:** Kết nối GDT (ẩn `ke_toan`) · Xem hóa đơn (3 vai) · Kết xuất (ẩn `ke_toan`).

**FE-3. Cập nhật test** dashboard: bỏ assert số tiền; thêm assert dòng trạng thái + lối tắt + RBAC ẩn nút.

---

## 4. Yêu cầu (4) — Dòng hàng (tên HH-DV, số lượng): FE chi tiết + thêm vào xlsx/csv

### 4.1 Sự thật đã kiểm chứng (⚠️ backend dòng hàng ĐÃ có phần lớn)

- **Lưu trữ đầy đủ:** GDT client parse `hdhhdvu` → `InvoiceLine` (`packages/gdt-client/src/detail.ts:44-63,139-163`); bảng `dong_hang_hoa` (`ten, dvtinh, sluong, dgia, thtien, tsuat…`) (`packages/db/src/schema/dongHangHoa.ts:9-37`); persist idempotent (`packages/sync/src/detailLines.ts:62-80`, gọi khi `opts.fetchDetail` — `packages/sync/src/sync.ts:295,346-350`).
- **API chi tiết:** `GET /invoices/:id` **đã trả** `{ ...header, dongHangHoa: DongHangHoaRow[] }` (`apps/api/src/routes/invoices.ts:66-85`; `packages/query/src/getInvoice.ts:31-45`). Numeric là **chuỗi** (không float).
- **Kết xuất — trạng thái tách đôi:**
  - `xml.zip` / `html.zip`: **ĐÃ có dòng hàng** (`packages/export/src/invoiceDoc.ts` render `<DongHangHoa>`; `lineRows.ts::fetchLinesForInvoices` — chú thích "U22").
  - **`xlsx` / `csv`: CHƯA có dòng hàng** — chỉ 16 cột header (`packages/export/src/columns.ts:14-31`; `csv.ts`/`xlsx.ts` không tham chiếu dòng hàng).

### 4.2 Việc cần làm

**FE-4. Bảng dòng hàng ở `InvoiceDetailPage.tsx`** (route `invoices/:id` — `AppRouter.tsx:56`) — thuần FE:
- Đọc `dongHangHoa` từ `GET /invoices/:id`; render bảng nổi bật: STT · **Tên HH-DV** · ĐVT · **Số lượng** · Đơn giá · Thành tiền · Thuế suất.
- Số/tiền: phân nhóm nghìn **không ép float** (chuỗi/BigInt), căn phải.
- HĐ rỗng dòng hàng → "Chưa có dữ liệu dòng hàng (cần đồng bộ chi tiết)".
- Kiểm tra luồng sync đã bật `fetchDetail` để dữ liệu thực sự được điền; nếu chưa, ghi chú vận hành.

**BE-4. Thêm dòng hàng vào `xlsx`/`csv`** (quyết định #4) — chạm `packages/export`:
- Chốt **hình thức** ở §6: (a) *sheet/khối riêng* "Chi tiết dòng hàng" (mỗi dòng hàng 1 row, có khóa `shdon` liên kết hóa đơn) — sạch cho kế toán; hay (b) *mở rộng theo hàng* (lặp hóa đơn theo từng dòng hàng).
- Dùng lại `fetchLinesForInvoices` (`lineRows.ts`) đã có — không viết lại truy vấn.
- Cột dòng hàng bám `dong_hang_hoa` thật (không bịa): `ten, dvtinh, sluong, dgia, thtien, tsuat`. Giữ kỷ luật tiền = chuỗi.
- Test: xlsx/csv có dòng hàng, số không float, HĐ không dòng hàng, cách ly tenant.

**BE-5. (tùy) profile kế toán:** nếu convert kế toán (U11) cũng cần dòng hàng → mở rộng sau; không bắt buộc ở U23.

---

## 5. Thứ tự thực thi & Definition of Done

Mỗi hạng mục = 1 vòng lặp TDD (`/start-unit`), commit nhỏ riêng. Thứ tự đề xuất:

1. **FE-4 (Dòng hàng — màn chi tiết)** — ưu tiên cao nhất, thuần FE, độc lập.
2. **BE-4 (Dòng hàng vào xlsx/csv)** — dùng lại `lineRows.ts`.
3. **FE-2/FE-3 (Tổng quan tối giản)** — thuần FE.
4. **BE-1 → BE-2 → BE-3 → FE-1 (MST auto + hạn mức + ngắt kết nối)** — migration → handler → disconnect → UI.
5. **Admin (1)** — không code ở U23; thực thi qua **U17→U18→U19→U21** sau, có `security-reviewer`.

**DoD mỗi hạng mục:** `make lint` sạch + `make test` xanh + không giảm coverage + không lộ bí mật + cập nhật `06-BINDING_MAP` khi chạm API + review chéo subagent trước commit. Cổng `Stop` hook ép lint+test.

---

## 6. Điểm đã chốt (2026-07-16)

1. **Hạn mức tài khoản thuế = theo GÓI DỊCH VỤ (U17).** Vì U17 chưa hiện thực, U23 **tạm hardcode hạn mức = 1** trong handler `POST /tax-accounts`, đặt sau một hàm `getGioiHanTkThue(tenant)` **một điểm** (TODO nối gói dịch vụ khi U17 xong — không rải magic number). KHÔNG thêm cột `gioi_han_tk_thue`.
2. **Module tài khoản con: ẩn sau cờ, chỉ dựng nền** ở U23 (mặc định TẮT). UI + validate tiền tố `startsWith(tenants.mst)` để sẵn, không kích hoạt.
3. **Dòng hàng trong xlsx/csv = SHEET/KHỐI "Chi tiết dòng hàng" RIÊNG**, khóa `shdon` liên kết về hóa đơn; header hóa đơn giữ nguyên trang/sheet chính. Dùng lại `fetchLinesForInvoices` (`lineRows.ts`).
4. **Thứ tự:** Admin (U17–U21) chạy **sau** 3 tinh chỉnh khách hàng — theo §5.

> Prompt thực thi từng đơn vị: `docs/plans/U23-prompts.md`.

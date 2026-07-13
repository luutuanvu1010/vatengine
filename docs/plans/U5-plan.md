# Kế hoạch — U5: Dịch vụ đồng bộ idempotent (upsert)

> Sản phẩm của `/plan-unit U5`. **Không viết code hiện thực** — chỉ kế hoạch để rà soát trước khi `/write-prompt U5` → `/start-unit U5`.
> Ngày: 2026-07-13. Nguồn "làm gì": `KIEN_TRUC_VA_KE_HOACH.md` **mục 7.2** (logic upsert idempotent) + **7.1** (thực thể) + **7.3** (`ttxly`). Ví dụ đặc tả U5: `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng 142–145. Nghiệm thu: `docs/CHECKLIST-NGHIEM-THU.md` mục U5. Luật áp dụng: `multi-tenant.md`, `gdt-adapter.md`, `security.md`, `testing.md`.
>
> **Tiền đề đã kiểm chứng — TÁI DÙNG, KHÔNG dựng lại:**
> - Adapter `queryInvoices(transport, token, params)` (U2, Amendment #5): gộp normal+sco, phân trang con trỏ `state`, khử trùng 5 trường khóa tự nhiên, gắn `_source`/`_direction`, **401 → `GdtError` code `SESSION_EXPIRED`** (không retry credential cũ).
> - Schema U4 (`e7c187d`): `hoa_don` UNIQUE 6 trường `hoa_don_natural_key`, `lan_dong_bo`, RLS `ENABLE+FORCE`, helper `withTenant(db, tenantId, fn)` đặt `SET LOCAL app.tenant_id`.
> - **U5 KHÔNG chạm cấu trúc mới của API thuế** — nó tiêu thụ output adapter đã chuẩn hóa. Định dạng giá trị `tdlap`/`ncnhat` trong `datas[]` **đã kiểm chứng** (2026-07-13, ADR-0001 Amendment #7) — xem "Điểm mơ hồ" #3 (đã chốt).
>
> **Hai quyết định phạm vi ĐÃ CHỐT (chủ dự án, 2026-07-13):**
> - **#A — Tiêu chí (e) "Thông báo thay đổi hóa đơn": HOÃN** sang unit riêng. U5 vẫn **phát hiện** thay đổi `ttxly`/`tthai` (so cũ↔mới) và **trả trong `SyncResult`**, nhưng KHÔNG dựng bảng/kênh thông báo (tránh U5 lấn sang mô hình hóa dữ liệu của U4 và tạo nguồn sự thật thứ hai). U5 làm **(a)(b)(c)(d)(f)**.
> - **#B — Cấp đồng bộ: CHỈ cấp hóa đơn** (header-level). U5 upsert `hoa_don` + ghi `lan_dong_bo`; KHÔNG gọi `getInvoiceDetail`, KHÔNG ghi `dong_hang_hoa`. Đồng bộ chi tiết dòng hàng tách thành một pass/unit sau (dùng lại `getInvoiceDetail`+`mapDetailLines` của U3).

## Phạm vi

Tạo package dịch vụ đồng bộ mới `packages/sync` (`@vat/sync`) cung cấp hàm `sync(...)`: gọi adapter lấy hóa đơn **một chiều** trong **một khoảng ngày** → **upsert idempotent** vào `hoa_don` theo khóa tự nhiên 6 trường (chạy trong `withTenant` để RLS chốt tenant) → ghi **một** bản ghi `lan_dong_bo` với `so_hd_moi`/`so_hd_cap_nhat`. Chạy lại cùng kỳ **không nhân đôi**; `ttxly`/`tthai` đổi → **cập nhật, không tạo mới**; 401 → dừng + ghi `lan_dong_bo.trang_thai='failed'`, không retry credential cũ; lỗi tạm để adapter (`fetchWithRetry`) backoff.

**NGOÀI phạm vi (nêu rõ để không lấn):**
- **Không** đồng bộ nền/lịch/Queue/Workflow/Durable Object rate-limit → **U9**. `sync()` ở U5 là **hàm thư viện, phi trạng thái**, được U9 gọi sau (U9 chịu chunk theo ngày/step + token-bucket).
- **Không** REST endpoint, JWT nội bộ, đọc DB qua Hyperdrive từ Worker → **U6**. U5 chạy trên `DATABASE_URL` trực tiếp (như U4).
- **Không** mã hóa envelope / xoay / lưu token → **U12**. U5 **nhận `token` qua tham số**, không tự đăng nhập, không persist credential.
- **Không** đồng bộ cấp dòng hàng (`dong_hang_hoa`, `getInvoiceDetail`) — quyết định **#B**.
- **Không** sinh thông báo / bảng `thong_bao` — quyết định **#A**.
- **Không** module đối chiếu (lệch thuế, HĐ hủy/thay thế) → **U10**; không bảng tra cứu nhãn `ttxly` tiếng Việt → **U6** (U5 lưu mã số như U4).

## File sẽ tạo/sửa

**Mới — package `packages/sync` (`@vat/sync`):**
- `packages/sync/package.json` — deps: `@vat/gdt-client`, `@vat/db` (workspace `*`), `drizzle-orm`; dev: `@electric-sql/pglite`, `vitest`, `typescript`. Scripts `test` (`vitest run`) + `typecheck` (`tsc --noEmit`) như `packages/db` (Makefile/root đã delegate qua `--workspaces`, **không sửa Makefile**).
- `packages/sync/tsconfig.json` — theo mẫu `packages/db`.
- `packages/sync/vitest.config.ts` — node + PGlite (offline), `include: test/**/*.test.ts`, coverage v8 ngưỡng 80%, `exclude: src/index.ts` (wiring thuần). **KHÔNG** dùng `vitest-pool-workers` (Worker pool không chạy PGlite/`pg`).
- `packages/sync/.dev.vars.example` — mẫu `DATABASE_URL` cho integration (nằm trong `.gitignore`).
- `packages/sync/src/mapInvoice.ts` — `mapInvoiceRowToHoaDon(row: InvoiceRow, tenantId): NewHoaDon`. Thuần, không I/O. Ánh xạ header: `nbmst/nbten/nmmst/nmten/khmshdon/khhdon/shdon/tdlap/ncnhat`, tiền (`tgtcthue/tgtthue/tgtttbso/ttcktmai/dvtte/tgia`), `ttxly/tthai`, `chieu = _direction`, `nguon = _source`, `rawJson = row`. Parse `tdlap`/`ncnhat` → `Date` (xem mơ hồ #3).
- `packages/sync/src/upsertHoaDon.ts` — `upsertBatch(tx, tenantId, rows): Promise<{ soHdMoi, soHdCapNhat, changes }>`. 1 lượt `SELECT` bản ghi hiện có theo tập khóa tự nhiên (lọc `tenant_id`) → diff trong bộ nhớ → insert bản mới + update bản có `ttxly`/`tthai`/tiền/`raw_json` đổi (cập nhật `updated_at`). `changes[]` = danh sách `{ naturalKey, ttxlyCu, ttxlyMoi, tthaiCu, tthaiMoi }` (phục vụ **phát hiện** thay đổi cho unit thông báo sau — quyết định #A; U5 không persist).
- `packages/sync/src/sync.ts` — `sync(opts): Promise<SyncResult>` điều phối:
  1. `queryInvoices(transport, token, { direction, dateFrom, dateTo, statuses?, includeSco?, size? }, retry?)`.
  2. `withTenant(db, tenantId, async (tx) => { const r = await upsertBatch(tx, tenantId, rows); ghi lan_dong_bo(...) ; return r })`.
  3. Bắt `GdtError`/lỗi: transaction rollback ⇒ **không ghi HĐ dở dang**; ghi `lan_dong_bo.trang_thai='failed'` + `thong_diep_loi` (ở transaction riêng), `ket_thuc`; trả `SyncResult` thất bại (không retry với credential cũ).
- `packages/sync/src/index.ts` — export `sync`, kiểu `SyncOptions`/`SyncResult`, `mapInvoiceRowToHoaDon`.

**Test (xem mục TDD):** `packages/sync/test/unit/mapInvoice.test.ts`, `packages/sync/test/unit/sync.test.ts`, `packages/sync/test/integration/sync.idempotent.test.ts`.

**Sửa:**
- Root `package.json` / `package-lock.json` — deps mới (workspace `packages/*` tự nhận package; `@vat/gdt-client`, `@vat/db`, `drizzle-orm`, `@electric-sql/pglite` phần lớn đã có ở U2–U4).
- `docs/CHECKLIST-NGHIEM-THU.md` — đánh dấu U5 (a)(b)(c)(d)(f) sau khi xanh; ghi rõ **(e) HOÃN** kèm lý do (quyết định #A) để checklist trung thực với phạm vi.

## Test viết trước (TDD)

Nhóm theo `.claude/rules/testing.md`. `make test` = `unit` + `integration` (đều offline). Mọi `fetch` GDT được mock qua `GdtTransport` giả — không mạng thật.

**`unit`** (offline, mock adapter — không DB):
1. `mapInvoiceRowToHoaDon`: ánh xạ đủ trường header; `chieu=_direction`, `nguon=_source`, `rawJson` = nguyên row; `tdlap`/`ncnhat` → `Date`; tiền giữ nguyên (không làm tròn/mất số).
2. `mapInvoice` chịu được trường tùy chọn thiếu (`nmmst`/`nmten`/tiền null) — không ném, cột null hợp lệ.
3. `sync` khi transport trả **401** (adapter ném `SESSION_EXPIRED`) → `SyncResult.trangThai='failed'`, `thongDiepLoi` có, **không** ghi hóa đơn nào; **không** retry credential cũ *(gdt-adapter.md, security.md)*. *(Dùng fake db-writer hoặc PGlite tùy độ gọn.)*

**`integration`** (PGlite — Postgres WASM offline, như U4; seed 1 tenant + 1 `tai_khoan_thue`):
4. **(a)** chạy `sync` hai lần cùng tham số (mock adapter trả cùng tập rows) → số bản ghi `hoa_don` **không tăng** lần hai.
5. **(b)** giữa hai lần, mock đổi `ttxly`/`tthai` của một hóa đơn → **cùng `id` được cập nhật** (giá trị mới), không tạo dòng mới; `so_hd_cap_nhat` phản ánh.
6. **(c)+(f)** mỗi lần chạy ghi đúng `so_hd_moi`/`so_hd_cap_nhat`; hai lần → **hai bản ghi `lan_dong_bo` phân biệt** (mốc thời gian riêng), truy vấn lại được theo `tenant_id`.
7. **Cách ly tenant** *(bắt buộc — `multi-tenant.md`)*: `sync` cho tenant A không ghi/không lộ dữ liệu sang tenant B; đọc dưới ngữ cảnh B không thấy HĐ của A (`withTenant` + RLS `FORCE`).
8. **(d)** 401 giữa chừng (mock transport 401 ở trang thứ hai) → `lan_dong_bo.trang_thai='failed'`, bảng `hoa_don` **không đổi** (rollback, không commit dở).

## Tiêu chí nghiệm thu

- Checklist U5 **(a)(b)(c)(d)(f)** đều có test đỏ→xanh; **(e) HOÃN** (ghi rõ trong checklist, quyết định #A).
- `make lint` sạch (`tsc --noEmit` + Biome); coverage `packages/sync` ≥ 80% (trừ `src/index.ts` wiring).
- Không log token/mật khẩu/`raw_json` nhạy cảm ở mức INFO+ *(security.md)*.
- Mọi ghi/đọc qua `withTenant` + lọc `tenant_id` tường minh; upsert theo khóa 6 trường.
- 401 dừng, không retry; `sync` nhận `token` tham số, không persist credential.
- Contract test GDT hiện có vẫn xanh (U5 **không đụng** `packages/gdt-client`).
- `make test` chạy hoàn toàn offline (không gọi `hoadondientu.gdt.gov.vn`).

## Ràng buộc bắt buộc chạm tới

- **Cô lập adapter**: U5 chỉ gọi `@vat/gdt-client` (`queryInvoices`); **tuyệt đối không** `fetch()` tới GDT trực tiếp trong `packages/sync` *(gdt-adapter.md)*.
- **Khóa tự nhiên 6 trường + idempotent**: upsert theo `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`, dựa ràng buộc `hoa_don_natural_key` (U4). Adapter khử trùng 5 trường; `tenant_id` bổ sung ở tầng này *(CLAUDE.md, multi-tenant.md)*.
- **`tenant_id`/RLS**: ghi/đọc trong `withTenant`; `lan_dong_bo`/`hoa_don` gắn `tenant_id`; RLS là lớp phòng thủ thứ hai, **không** thay lọc tường minh *(multi-tenant.md)*.
- **401 → dừng + báo hết phiên**, không retry credential; lỗi tạm (5xx/timeout) đã do `fetchWithRetry` backoff ở adapter — U5 chỉ ghi nhận thất bại *(gdt-adapter.md)*.
- **Không lưu mật khẩu thô / token**: `sync` nhận `token`+`taikhoanId` tham số, không persist (envelope=U12) *(security.md)*.
- Không phá captcha (không liên quan trực tiếp).

## Rủi ro & phụ thuộc

- **Định dạng trường trong `datas[]` — ĐÃ PIN** (2026-07-13, ADR-0001 Amendment #7): `tdlap` = string ISO-8601 UTC không mili giây (`YYYY-MM-DDTHH:mm:ssZ`, quan sát luôn `17:00:00Z` = 00:00:00 giờ VN); `ncnhat` = ISO-8601 UTC CÓ mili giây; `tgtcthue`/`tgtttbso` = JSON number (có thể dạng khoa học); `ttxly`/`tthai` = JSON integer. Rủi ro còn lại: chỉ quan sát 1 lô hóa đơn máy tính tiền cùng ngày lập — mapper vẫn nên phòng thủ (parse ISO-8601 chuẩn, không tự trừ/cộng múi giờ) + có test cho giá trị dạng khoa học.
- **Egress GDT**: `unit`+`integration` chạy **offline** (mock `GdtTransport` + PGlite) → `make test` không gọi mạng, đúng `testing.md`. Chỉ `test:contract` chạm GDT (không thuộc U5).
- **Giới hạn Workers (CPU 5'/wall 15')**: U5 là thư viện thuần; khoảng ngày lớn → nhiều trang (adapter cảnh báo `MAX_PAGES`). Chia nhỏ theo ngày/step + rate-limit là **U9**, không phải U5.
- **Vitest pool**: package mới dùng cấu hình node/PGlite (như `packages/db`), không Worker pool.
- **Token lifecycle**: hết hạn → 401 path; làm mới token là U1/U12.

## Điểm mơ hồ

**#1 (Tiêu chí (e)) — ĐÃ CHỐT #A**: HOÃN sang unit riêng; U5 chỉ *phát hiện* thay đổi và trả trong `SyncResult`.

**#2 (Cấp dòng hàng) — ĐÃ CHỐT #B**: CHỈ cấp hóa đơn; không `getInvoiceDetail`/`dong_hang_hoa` ở U5.

**#3 (Định dạng `datas[]`) — ĐÃ CHỐT bằng probe thật (2026-07-13, ADR-0001 Amendment #7)**: `tdlap` là chuỗi ISO-8601 UTC (không `dd/mm/yyyy`), không mili giây, mapper dùng `new Date(tdlap)`/Zod `.datetime()` chuẩn, KHÔNG tự quy đổi múi giờ trong code ứng dụng (Postgres `timestamptz` tự lo). `tgtcthue`/`tgtttbso` là number sẵn, không cần parse chuỗi. Viết test cho: (i) parse đúng ISO-8601 chuẩn, (ii) giá trị tiền dạng khoa học (`E7`/`E8`) không mất độ chính xác. Giới hạn còn lại: chỉ quan sát 1 lô hóa đơn máy tính tiền cùng ngày lập — nếu gặp `tdlap` không khớp mẫu này khi thực thi thật, dừng và ghi amendment mới, không nới test cho xanh.

**#4 (Nguồn token) — ĐỀ XUẤT (override được)**: `sync` **nhận `token` + `taikhoanId` qua tham số** (bên gọi lo đăng nhập/U1), giữ U5 phi trạng thái về credential và tránh chạm mã hóa (U12). Nếu muốn `sync` tự đọc `tai_khoan_thue.token_hien_tai` → phải định nghĩa giải mã token, kéo U12 vào sớm; không đề xuất.

## Bàn giao

Kế hoạch sẵn sàng rà soát. Bước kế tiếp: `/write-prompt U5` (sinh prompt thực thi) hoặc `/start-unit U5` (thực thi trực tiếp — TDD: viết 8 test trên trước, rồi hiện thực tối thiểu).

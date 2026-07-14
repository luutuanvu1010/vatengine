# Kế hoạch — U7: Kết xuất Excel/CSV theo mẫu

> Sản phẩm của `/plan-unit U7`. **Không viết code hiện thực** — chỉ kế hoạch để rà soát trước khi `/write-prompt U7` → `/start-unit U7`.
> Ngày: 2026-07-14. Nguồn "làm gì": `KIEN_TRUC_VA_KE_HOACH.md` **mục 6** (Xuất & Tích hợp), **mục 7.1** (cột nghiệp vụ + tiền `numeric`), **12 GĐ1** + **12b P6** (kết xuất đa định dạng). "Làm thế nào": `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng 105 (U7: "Test đọc lại file, đúng cột và định dạng tiền"). Đối sánh parity: `KHAO_SAT_TINH_NANG_NIBOT.md` mục 3 + 8a. Luật áp dụng: `multi-tenant.md`, `security.md`, `testing.md` (KHÔNG đụng `gdt-adapter.md`). Giới hạn nền tảng: `docs/adr/0001-nen-tang-cloudflare.md` dòng 259 (Workers CPU 5', wall HTTP không giới hạn khi client còn kết nối, 128 MB RAM/isolate) + 265/338 (R2 cho file kết xuất lớn, không phí egress).
>
> **Tiền đề đã kiểm chứng — TÁI DÙNG, KHÔNG dựng lại:**
> - **U6 (`6a2fed5`)**: `@vat/query` (`listInvoices`/`summarizeInvoices`/`getInvoiceById`, `invoiceFilterSchema`/`pageSchema`/`buildWhere` — LUÔN kèm `tenant_id` tường minh; sắp `tdlap desc, id desc`). `apps/api` (Hono) có middleware `requireTenant` (JWT nội bộ HS256 → `c.get("tenantId")`), seam DI `AppDeps.getDb(env)` để test đi qua route thật bằng **PGlite** offline, `withTenant` (RLS lớp 2). **U7 kết xuất chính bộ dữ liệu U6 tra cứu — dùng lại nguyên `InvoiceFilter` + `buildWhere`, KHÔNG viết lại lọc.**
> - **U4 (`e7c187d`)**: `hoa_don` — tiền là `numeric` (`tgtcthue`/`tgtthue`/`tgtttbso`/`ttcktmai`/`tgia`) → node-postgres & PGlite trả **chuỗi** (giữ chính xác, mục 7.1). `dvtte` (tiền tệ), `chieu`/`nguon` (text đã lưu), `ttxly`/`tthai` (số nguyên — MÃ, chưa có nhãn). Bảng `audit_log` **đã có khung** (U4); ghi audit runtime + ràng buộc append-only đầy đủ là **U12** (xem `schema/auditLog.ts`).
> - **U7 KHÔNG gọi máy chủ thuế / `GdtTransport` / `fetch()` ra GDT** — chỉ đọc dữ liệu đã đồng bộ rồi mã hóa thành file → `gdt-adapter.md` không áp dụng; không có rủi ro egress/rate-limit/captcha/401-token trong U7.
> - **Mẫu cột kết xuất tham chiếu (MVP `backend/gdt_client.py::EXPORT_COLUMNS` + `main.py::api_export`)**: 14 cột (`tdlap, khmshdon, khhdon, shdon, nbmst, nbten, nmmst, nmten, tgtcthue, tgtthue, tgtttbso, dvtte, <trạng thái>, <nguồn>`), tiền định dạng `#,##0`, header in đậm, freeze dòng 1. Port sang TS làm **một mẫu cột chuẩn duy nhất**.
>
> **✅ BỐN QUYẾT ĐỊNH ĐÃ CHỐT (chủ dự án, 2026-07-14):**
> - **#1 — Giao file: GHI R2 + TRẢ LINK TẢI.** Renderer ghi file ra R2 theo lô, trả `{ key, url }`; `GET /exports/:key` stream từ R2 (giới hạn tenant). Không giữ file trong RAM Worker; không kéo Queue/Workflow (giữ U9 nguyên vẹn).
> - **#2 — xlsx: THƯ VIỆN NHẸ + SPIKE KIỂM CHỨNG.** Thư viện thuần JS nhẹ (không phụ thuộc Node builtin) hoặc tự dựng SpreadsheetML + `fflate`; **GATE bằng spike sinh+đọc-lại dưới `vitest-pool-workers`** trước khi chốt (bài học `:30000` — không tin tài liệu suông). CSV không cần thư viện.
> - **#3 — `ttxly`/`tthai`: XUẤT MÃ (SỐ) NHƯ U6.** Không tạo nguồn sự thật thứ hai (U6 đã hoãn nhãn); kèm `chieu`/`nguon` (đã là text). Nhãn tiếng Việt để tầng frontend/bảng tham chiếu sau.
> - **#4 — Audit: GHI AUDIT TỐI THIỂU Ở U7.** Mỗi lần export ghi một dòng append vào `audit_log` (`hanh_dong = 'export'`). Ràng buộc append-only đầy đủ + masking + taxonomy vẫn để **U12**.

## Phạm vi

Cho phép người dùng **tải bộ hóa đơn đã đồng bộ** (đúng bộ lọc U6) ra file **`xlsx`** và **`csv`** đúng mẫu cột và định dạng tiền, **không giữ toàn bộ file trong bộ nhớ Worker** (file lớn → **R2**). Ba mảnh, bám khuôn U6 (logic thuần ở `packages/`, wiring ở `apps/api`):

- **Renderer thuần** `packages/export` (`@vat/export`, phủ test ≥ 80%): nhận **luồng hàng hóa đơn** (theo mẫu cột chuẩn) → sinh **byte/stream** `xlsx` hoặc `csv`. Không biết gì về HTTP/R2/DB.
- **Nạp hàng theo lô (keyset)** trên `@vat/query`: lặp **toàn bộ** hóa đơn khớp bộ lọc theo trang keyset `(tdlap, id)` (dùng lại thứ tự sắp của U6) — tránh nạp cả tập vào RAM cùng lúc.
- **Endpoint kết xuất** trong `apps/api` (Hono): `GET /invoices/export?format=xlsx|csv&<bộ lọc U6>` sau `requireTenant`; chạy trong `withTenant`; **ghi file ra R2** (put/multipart theo lô, không buffer cả file); trả **liên kết tải**. Endpoint tải phát trực tiếp (stream) object từ R2, **giới hạn theo tenant**.

**Định dạng trong U7:** tối thiểu **`xlsx` + `csv`** (đúng checklist U7 + khảo sát 8a).

**NGOÀI phạm vi (nêu rõ để không lấn):**
- **Không** `xml.zip` / `html.zip` / `pdf.zip` / `AIO.pdf` (parity P6, khảo sát mục 3) — lộ trình sau; kiến trúc renderer để mở thêm định dạng nhưng U7 chỉ hiện thực 2.
- **Không** kết xuất **nền qua Queue/Workflow/Cron** → **U9**. U7 chạy **đồng bộ trong request** (đủ cho quy mô thực tế; ngưỡng "quá lớn phải đẩy nền" ghi ở "Rủi ro").
- **Không** gọi GDT / `GdtTransport`; **không** kèm dòng hàng (`dong_hang_hoa` chưa persist — quyết định U5/U6). Kết xuất **cấp hóa đơn (header)** như U6.
- **Không** ánh xạ định dạng phần mềm kế toán (MISA/FAST…) → **U11**.
- **Không** tạo **bảng nhãn tiếng Việt cho `ttxly`/`tthai`** (nguồn sự thật thứ hai — U6 đã hoãn) → **chốt #3: xuất MÃ số**, nhãn để tầng sau.
- **Không** đổi schema/migration U4; **không** sửa logic `@vat/query`/route U6 (chỉ *thêm*).

## File sẽ tạo/sửa

**Mới — package `packages/export` (`@vat/export`) — logic nghiệp vụ, phủ test ≥ 80%:**
- `packages/export/package.json` — deps: `@vat/db`, `@vat/query`, `drizzle-orm` + **thư viện xlsx (xem Điểm mơ hồ #2)**; dev: `@electric-sql/pglite`, `vitest`, `typescript`. Scripts `test`/`typecheck` như `packages/query`.
- `packages/export/tsconfig.json`, `packages/export/vitest.config.ts` — coverage v8 ngưỡng 80%, `exclude` `src/index.ts` (wiring thuần).
- `packages/export/src/columns.ts` — **mẫu cột chuẩn duy nhất** (port `EXPORT_COLUMNS`): mảng `{ key, label, kind: 'text'|'money'|'date' }`. Nguồn sự thật cho cả `xlsx` lẫn `csv`.
- `packages/export/src/csv.ts` — `toCsv(rows)`: encode theo mẫu cột; escape RFC-4180 (dấu phẩy/nháy/xuống dòng trong tên); tiền giữ **chuỗi numeric nguyên bản** (không tách nghìn — máy đọc được); BOM UTF-8 để Excel mở đúng tiếng Việt.
- `packages/export/src/xlsx.ts` — `toXlsx(rows)`: một sheet `HoaDon`; header đậm; ô tiền là **số** với `number_format "#,##0"`; freeze dòng 1. (Thư viện — #2.)
- `packages/export/src/rows.ts` — `iterateInvoices(db, tenantId, filter, pageSize)`: async generator phát từng lô theo keyset `(tdlap, id)` (dùng lại `buildWhere` + thứ tự U6); không nạp cả tập.
- `packages/export/src/index.ts` — export `toCsv`, `toXlsx`, `iterateInvoices`, `EXPORT_COLUMNS`, kiểu `ExportFormat`.

**Sửa/thêm — `apps/api` (wiring, trừ khỏi ngưỡng coverage):**
- `apps/api/src/storage.ts` *(mới)* — seam DI R2 (song song `db.ts`): production dùng `env.RAW` (R2Bucket binding); test tiêm **R2 giả trong bộ nhớ** để integration test offline. Interface `putStream(key, stream)` + `get(key)`.
- `apps/api/src/routes/exports.ts` *(mới)* — `GET /invoices/export` (validate `format` + `invoiceFilterSchema`; `iterateInvoices` → renderer → `putStream` R2; trả `{ key, url }`) và `GET /exports/:key` (stream từ R2; **giới hạn tenant** qua tiền tố key; không thấy → 404). Sau `requireTenant`.
- `apps/api/src/types.ts` *(sửa)* — `Env += RAW: R2Bucket`; `AppDeps += getStorage(env)`.
- `apps/api/src/app.ts` *(sửa)* — mount `exportsRoutes(deps)`.
- `apps/api/src/index.ts` *(sửa)* — wire R2 thật (`getStorage` đọc `env.RAW`).
- `apps/api/wrangler.jsonc` *(sửa)* — bật `r2_buckets` (`{ binding: "RAW", bucket_name: "vat-raw" }`); bucket tạo lúc deploy (`wrangler r2 bucket create`). Không commit bí mật.
- `apps/api/package.json` *(sửa)* — thêm dep `@vat/export`.
- `apps/api/.dev.vars.example` *(sửa nếu cần)* — ghi chú R2 local.

**Test:** `packages/export/test/unit/{columns,csv,xlsx,rows}.test.ts`, `apps/api/test/integration/exports.route.test.ts`.

**Sửa tài liệu:** `docs/CHECKLIST-NGHIEM-THU.md` (mục U7), `README.md` (endpoint kết xuất), root `package.json`/lockfile (deps mới).

## Test viết trước (TDD)

Nhóm theo `.claude/rules/testing.md`. `make test` = `unit` + `integration` (đều offline; PGlite + R2 giả). U7 không gọi GDT → không có nhóm `contract` mới.

**`unit`** (offline, `packages/export`):
1. `columns`: mẫu cột có đúng danh sách `key`/`label`/`kind` theo thứ tự kỳ vọng (khớp MVP); tiền được đánh dấu `kind: 'money'`.
2. `csv`: encode ≥ 2 hàng → **parse lại** → đúng header, đúng số dòng, tiền = **chuỗi numeric nguyên bản**; tên chứa `,`/`"`/xuống dòng được escape đúng (parse lại khớp); có BOM UTF-8.
3. `xlsx` *(tiêu chí lõi U7 — "đọc lại file, đúng cột và định dạng tiền")*: encode ≥ 2 hàng → **mở/parse lại** → sheet `HoaDon`; dòng 1 = nhãn cột đúng thứ tự; ô tiền là **số** đúng giá trị **và** `number_format` = `#,##0`; ô ngày/text đúng.
4. `xlsx` ca biên: tập rỗng → file hợp lệ chỉ có header; tiền `null` → ô trống (không "0" giả).
5. `rows` (PGlite, seed nhiều hơn 1 trang keyset): `iterateInvoices` phát **đủ** hàng khớp bộ lọc, **đúng một lần**, đúng thứ tự `tdlap desc, id desc`; không lặp/không sót ở ranh giới trang (kiểm với hàng trùng `tdlap`).

**`integration`** (`apps/api`; app thật + PGlite tiêm + R2 giả; seed ≥ 2 tenant):
6. `GET /invoices/export?format=xlsx` (JWT tenant A) → ghi object vào R2 giả + trả `{ key, url }`; **mở lại object** → chỉ hàng của A khớp bộ lọc, đúng số bản ghi, đúng cột + định dạng tiền.
7. `format=csv` → tương tự, parse lại đúng số bản ghi.
8. **Cách ly tenant qua kết xuất** *(bắt buộc — `multi-tenant.md`)*: export của A **không** chứa hàng của B; `GET /exports/:keyCủaB` bằng JWT A → **404** (key mang tiền tố tenant).
9. Route: `format` thiếu/ngoài `{xlsx,csv}` → **400**; không có/hỏng JWT → **401**; `/exports/:key` không tồn tại → **404**.
10. *(chốt #4 = ghi audit)* mỗi lần export ghi **một** dòng `audit_log` (`hanh_dong = 'export'`, `doi_tuong` = định dạng+bộ lọc, `tenant_id` đúng); không log `raw_json`/token.

## Tiêu chí nghiệm thu

- Toàn bộ test trên **đỏ→xanh**; `make lint` sạch (`tsc --noEmit` + Biome); coverage `packages/export` ≥ 80% (trừ `src/index.ts`); logic route `apps/api` có integration test đi qua đường thật (PGlite + R2 giả).
- **Mở lại file `xlsx`**: đúng cột (đúng thứ tự nhãn) và **định dạng tiền** (`#,##0`, ô là số); **mở lại `csv`**: đúng số bản ghi + tiền nguyên bản. (Tiêu chí U7 gốc.)
- **File không giữ nguyên khối trong bộ nhớ Worker**: renderer làm việc theo **stream/lô**, route ghi R2 bằng `putStream`/multipart; nạp hàng bằng keyset theo lô (bằng chứng: dùng API stream + generator + test lô, không có bước `await allRows()`).
- **≥ 1 test cách ly tenant qua kết xuất** (test #8): A không kết xuất/không tải được dữ liệu B.
- Mọi truy vấn đọc chạy trong `withTenant` **và** `buildWhere` (lọc `tenant_id` tường minh); download giới hạn tenant qua tiền tố key.
- Không log token/JWT/`raw_json`; tên bucket/chuỗi kết nối không commit (security.md); R2 binding qua `wrangler.jsonc` (không bí mật).
- Cập nhật `docs/CHECKLIST-NGHIEM-THU.md` mục U7.

## Ràng buộc bắt buộc chạm tới

- **`tenant_id`/RLS (multi-tenant.md) — trọng tâm:** kết xuất dùng lại `buildWhere` (lọc tường minh, lớp 1) + `withTenant`/RLS `FORCE` (lớp 2); key R2 mang tiền tố `tenant_id` và download kiểm tenant; **test cách ly tenant qua kết xuất bắt buộc**. Role app Hyperdrive không superuser (đã chốt U4).
- **Bảo mật (security.md):** endpoint kết xuất + tải sau `requireTenant` (JWT **nội bộ**, không token thuế); **audit "xuất dữ liệu"** — xem Điểm mơ hồ #4; không log dữ liệu nhạy cảm; bí mật/binding không commit.
- **Stateless + giới hạn Workers (mục 11 / ADR 259, 265):** không giữ state giữa request; file lớn ra **R2** (không RAM Worker); batch/stream để không chạm trần CPU 5'.
- **Khóa tự nhiên/idempotent:** U7 chỉ đọc — không upsert, không đổi khóa tự nhiên.
- **Cô lập adapter / 401 GDT / captcha:** **không áp dụng** — U7 không gọi GDT.
- **Không nguồn sự thật thứ hai:** mẫu cột là **một** module `columns.ts`; nhãn `ttxly`/`tthai` — Điểm mơ hồ #3.

## Rủi ro & phụ thuộc

- **Thư viện `xlsx` trên runtime Workers — CHƯA KIỂM CHỨNG (chốt #2).** Không được "chốt" thư viện chỉ vì tài liệu nói chạy được (bài học `:30000`). Cần **spike kiểm chứng** dưới `vitest-pool-workers` (Miniflare): sinh file 1 dòng + đọc lại, chạy xanh → mới chốt. Chặn `xlsx.ts` cho tới khi spike xanh; `csv.ts` + `rows.ts` không bị chặn (làm trước).
- **Binding R2 chưa tạo:** cần `wrangler r2 bucket create vat-raw` lúc deploy. **Không chặn dev/test** (R2 giả tiêm) — như Hyperdrive ở U6; probe khi deploy.
- **Bộ nhớ 128 MB / tập lớn:** phải stream + keyset theo lô; **không** dùng con trỏ server-side node-postgres qua Hyperdrive (**CHƯA KIỂM CHỨNG** — dùng keyset thay thế, an toàn).
- **CPU 5'/req cho tập rất lớn:** U7 đồng bộ đủ cho quy mô thực tế; nếu tập vượt ngưỡng (ví dụ > vài trăm nghìn dòng) cần đẩy **nền (U9)** — ghi ngưỡng, không tự làm nền ở U7.
- **Phụ thuộc thứ tự:** dựng trên U6 (đã xong). Audit đầy đủ ở U12 → #4 quyết định làm tối thiểu bây giờ hay hoãn.

## Điểm mơ hồ — ĐÃ CHỐT (Hiến pháp §"Khi gặp mơ hồ" + "không quyết kiến trúc/không thêm dependency khi chưa duyệt")

> Không có chỗ nào phải **đoán cấu trúc phản hồi API thuế** (U7 không chạm GDT). Bốn điểm dưới là **quyết định kiến trúc/dependency/chính sách** — chủ dự án đã chốt 2026-07-14.

### #1 — Mô hình giao file kết xuất → **CHỐT (A): Ghi R2 + trả link tải**
- **(A) ✅ CHỐT — Ghi R2 + trả liên kết tải (stream từ R2).** Đồng nhất mọi kích thước, không giữ file trong RAM Worker (đúng checklist U7 + ADR 265), không kéo Queue/Workflow (giữ U9 nguyên vẹn). Client gọi 2 nhịp (tạo → tải). *Kiểm chứng:* test #6/#8.
- ~~(B)~~ stream nhỏ + R2 lớn — *không chọn* (hai nhánh code + phải chọn ngưỡng).
- ~~(C)~~ chỉ stream, hoãn R2 — *không chọn* (bỏ tiêu chí "file lớn lưu R2" của checklist U7).

### #2 — Thư viện sinh `xlsx` trên Workers → **CHỐT (A): thư viện nhẹ + spike kiểm chứng**
- **(A) ✅ CHỐT — thư viện thuần JS nhẹ, không phụ thuộc Node builtin, GATE bằng spike Miniflare.** Ứng viên (đều **CHƯA KIỂM CHỨNG** cho tới khi spike xanh): `write-excel-file` (nhẹ, ESM), hoặc tự dựng SpreadsheetML + `fflate` (kiểm soát tối đa, phải viết reader để test đọc lại). **Chốt cuối cùng sau khi spike sinh+đọc-lại xanh dưới `vitest-pool-workers`** — spike là cổng bắt buộc, thất bại thì đổi ứng viên. CSV không cần thư viện.
- ~~(B)~~ SheetJS `xlsx` — *không chọn* (bản npm không còn là kênh phân phối được bảo trì + tiền sử CVE → rủi ro chuỗi cung ứng).
- ~~(C)~~ chỉ CSV, hoãn xlsx — *không chọn* ("định dạng tiền" chỉ đo được trên xlsx = tiêu chí lõi U7).

### #3 — `ttxly`/`tthai` trong file → **CHỐT (A): MÃ số như U6**
- **(A) ✅ CHỐT — xuất MÃ (số) như U6 lưu, kèm `chieu`/`nguon` (đã là text).** Không tạo nguồn sự thật thứ hai (U6 đã hoãn nhãn); nhất quán API. Nhãn hiển thị để tầng frontend/bảng tham chiếu sau.
- ~~(B)~~ nhúng bảng nhãn tiếng Việt — *không chọn* ở U7 (tránh nguồn sự thật thứ hai; để một bảng nhãn dùng chung ra đời đúng tầng sau).

### #4 — Ghi `audit_log` cho "xuất dữ liệu" ở U7 → **CHỐT (A): ghi audit tối thiểu**
- **(A) ✅ CHỐT — ghi một dòng audit tối thiểu (append) mỗi lần export.** `security.md` buộc audit cho "xuất dữ liệu"; bảng `audit_log` đã có (U4). Ràng buộc append-only đầy đủ + taxonomy + masking vẫn để **U12**. *Kiểm chứng:* test #10 (bắt buộc).
- ~~(B)~~ hoãn toàn bộ audit sang U12 — *không chọn* (endpoint xuất dữ liệu "trần" về truy vết trong khi đã chạy thật từ U7).

---

**Bàn giao.** Kế hoạch **đã rà soát + chốt 4 quyết định**. Bước kế tiếp: `/write-prompt U7` (sinh prompt thực thi) → `/start-unit U7`.
> ⚠️ Lưu ý cho `/write-prompt`: đưa **spike kiểm chứng thư viện xlsx dưới `vitest-pool-workers`** thành bước đầu tiên (cổng chặn `xlsx.ts`); `csv.ts` + `rows.ts` + route CSV làm trước, không phụ thuộc spike.

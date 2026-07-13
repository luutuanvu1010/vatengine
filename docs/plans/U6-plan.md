# Kế hoạch — U6: REST API tra cứu + lọc + tổng hợp

> Sản phẩm của `/plan-unit U6`. **Không viết code hiện thực** — chỉ kế hoạch để rà soát trước khi `/write-prompt U6` → `/start-unit U6`.
> Ngày: 2026-07-14. Nguồn "làm gì": `KIEN_TRUC_VA_KE_HOACH.md` **mục 7** (mô hình + logic dữ liệu), **11** (stateless), **12 GĐ1** + **12b P3/P4** (tra cứu lịch sử nhiều kỳ, lọc linh hoạt). "Làm thế nào": `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng 104 (U6). Luật áp dụng: `multi-tenant.md`, `security.md`, `testing.md` (KHÔNG đụng `gdt-adapter.md` — xem "Tiền đề").
>
> **Tiền đề đã kiểm chứng — TÁI DÙNG, KHÔNG dựng lại:**
> - Schema U4 (`e7c187d`): `hoa_don` (khóa tự nhiên 6 trường, cột nghiệp vụ đầy đủ 7.1, `raw_json` JSONB, `chieu`/`nguon`, `ttxly`/`tthai` số nguyên), RLS `ENABLE+FORCE` mọi bảng, helper `withTenant(db, tenantId, fn)` đặt `SET LOCAL app.tenant_id`, `tenantIsolationPolicy` lọc `app.tenant_id`.
> - U5 (`6311622`) đã **persist** `hoa_don` qua `sync()`. **U6 chỉ ĐỌC dữ liệu đã lưu** — không gọi lại máy chủ thuế (đúng GĐ1/P3: "tra cứu lịch sử nhiều kỳ mà không cần gọi lại máy chủ thuế").
> - **U6 KHÔNG chạm cấu trúc API thuế, KHÔNG gọi `GdtTransport`/`fetch()` ra GDT** → `gdt-adapter.md` không áp dụng; không có rủi ro egress/rate-limit/circuit-breaker trong U6.
>
> **✅ HAI QUYẾT ĐỊNH ĐÃ CHỐT (chủ dự án, 2026-07-14):**
> - **#1 — Xác thực/`tenant_id`: PHƯƠNG ÁN A.** Middleware xác minh **JWT nội bộ** (`hono/jwt`, HS256, khóa `env.JWT_SECRET`) trích claim `tenant_id`; U6 chỉ *verify*, phát hành token + RBAC + quản lý người dùng để **U8** mở rộng trên cùng seam. (Giải quyết hard-stop `multi-tenant.md` — không giả định thầm.)
> - **#2 — `GET /invoices/:id`: HEADER TỪ DB.** Không kèm dòng hàng; đồng bộ + tra cứu `dong_hang_hoa` tách thành pass sau (dùng lại `getInvoiceDetail`+`mapDetailLines` U3). U6 KHÔNG chạm GDT/token.

## Phạm vi

Tạo package tra cứu thuần `packages/query` (`@vat/query`) — các hàm đọc `hoa_don` theo `tenant_id`: **liệt kê + lọc + phân trang + tổng hợp** — và nối chúng thành **REST API** trong `apps/api` (Hono) qua binding **Hyperdrive → Postgres**, sau một **middleware xác thực** trích `tenant_id` (phương án A). Mọi truy vấn chạy trong `withTenant` (RLS lớp 2) và lọc `tenant_id` **tường minh** (lớp 1). API **phi trạng thái** (mục 11).

Ba nhóm năng lực (khớp "tra cứu + lọc + tổng hợp"):
- **Tra cứu (list)** `GET /invoices` — trả danh sách hóa đơn header của tenant, phân trang.
- **Lọc (filter)** — tham số truy vấn: `chieu` (purchase|sold), khoảng `tdlap` (`tuNgay`/`denNgay`), `ttxly`, `tthai`, `nbmst`, `nmmst`, `nguon` (normal|sco); sắp theo `tdlap` giảm dần (mặc định).
- **Tổng hợp (summary)** `GET /invoices/summary` — trên **cùng bộ lọc**: `count` + `sum(tgtcthue)`, `sum(tgtthue)`, `sum(tgtttbso)`, gom theo `chieu` (và tùy chọn theo `ttxly`).
- **Chi tiết một hóa đơn (header)** `GET /invoices/:id` — trả một hóa đơn (header) theo `id` trong phạm vi tenant. **Dòng hàng (`dong_hang_hoa`) — xem "Điểm mơ hồ #2".**

**NGOÀI phạm vi (nêu rõ để không lấn):**
- **Không** gọi máy chủ thuế / `GdtTransport` — U6 đọc dữ liệu đã đồng bộ. Kéo hóa đơn mới là `sync()` (U5) + đồng bộ nền (U9).
- **Không** hệ thống xác thực đầy đủ: đăng nhập người dùng nội bộ, phát hành JWT, RBAC, quản lý người dùng → **U8**. U6 chỉ **xác minh** JWT sẵn có + trích `tenant_id` (phương án A) — đủ để endpoint không "trần" (security.md), phần còn lại U8 mở rộng trên cùng seam.
- **Không** kết xuất Excel/CSV/XML/PDF → **U7** (U6 trả JSON).
- **Không** đồng bộ nền/Queue/Workflow/Durable Object → **U9**.
- **Không** module đối chiếu (lệch thuế, HĐ hủy/thay thế) → **U10**.
- **Không** bảng tra cứu nhãn `ttxly`/`tthai` tiếng Việt — U6 trả **mã số** như U4/U5 lưu; ánh xạ nhãn hiển thị để tầng frontend hoặc một bảng tham chiếu sau (tránh tạo nguồn sự thật thứ hai ở U6).
- **Không** đổi schema/migration U4; **không** sửa `Makefile` (root đã delegate `--workspaces`).

## File sẽ tạo/sửa

**Mới — package `packages/query` (`@vat/query`) — logic nghiệp vụ, phủ test ≥ 80%:**
- `packages/query/package.json` — deps: `@vat/db`, `drizzle-orm`, `zod`; dev: `@electric-sql/pglite`, `vitest`, `typescript`. Scripts `test`/`typecheck` như `packages/sync`.
- `packages/query/tsconfig.json`, `packages/query/vitest.config.ts` — node + PGlite offline, coverage v8 ngưỡng 80%, `exclude` `src/index.ts` (wiring thuần).
- `packages/query/src/filters.ts` — `InvoiceFilter` (Zod schema) + `buildWhere(tenantId, filter)`: dựng mệnh đề Drizzle `and(eq(tenantId), ...)` từ bộ lọc; **luôn** kèm `eq(hoaDon.tenantId, tenantId)` tường minh (multi-tenant.md); parse khoảng `tdlap` an toàn (fail-loud định dạng sai như `mapInvoice`).
- `packages/query/src/listInvoices.ts` — `listInvoices(db, tenantId, filter, page): Promise<{ rows, total }>`; generic trên `PgDatabase` (chạy PGlite trong test, pg/Hyperdrive khi chạy — mẫu `sync.ts`); phân trang `limit`/`offset` (chặn `limit` tối đa, ví dụ ≤ 200), sắp `tdlap desc`.
- `packages/query/src/getInvoice.ts` — `getInvoiceById(db, tenantId, id)`: một hàng header, lọc `tenant_id` + `id`; không thấy → `null` (route trả 404).
- `packages/query/src/summarize.ts` — `summarizeInvoices(db, tenantId, filter)`: `count` + `sum` các cột tiền, gom theo `chieu`. Trả tiền dạng **chuỗi** (`numeric` Postgres) — không ép float (tránh sai số như mục 7.1).
- `packages/query/src/index.ts` — export hàm + kiểu (`InvoiceFilter`, `InvoiceListResult`, `InvoiceSummary`).

**Sửa/thêm — `apps/api` (wiring, trừ khỏi ngưỡng coverage):**
- `apps/api/src/db.ts` *(mới)* — factory `getDb(env)`: production dựng `pg` `Pool({ connectionString: env.HYPERDRIVE.connectionString })` + `drizzle(pool)`; có **seam tiêm test** (nhận db PGlite qua env test) để integration test đi qua route thật, offline. (`nodejs_compat` đã bật trong `wrangler.jsonc`.)
- `apps/api/src/auth.ts` *(mới — theo phương án A)* — middleware Hono xác minh JWT nội bộ (dùng `hono/jwt`, HS256, khóa từ `env.JWT_SECRET`), trích claim `tenant_id` → `c.set("tenantId", ...)`. Thiếu/sai chữ ký/hết hạn → `401`. **KHÔNG** dùng token thuế (security.md). RBAC/phát hành token → U8.
- `apps/api/src/routes/invoices.ts` *(mới)* — route `GET /invoices`, `GET /invoices/summary`, `GET /invoices/:id`; validate query bằng Zod; lấy `tenantId` từ context; gọi `withTenant(db, tenantId, tx => …@vat/query…)`; map lỗi → mã HTTP (400 tham số sai, 404 không thấy, 401 do middleware).
- `apps/api/src/index.ts` *(sửa)* — mount `auth` middleware cho nhánh `/invoices` (giữ `/health` miễn xác thực — security.md); mount routes; mở rộng `interface Env` thêm `HYPERDRIVE`, `JWT_SECRET`.
- `apps/api/wrangler.jsonc` *(sửa)* — bật binding `hyperdrive` (id điền lúc deploy; dev qua `.dev.vars` `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING`/`DATABASE_URL`). `JWT_SECRET` là Workers Secret (không commit — security.md).
- `apps/api/package.json` *(sửa)* — thêm deps `@vat/db`, `@vat/query`, `zod`, `pg`, `drizzle-orm`; dev `@electric-sql/pglite`, `@types/pg`. Thêm script chạy nhóm `integration` nếu tách thư mục.
- `apps/api/.dev.vars.example` *(sửa)* — mẫu `DATABASE_URL`/`JWT_SECRET` (file thật trong `.gitignore`).

**Test:** `packages/query/test/unit/filters.test.ts`, `packages/query/test/integration/{listInvoices,summarize,getInvoice}.test.ts`, `apps/api/test/integration/invoices.route.test.ts` (+ `apps/api/test/unit/auth.test.ts`).

**Sửa tài liệu:** `docs/CHECKLIST-NGHIEM-THU.md` (mục U6), `README.md` nếu thêm cách chạy/endpoint, root `package.json`/lockfile (deps mới).

## Test viết trước (TDD)

Nhóm theo `.claude/rules/testing.md`. `make test` = `unit` + `integration` (đều offline; PGlite = Postgres WASM như U4/U5). Không mạng thật — U6 vốn không gọi GDT.

**`unit`** (offline, không DB):
1. `filters.ts`: Zod chấp nhận bộ lọc hợp lệ; từ chối `chieu`/`nguon` ngoài tập; khoảng `tdlap` sai định dạng → lỗi rõ (fail-loud); `buildWhere` **luôn** chứa điều kiện `tenant_id` kể cả khi bộ lọc rỗng.
2. `auth.ts` (phương án A): JWT hợp lệ → set `tenantId`, cho qua; thiếu header/sai chữ ký/hết hạn → `401`; token **không** có claim `tenant_id` → `401` (không đoán tenant).

**`integration`** (PGlite; seed ≥ 2 tenant + hóa đơn hai chiều):
3. `listInvoices`: trả đúng hóa đơn của tenant hiện tại; phân trang (`limit`/`offset`) đúng `total` + số dòng; sắp `tdlap desc`.
4. Lọc: theo `chieu`, khoảng `tdlap`, `ttxly`, `nbmst`, `nguon` — mỗi tiêu chí thu hẹp đúng tập; kết hợp nhiều tiêu chí giao nhau đúng.
5. `getInvoiceById`: thấy trong tenant → trả header; `id` của tenant khác → `null`.
6. `summarizeInvoices`: `count` + `sum` tiền khớp seed; gom theo `chieu` đúng; tiền trả **chuỗi**, cộng đúng trên số lớn (không sai số float).
7. **Cách ly tenant qua route API** *(bắt buộc — `multi-tenant.md`)*: dựng app thật + db PGlite tiêm; JWT của tenant A gọi `GET /invoices` (và `/summary`, `/:id`) → **chỉ** thấy dữ liệu A, **không** thấy/không tổng hợp lẫn dữ liệu B; `GET /invoices/:idCủaB` bằng JWT A → `404`.
8. Route: query param sai → `400`; không có/hỏng JWT → `401`; `/health` vẫn `200` **không** cần JWT.

## Tiêu chí nghiệm thu

- Toàn bộ test trên **đỏ→xanh**; `make lint` sạch (`tsc --noEmit` + Biome); coverage `packages/query` ≥ 80% (trừ `src/index.ts`); logic route trong `apps/api` có integration test đi qua đường thật.
- Có **ít nhất một** test cách ly tenant qua API (test #7) — tenant A không đọc/không tổng hợp được dữ liệu B.
- Mọi truy vấn đọc chạy trong `withTenant` **và** lọc `tenant_id` tường minh; không có truy vấn "lấy tất cả rồi lọc ở app".
- Không log token/JWT/`raw_json` nhạy cảm mức INFO+; `JWT_SECRET`/connection string không commit (security.md).
- `/health` miễn xác thực; mọi endpoint `/invoices*` đòi JWT hợp lệ (phương án A).
- API phi trạng thái (không giữ state giữa request); tiền trả dạng chuỗi (không mất chính xác).
- Cập nhật `docs/CHECKLIST-NGHIEM-THU.md` mục U6.

## Ràng buộc bắt buộc chạm tới

- **`tenant_id`/RLS (multi-tenant.md) — trọng tâm U6:** lọc tường minh (lớp 1) + `withTenant`/RLS `FORCE` (lớp 2); test cách ly tenant qua API bắt buộc; role app kết nối Hyperdrive **không** superuser (đã ghi ở U4 `_rls.ts`) — nhắc trong ghi chú deploy.
- **Xác thực (security.md):** mọi endpoint ngoài trừ `/health` phải xác thực JWT **nội bộ** (không phải token thuế); không lưu mật khẩu thô (U6 không chạm credential thuế); bí mật qua Workers Secrets.
- **Khóa tự nhiên/idempotent:** U6 chỉ đọc — không upsert; không đổi khóa tự nhiên. (Ràng buộc thuộc U5, nêu để xác nhận U6 không vi phạm.)
- **Cô lập adapter / 401 GDT / captcha:** **không áp dụng** — U6 không gọi GDT.
- **Stateless (mục 11):** không state trong Worker; việc nặng (kết xuất lớn) là U7/nền.

## Rủi ro & phụ thuộc

- **[QUYẾT ĐỊNH] Cơ chế `tenant_id`/auth** — hard-stop, xem "Điểm mơ hồ #1". Chặn phần `apps/api` cho tới khi chốt; phần `packages/query` (thuần, nhận `tenantId` tham số) **không** bị chặn và có thể làm trước.
- **Binding Hyperdrive chưa tạo:** cần Postgres thật + `wrangler hyperdrive create` lúc deploy. **Không chặn dev/test** (test dùng PGlite tiêm). Ghi chú: cần seam tiêm db để integration test đi qua route thật offline.
- **`pg` trên Workers:** cần `nodejs_compat` (đã bật) + đi qua Hyperdrive (TCP). Xác minh ở U6 khi wiring; test không phụ thuộc (PGlite).
- **Giới hạn Workers (CPU 5'/wall 15'):** truy vấn tra cứu nhẹ; chặn `limit` tối đa + phân trang để không kéo tập lớn; kết xuất khối lớn để U7/nền.
- **Phụ thuộc thứ tự:** U6 (API) đứng **trước** U8 (auth đầy đủ) trong lộ trình → sinh ra "Điểm mơ hồ #1".

## Điểm mơ hồ — ĐÃ CHỐT (Hiến pháp §"Khi gặp mơ hồ" + multi-tenant.md)

### #1 (HARD-STOP) — Cơ chế xác định `tenant_id` / xác thực cho U6 → **CHỐT (A)**
Lộ trình đặt U6 (REST API) **trước** U8 (auth người dùng nội bộ + RBAC + đa tenant). `multi-tenant.md` buộc: "endpoint mới chưa rõ cách xác định `tenant_id` → dừng và hỏi". Chủ dự án đã chốt **(A)** (2026-07-14):
- **(A) ✅ CHỐT:** middleware xác minh **JWT nội bộ** (`hono/jwt`, HS256, khóa `env.JWT_SECRET`), trích claim `tenant_id`. U6 chỉ *verify*; phát hành token + RBAC + quản lý người dùng để **U8** mở rộng trên cùng seam. Kiểm chứng bằng test cách ly tenant qua API (#7) + test auth (#2 unit).
- ~~(D)~~ chỉ giao package `@vat/query`, hoãn route+auth sang U8 — *không chọn*.
- ~~(B)~~ Cloudflare Access + header danh tính — *không chọn* (không hợp API tenant tự phục vụ quy mô lớn).
- ~~(C)~~ làm U8 trước U6 — *không chọn* (lệch thứ tự, phạm vi lớn hơn).

### #2 — `GET /invoices/:id` kèm dòng hàng (`dong_hang_hoa`)? → **CHỐT: HEADER TỪ DB**
U5 **chưa persist** `dong_hang_hoa` (quyết định #B của U5 — chỉ header). Lấy dòng hàng "sống" phải gọi `getInvoiceDetail` (adapter U3) + cần token thuế → kéo `gdt-adapter.md`/token vào U6, phình phạm vi.
- ✅ **CHỐT:** U6 trả **header từ DB** (không kèm dòng hàng). Đồng bộ + tra cứu dòng hàng tách thành một pass sau (dùng lại `getInvoiceDetail`+`mapDetailLines` của U3), không thuộc U6.

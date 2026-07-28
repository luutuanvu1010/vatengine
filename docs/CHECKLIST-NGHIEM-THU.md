# Checklist nghiệm thu theo mốc (U0–U12)

Tài liệu **sống** để theo dõi tiến độ và làm **bộ tiêu chuẩn thông qua** cho từng bước lớn. Nguồn: `TRIEN_KHAI_BANG_CLAUDE_CODE.md` (mục 3 — đơn vị vòng lặp) và `CLAUDE.md` (Definition of Done). Tiêu chí đã điều chỉnh theo ngăn xếp Cloudflare/TypeScript (ADR-0001).

> Quy tắc thông qua: một mốc chỉ được đánh `✅ ĐẠT` khi **toàn bộ** tiêu chí riêng của nó **và** Definition of Done chung (mục A) đều xanh. Nếu thiếu bất kỳ mục nào → **chưa đạt, tự vòng lại** bước thực thi cho tới khi đủ.

## Trạng thái tiến độ (đọc trước tiên)

> **Cập nhật: 2026-07-14 · U10 xong (commit đi kèm thay đổi này) · nhánh `feat/cloudflare-stack-u0`.**
>
> `U0 ✅` · `U1 ✅` · `U2 ✅` · `U3 ✅` · `U4 ✅` · `U5 ✅` · `U6 ✅` · `U7 ✅` · `U8 ✅` · `U9 ✅` · `U10 ✅` · `U11 ✅` · `U12 ✅` · **`U13 ✅ Giám sát`** · `U14 ⬜ THIẾT KẾ (login/token)` · `U15 ⬜ KẾ HOẠCH (Frontend)`
>
> **Cập nhật kế hoạch 2026-07-14:** bổ sung **cụm `U15` — Frontend (Tầng trình bày)** để khép **lớp thứ ba** mà U0–U12 (Backend + Xử lý/Dữ liệu) cố ý chưa phủ. Trạng thái: **kế hoạch, chưa hiện thực** — đặc tả đầy đủ ở `docs/plans/U15-plan.md`. U15 là một cụm chạy qua 6 lát cắt U15.0→U15.5, thuần frontend trên API `apps/api` (U6–U11), KHÔNG gọi GDT/không thêm endpoint backend.
>
> **Sửa lỗi 2026-07-15 — (1) thiếu tên sản phẩm & (2) không tải hóa đơn máy tính tiền** (chẩn đoán `docs/CHAN-DOAN-thieu-truong-va-mtt.md`, giải pháp `docs/GIAI-PHAP-thieu-truong-va-mtt.md`, 4 đơn vị commit riêng):
> - **Bằng chứng sơ cấp (quan sát trực tiếp trên GDT, MST 4201969169, 2026-07-15):** hóa đơn máy tính tiền (7048–7053, ký hiệu `C26MYY`) **TỒN TẠI và tra cứu được**; chi tiết 7048 có **dòng hàng thật** ("VW tiêu chuẩn NL/TE"). ⇒ cả hai lỗi nằm **100% phía phần mềm**, không phải thiếu dữ liệu. **Lưu ý phạm vi bằng chứng:** đây là quan sát chứng minh **DỮ LIỆU tồn tại** trên portal — **KHÔNG** phải kiểm chứng **hình dạng response** của endpoint `sco-query/detail` qua adapter (vẫn cần contract test thật với token tài khoản có máy tính tiền — xem mục "Nợ kiểm chứng còn treo" bên dưới, giữ nguyên nhãn).
> - **ĐV1 (`packages/gdt-client`):** nhánh `sco` KHÔNG còn nuốt lỗi im lặng — chỉ bỏ qua HTTP 404 (hoặc 200+datas rỗng); mọi lỗi khác (400/5xx/timeout) ném `GdtError`. Gỡ nhãn giả định "CHƯA KIỂM CHỨNG" cũ (nuốt lỗi) — thay bằng dẫn chứng quan sát. `GdtError.httpStatus` mới để phân biệt.
> - **ĐV2 (`packages/db`):** thêm trạng thái `hoan_thanh_mot_phan` + hằng dùng chung `TRANG_THAI_LAN_DONG_BO` + migration `0004` (COMMENT, không CHECK cứng).
> - **ĐV3 (`packages/sync` + `apps/sync-worker`):** pipeline đồng bộ **nay lấy dòng hàng** (nối `getInvoiceDetail`+`mapDetailLines`) và lưu `dong_hang_hoa` **idempotent** (Quyết định C: xóa-chèn theo `hoadon_id` trong `withTenant`). **Fallback đồng bộ (§1.1)**: lấy detail tuần tự (concurrency 1) trong pha 1 + backoff adapter; **GIỚI HẠN đã ghi rõ:** detail CHƯA đi qua `TenantLimiter` theo từng request (chỉ 1 permit/job) — rate-limit per-request là kiến trúc queue 2 pha thật, **TODO** (primitive `persistInvoiceLines` đã tách sẵn để migrate).
> - **ĐV4 (`packages/query` + `apps/api` + `apps/web`):** `GET /invoices/:id` trả kèm `dongHangHoa` (lọc tenant_id tường minh + RLS); `InvoiceDetailPage` render bảng dòng hàng. **Thay thế** hai quyết định phạm vi cũ: U5 **#B "không dong_hang_hoa"** và U6 **#2 "chỉ header"** (nay đã có dòng hàng).
>
> **U26 (2026-07-17) — Queue 2 pha dòng hàng + backfill (`docs/plans/U26-plan.md`) — TRẢ NỢ TODO của ĐV3:** fallback detail-inline ở production bị GỠ (bằng chứng prod 2026-07-16: 2029 HĐ/0 dòng hàng, 170/188 lần sync FAILED vì GDT 429 + "Too many subrequests" — BACKLOG). Pha 1: `sync()` chỉ header, trả `detailCandidates` (mới ∪ đổi trạng thái ∪ **đang thiếu dòng hàng** — tự lành); worker enqueue 1 message `kind:"detail"`/HĐ vào cùng queue `vat-sync` (tương thích lùi: message không `kind` = header). Pha 2: `runDetailJob` — **1 permit `TenantLimiter`/request**, `getInvoiceDetail`(`maxAttempts:2`) → `persistInvoiceLines` idempotent; 429 → reenqueue delay (backpressure, nuôi breaker); 401 → token chết + ack; sco+404 → ack có cảnh báo (nhãn CHƯA KIỂM CHỨNG giữ nguyên); 5xx/DB → retry → DLQ. Header 429 cũng tách nhãn `failureKind='rate_limited'` → backpressure (hết retry-không-delay). Backfill: `POST /tax-accounts/:id/backfill-lines` enqueue cho mọi HĐ thiếu dòng hàng (trần 4000/lần, `conLai>0` → gọi lại; audit `backfill_dong_hang`). Điểm inject `SyncOptions.fetchDetail` GIỮ NGUYÊN cho test (2 test regression 2026-07-15 xanh nguyên assertion). **Ngữ nghĩa giữ nguyên:** `lan_dong_bo='completed'` = header xong (nền của U22 B3/B6) — dòng hàng về sau bất đồng bộ.
>
> **Đã xong — GDT Adapter tầng đọc hoàn chỉnh (`packages/gdt-client`):** U0 khung monorepo/CI; U1 captcha + authenticate; U2 query purchase/sold + phân trang `state` + gộp sco + khử trùng; U3 detail dòng hàng + thuế suất. **Bốn nhóm endpoint (captcha, authenticate, query, detail) đã KIỂM CHỨNG THẬT** (probe live, ADR-0001 Amendment #3–#6); egress **T0 thuần Cloudflare** hoạt động (relay VN/T1 **TREO**).
>
> **Đã xong — U4 (Mô hình dữ liệu + migration, `packages/db` = `@vat/db`):** lược đồ Drizzle 7 thực thể (mục 7.1); khóa tự nhiên **6 trường** UNIQUE `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`; `raw_json` JSONB; **RLS `ENABLE` + `FORCE`** theo `tenant_id` (ràng buộc cả owner). Kiểm bằng **PGlite offline** (14 test: ràng buộc + cách ly tenant owner/non-owner), coverage 100%. `make migrate` = `drizzle-kit migrate` (cần `DATABASE_URL` thật; test dùng PGlite nên không chặn).
>
> **Đã xong — U5 (Dịch vụ đồng bộ idempotent, `packages/sync` = `@vat/sync`):** `sync()` gọi adapter → upsert theo khóa tự nhiên 6 trường lên `hoa_don` (trong `withTenant` để RLS chốt tenant) → ghi `lan_dong_bo`; idempotent (chạy lại không nhân đôi), cập nhật `ttxly`/`tthai` (không tạo mới), đếm mới/cập nhật, 401 dừng + ghi `failed` (không retry credential), không ghi dở dang khi lỗi giữa chừng. **Định dạng `tdlap` ISO-8601 UTC đã kiểm chứng** (ADR-0001 Amendment #7) — mapper lưu nguyên thời khắc UTC, không tự quy đổi múi giờ. Kiểm bằng **PGlite offline** (14 test: idempotent/cập nhật/đếm/lịch sử/cách ly tenant/401). Quyết định phạm vi: **#A (e) thông báo HOÃN** (U5 chỉ phát hiện, trả `SyncResult.changes`, không dựng bảng); **#B chỉ cấp hóa đơn** (không `dong_hang_hoa`).
>
> **Đã xong — U6 (REST API tra cứu + lọc + tổng hợp, `packages/query` = `@vat/query` + `apps/api`):** Hono nối `@vat/query` (list/summary/get-one) qua Hyperdrive→Postgres, sau middleware xác minh **JWT nội bộ HS256** trích `tenant_id`. Đọc dữ liệu **đã đồng bộ** (KHÔNG gọi GDT). Cách ly tenant hai lớp (lọc `tenant_id` tường minh + `withTenant`/RLS) — có test cách ly **qua route API**. Kiểm bằng **PGlite offline** (42 test: lọc/phân trang/tổng hợp/get-one/401/400/404/cách ly). Quyết định: **(A)** verify JWT nội bộ (phát hành + RBAC → U8); **(#2)** `/invoices/:id` chỉ header từ DB (không dòng hàng). Xem `docs/plans/U6-plan.md`.
>
> **Đã xong — U7 (Kết xuất Excel/CSV, `packages/export` = `@vat/export` + `apps/api`):** renderer thuần (mẫu cột chuẩn duy nhất, `csv` + `xlsx` tự dựng SpreadsheetML + `fflate`) + nạp keyset trên `@vat/query` + `POST /exports` ghi **R2** (CSV stream thật, không giữ cả file trong RAM) → trả link, `GET /exports/:id` tải giới hạn tenant qua tiền tố key. Tiền giữ **chuỗi numeric** (không ép float); ô tiền xlsx `numFmt "#,##0"`. Audit `export` (chốt #4). Kiểm bằng **PGlite + R2 giả offline** (59 test; coverage `@vat/export` 100% dòng, `apps/api` 100% dòng); **spike workerd thật** xác minh encoder xlsx chạy không cần `nodejs_compat` (`spikes/xlsx-workers`). Quyết định (chủ dự án 2026-07-14): #1 R2+link · #2 thư viện nhẹ+spike · #3 ttxly/tthai MÃ số · #4 audit tối thiểu. Xem `docs/plans/U7-plan.md`.
>
> **Đã xong — U8 (Auth người dùng nội bộ + RBAC + đa tenant, `apps/api` + `@vat/db`):** `POST /auth/login` (email+mật khẩu) băm/so khớp **PBKDF2 qua WebCrypto** (workerd-safe, không Node bcrypt) → phát hành **JWT nội bộ HS256** mang `tenant_id`+`role` (vòng đời 8h). **RBAC 3 vai** `ke_toan`/`ke_toan_truong`/`quan_tri` (nguồn chân lý `rbac.ts`), vai trong claim JWT (quyết định #3); `requireRole` gác: đọc `/invoices*` = cả 3 vai, kết xuất `/exports*` = kế toán trưởng+quản trị (`ke_toan` → **403**). 401 (xác thực) vs 403 (ủy quyền) phân biệt rạch ròi. **Cách ly tenant giữ nguyên**: token gắn đúng 1 tenant, `quan_tri` của A KHÔNG chạm dữ liệu B (test qua route). **Login vs RLS**: login xảy ra TRƯỚC khi biết tenant nhưng `nguoi_dung` bật FORCE RLS ⇒ tra cứu qua hàm **SECURITY DEFINER `auth_lookup_user`** (owner role `auth_lookup` NOLOGIN+BYPASSRLS, bề mặt hẹp, **least-privilege: REVOKE PUBLIC**, chỉ cấp EXECUTE tường minh cho role app — sửa từ security-reviewer). `email` UNIQUE toàn cục. Kiểm bằng **PGlite offline** (apps/api 47 test, coverage 100% dòng; db test `(U8-14)` chứng minh hàm vượt RLS dưới role non-superuser + chặn role không được cấp). Quyết định (chủ dự án 2026-07-14): #1 login email+mật khẩu PBKDF2 · #2 RBAC 3 vai · #3 role trong claim JWT · #4 tra cứu login qua SECURITY DEFINER + email toàn cục. Xem `docs/plans/U8-plan.md`.
>
> **Nợ vận hành U8 (điều kiện tiên quyết production, CHƯA KIỂM CHỨNG trên DB thật — cùng lớp với nợ Hyperdrive U6):** provision role app (Hyperdrive) rồi `GRANT EXECUTE ON FUNCTION auth_lookup_user(text)` cho nó; role `auth_lookup` BYPASSRLS có thể cần quyền admin của Neon/Supabase khi tạo.
>
> **Đã xong — U9 (Đồng bộ nền theo lịch, `apps/sync-worker` = `@vat/sync-worker`):** Cron→Queues→consumer→`runScheduledSync`→`sync()` (U5) + Durable Object `TenantLimiter` (token-bucket + circuit breaker theo tenant/MST). Điều phối một job: **pre-flight token** (quyết định #1 — chỉ token còn hạn; hết hạn → ghi `lan_dong_bo`=`can_dang_nhap_lai` + audit, **0 call GDT, KHÔNG captcha**) → limiter → `sync()` → phân loại outcome dựa **`SyncResult.failureKind`** (mới): `transient`→`retry` (queue thử lại, trần `max_retries`→DLQ), `session_expired`→đánh dấu token chết + audit, KHÔNG retry. Idempotent kế thừa upsert U5 (test e2e chạy 2 lần không nhân đôi). `tenant_id` **tường minh** trong mỗi message; mọi truy cập tenant-scoped (`withTenant`), ca cách ly tenant qua role non-superuser + RLS FORCE. Logic (schedule/runJob/rateLimiter/recorder) test **PGlite/thuần offline** (27 test `@vat/sync-worker`, coverage 98.8% dòng, mọi file logic ≥ 80%); Cron/Queue/DO là wiring kiểm khi deploy. **Sai lệch có chủ đích (drift, xem `docs/plans/U9-plan.md`):** (+) `@vat/sync` phơi `failureKind` (thay vì dò chuỗi lỗi); (+) `@vat/gdt-client` thêm `createDirectCfTransport` (egress T0 — điểm gọi GDT duy nhất, `gdt-adapter.md`). Quyết định (chủ dự án 2026-07-14): #1 chỉ token còn hạn · #2 worker riêng · #3 DO tối thiểu · #4 cửa sổ trượt, không bảng lịch. Xem `docs/plans/U9-plan.md`.
>
> **Nợ vận hành U9 (điều kiện tiên quyết production):** kết nối lập lịch của `sync-worker` (`listActiveTenantIds`) cần quyền **control-plane** đọc sổ đăng ký `tenants` — RLS keyed theo `id` khiến role app tenant-scoped fail-closed (0 hàng); phải tách vai control-plane khỏi đường dữ liệu per-tenant. Bindings deploy: `wrangler queues create vat-sync` (+ DLQ `vat-sync-dlq`), Hyperdrive id thật, migration DO `TenantLimiter`. Cùng lớp nợ với Hyperdrive/role app U6/U8.
>
> **Nợ kiểm chứng còn treo (KHÔNG chặn U4, gắn nhãn `CHƯA KIỂM CHỨNG` trong mã):** `DETAIL_ENDPOINTS.sco` (`/api/sco-query/invoices/detail`) + mã thuế đặc biệt `KCT`/`KKKNT` — cần probe một HĐ máy tính tiền / HĐ có mã đặc biệt; `/api/sco-query/invoices/sold` (suy từ đối xứng). Khi probe được, gỡ nhãn + cân nhắc nâng hợp đồng `invoice_detail`/`invoice_envelope` từ mềm sang raise cứng (`.claude/rules/gdt-adapter.md`).
>
> **Đã xong — U10 (Module đối chiếu, `packages/reconcile` = `@vat/reconcile` + `apps/api`):** `reconcile()` đọc-only trên hóa đơn đã đồng bộ (KHÔNG gọi GDT), findings tính **on-read** (không bảng mới). Ba kiểm tra: **lệch thuế** (số học nội tại header `tgtcthue − ttcktmai + tgtthue = tgtttbso`, tính trong **SQL `numeric`** không ép float, dung sai cấu hình); **thiếu số HĐ đầu ra** (khoảng trống dãy `shdon` theo `(nbmst, khhdon)`, chỉ `chieu='sold'`); **hủy/thay thế** (cơ chế phân loại tách khỏi giá trị mã — `classifyStatus(row, map)`). `GET /reconcile` sau `requireTenant` + RBAC 3 vai, cách ly tenant hai lớp (`buildWhere` lọc `tenant_id` + `withTenant`/RLS) — test qua route thật. Kiểm bằng **PGlite offline** (28 test `@vat/reconcile` + 5 route; coverage 100% dòng / 89% nhánh). **Nguyên tắc bằng chứng:** từ **2026-07-28** (U36.1) map production chốt `thayThe.tthai = [4]` theo `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md`; mã **hủy** pháp lý và MỌI `ttxly` vẫn **RỖNG** (chưa có bằng chứng). Cổng guard `statusCodes.contract.test.ts` khóa cả ba điều đó — đỏ nếu ai điền thêm mã chưa probe. Quyết định (chủ dự án 2026-07-14): #1 HĐ thiếu = gap dãy đầu ra · #2 hủy/thay thế = cơ chế + bảng mã chờ xác nhận · #3 lệch thuế = số học nội tại header. Xem `docs/plans/U10-plan.md`.

## Vòng lặp mỗi mốc

```
   ĐỌC nhiệm vụ + mục tiêu        →  /plan-unit U#     (đọc spec, ra kế hoạch)
        │
        ▼
   RA KẾ HOẠCH + (viết prompt)    →  /write-prompt U#  (tùy chọn)
        │
        ▼
   THỰC THI (TDD)                 →  /start-unit U#
        │
        ▼
   ĐỐI CHIẾU TIÊU CHUẨN           →  /verify  +  /qa-unit
        │
   ┌────┴─────┐
   │  ĐẠT?    │── chưa ──▶ vòng lại THỰC THI (sửa tới khi đủ tiêu chí)
   └────┬─────┘
     đạt │
        ▼
   THÔNG QUA + commit → sang mốc kế tiếp
```

Cổng kỹ thuật `.claude/hooks/gate-dod.sh` ép `make lint && make test` phải xanh mới cho đóng lượt — đây là chốt chặn khách quan, không phụ thuộc thiện chí.

---

## A. Definition of Done chung (áp dụng cho MỌI mốc)

- [ ] Có test tự động phủ đúng tiêu chí nghiệm thu và **toàn bộ xanh** (`make test`).
- [ ] `make lint` sạch (Biome + `tsc --noEmit`).
- [ ] Không giảm coverage tầng nghiệp vụ dưới **80%**.
- [ ] Không lộ bí mật trong code/log (không mật khẩu thô, token, key).
- [ ] Mọi truy vấn dữ liệu gắn `tenant_id` (khi đã có tầng dữ liệu); khóa tự nhiên đủ trường.
- [ ] Mọi gọi mạng ra ngoài: timeout + retry backoff; **401 → dừng + báo hết phiên**.
- [ ] Tài liệu liên quan đã cập nhật nếu hành vi/kiến trúc đổi.
- [ ] Commit nhỏ, rõ, **chỉ một đơn vị**.
- [ ] `/qa-unit` không còn phát hiện lỗi **Critical** (`dod-auditor` luôn chạy; `contract-guardian`/`security-reviewer` khi liên quan).

---

## B. Mốc theo lộ trình

### ✅ U0 — Khung dự án + CI + skeleton test  ·  *ĐẠT (`make lint && make test` xanh trên máy — commit `757ec3a`)*

- [x] Monorepo npm workspaces (`apps/*`, `packages/*`) dựng xong.
- [x] `apps/api` (Worker Hono) có `/health`; test health-check.
- [x] `packages/gdt-client` giữ interface `GdtTransport` + endpoint (nguồn chân lý).
- [x] `Makefile` (bọc npm/Wrangler) + CI GitHub Actions.
- [x] `make lint` và `make test` xanh trên máy (xác nhận cuối cùng).

### 🗄️ U1a — Dựng relay VN + kiểm chứng egress `:30000`  ·  *BỎ — không cần, T0 thuần Cloudflare đã CHẠY (ADR-0001 Amendment #3, 2026-07-13)* · review: `security-reviewer` + `contract-guardian`

> ✅ **Đã kiểm chứng 2026-07-13 (Amendment #3):** phép thử quyết định gọi **đúng** `https://hoadondientu.gdt.gov.vn/api/captcha` từ biên Cloudflare thật (`wrangler dev --remote`) → **200 + JSON `{key,content}` hợp lệ**, 3 lần liên tiếp, từ colo nước ngoài (`HK`). ⇒ **T0 (thuần Cloudflare) CHẠY** cho API GDT thật. Mốc này **không cần thực hiện** — giữ lại checklist bên dưới làm bằng chứng lịch sử (nhánh đã cân nhắc, không phải việc còn phải làm), không xoá.
>
> *(Tiền đề cũ — giữ làm bằng chứng:) Amendment 2026-07-12 cho rằng biên Cloudflare không tới được API `:30000` nên cần relay VN + VPS. Tiền đề `:30000` đã bị chứng minh sai ở Amendment #2 (cổng chết); Amendment #3 xác nhận endpoint đúng `/api/captcha` không hề bị chặn.*

- [ ] ~~Relay **stateless** đặt tại VN (VPS Viettel/VNPT/FPT…); xác thực **mTLS + shared-secret**; chỉ Worker của dự án gọi được; không lưu/không log body (token, credential, `raw_json`) — theo `.claude/rules/security.md` mục "Relay VN (egress GDT)".~~
- [ ] ~~Từ **vantage VN thật**: `curl https://103.9.200.142:30000/captcha` (Host: `hoadondientu.gdt.gov.vn`) trả JSON hợp lệ `{key, content}`.~~
- [ ] ~~Worker gọi GDT **thành công qua relay** (`GdtTransport = vn-relay`): probe/`getCaptcha` qua relay trả về đúng payload.~~
- [ ] ~~Bí mật relay (khóa mTLS, shared-secret) nạp qua Workers Secrets/Secrets Store, không commit, xoay vòng được.~~
- [ ] ~~**Đo ngưỡng danh tính egress (ADR-0002):** xác định **đơn vị + con số thật** GDT siết một IP...~~ — chỉ cần lại nếu probe định kỳ trong tương lai phát hiện `GEO_BLOCKED` thật sự.

### ✅ U1 — GDT Adapter: captcha + authenticate  ·  review: `contract-guardian` + `security-reviewer` + `dod-auditor` — cả ba **PASS** (2026-07-13)

- [x] Mọi gọi GDT đi qua `GdtTransport` trong `packages/gdt-client` (không `fetch` trực tiếp nơi khác). Khẳng định bằng test chặn `globalThis.fetch` (`test/unit/auth.test.ts`).
- [x] `getCaptcha()` chỉ trả ảnh cho người dùng nhập — **không** tự giải/bypass (`src/captcha.ts`).
- [x] Đăng nhập thành công nghiệp vụ khi có `token`; xử lý sai captcha/mật khẩu (GDT có thể trả 200 kèm `message` lỗi, không có `token`) như lỗi nghiệp vụ, không phải lệch hợp đồng (`src/auth.ts`).
- [x] 401 → dừng, báo hết phiên (`GdtError` code `SESSION_EXPIRED`); không tự retry bằng credential cũ (`src/http.ts` không retry cho 401; khẳng định `callCount()===1`).
- [x] Contract test với phản hồi thật (endpoint công khai `/api/captcha`, `test/contract/captcha.contract.test.ts`, chạy mạng thật, khớp `gdt-contract-schema.json`).
- [x] `BASE` sửa từ `:30000` (sai) sang `https://hoadondientu.gdt.gov.vn` (`:443`), `CAPTCHA_PATH = /api/captcha` — ĐÃ KIỂM CHỨNG (ADR-0001 Amendment #3).
- [x] `make lint` sạch, `make test` xanh (25/25 unit + 2/2 apps/api), `make test-contract` xanh (1/1, gọi mạng thật).
- [x] Coverage `packages/gdt-client/src/*.ts` (trừ `index.ts` — wiring thuần): **99.29%** stmts/lines, 96.29% branch, 100% funcs — vượt ngưỡng 80% (`.claude/rules/testing.md`).
- [x] ✅ **AUTH_PATH ĐÃ KIỂM CHỨNG (2026-07-13):** probe đăng nhập thật (QĐ-2, runbook `docs/prompts/U1-probe-authenticate.md`) với tài khoản MST hợp pháp → **`httpStatus=200` + `{token}` (JWT), `hasToken=true`**, egress **`SG`** từ biên Cloudflare (T0, `wrangler dev --remote`). Người trực đọc/nhập captcha (**không** bypass); credential nạp ephemeral qua `.dev.vars`, **đã xoá ngay sau probe**; token **không** ghi lại (chỉ log bản che). Đã gỡ nhãn `CHƯA KIỂM CHỨNG` khỏi `endpoints.ts` (`AUTH_PATH`) + cập nhật `gdt-contract-schema.json` (`authenticate`); ghi vào ADR-0001 **Amendment #4**. Mã probe **tạm đã revert** (`git status` sạch).
- [ ] ⚠️ **Nợ kiểm chứng còn lại (chuyển sang U2):** `INVOICE_ENDPOINTS` (`/api/query/invoices/*` + `/api/sco-query/invoices/*`) **CHƯA KIỂM CHỨNG** — chỉ có unit test mock, chưa gọi thật. Giữ nhãn `CHƯA KIỂM CHỨNG` trong `endpoints.ts` cho tới khi kiểm chứng bằng gọi thật ở **U2** (query purchase/sold).

### ✅ U2 — Query purchase/sold + phân trang + gộp sco + khử trùng · review: `contract-guardian`

- [x] Truy vấn và **gộp hai họ endpoint**: `/query/invoices/{purchase,sold}` và `/sco-query/invoices/{purchase,sold}`. (`queryInvoices()` trong `packages/gdt-client/src/query.ts`; test `query.test.ts` "gộp normal + sco".)
- [x] Test phân trang nhiều trang (đủ, không sót/lặp trang). (Test: dừng khi trang ngắn hơn size, dừng khi thiếu `state`, chặn vòng lặp vô hạn + cảnh báo cắt cụt.)
- [x] Khử trùng lặp theo khóa tự nhiên. Ở **tầng adapter (U2)** dùng **5 trường** `(nbmst, khmshdon, khhdon, shdon, tdlap)` — `tenant_id` (khóa 6 trường cho upsert DB) bổ sung ở tầng đồng bộ **U4/U5**, không thuộc adapter. (Test: "khử trùng theo khóa tự nhiên khi trùng giữa normal và sco".)
- [x] Luôn giữ nguyên bản thô của hóa đơn (nền tảng cho cột `raw_json` khi lưu DB ở U4): adapter trả nguyên toàn bộ trường, chỉ gắn thêm `_source`/`_direction`. (Test: "bảo toàn TOÀN BỘ trường thô của hóa đơn".)
- [x] ✅ **ĐÃ KIỂM CHỨNG (2026-07-13, probe query thật từ Chrome đăng nhập thật của người dùng — chỉ đọc network, không ghi token/giá trị hóa đơn):**
  - `GET /api/query/invoices/purchase` → `200`, phong bì `{datas, total, state, time}`; `datas` mảng (15), `state` chuỗi con trỏ; **16 kết quả / 2 trang** ⇒ phân trang `state` hoạt động thật.
  - `GET /api/query/invoices/sold` → `200` (network capture).
  - `GET /api/sco-query/invoices/purchase` → `200`, `datas: []` **RỖNG vẫn hiện diện**, `state: null` khi rỗng ⇒ giải toả điểm mơ hồ "GDT có luôn trả `datas` khi rỗng không".
  - Bare fetch không kèm `Authorization` → `401` ⇒ xác nhận cần header `Bearer`.
  - Cú pháp RSQL thật `tdlap=ge=…T00:00:00;tdlap=le=…T23:59:59` khớp `buildSearch()`; row đủ 5 trường khóa tự nhiên.
  - Đã gỡ nhãn `CHƯA KIỂM CHỨNG` trong `endpoints.ts` + `gdt-contract-schema.json`. Chi tiết: ADR-0001 **Amendment #5**.
  - Còn lại (nhẹ): `/api/sco-query/invoices/sold` suy từ đối xứng, chưa gọi trực tiếp; probe qua egress máy người dùng (không kiểm lại egress T0 — đã có ở Amendment #3/#4).
- [x] ✅ **ĐÃ KIỂM CHỨNG (2026-07-13, probe bổ sung — định dạng GIÁ TRỊ `tdlap`/`ncnhat` trả về trong `datas[]`, chốt cho U5):**
  - `tdlap`: string ISO-8601 UTC **không** mili giây (`YYYY-MM-DDTHH:mm:ssZ`), quan sát luôn ở giờ `17:00:00Z` = `00:00:00` giờ VN (UTC+7) của ngày lập.
  - `ncnhat`: string ISO-8601 UTC **có** mili giây (`YYYY-MM-DDTHH:mm:ss.sssZ`) — khác `tdlap`.
  - `tgtcthue`/`tgtttbso`: JSON number, có thể ở dạng khoa học cho giá trị lớn (vd `1.4727778E7`). `ttxly`/`tthai`: JSON integer.
  - Đã gỡ nhãn `CHƯA KIỂM CHỨNG` cho giá trị `tdlap`. Chi tiết + giới hạn bằng chứng: ADR-0001 **Amendment #7**.

### ✅ U3 — GDT Adapter: detail dòng hàng · review: `contract-guardian` **PASS** + `security-reviewer` **PASS** (2026-07-13)

> `dod-auditor` bị gián đoạn bởi giới hạn phiên (không phải do phát hiện lỗi); các gate DoD (lint/test/coverage/scope/nhất quán tài liệu) đã được `contract-guardian` tự chạy và xác minh độc lập. Đã áp các phát hiện review: (a) thay MST thật trong fixture test bằng MST giả (`security-reviewer`, Low); (b) khai báo `invoice_detail` là ngoại lệ hợp đồng mềm thứ hai trong `.claude/rules/gdt-adapter.md` (`contract-guardian`); (c) thêm ghi chú CHƯA KIỂM CHỨNG tại test KCT/KKKNT + cảnh báo bảo mật tại field `raw`.

- [x] Test ánh xạ dòng hàng, thuế suất từ endpoint detail. (`mapDetailLines()` trong `packages/gdt-client/src/detail.ts`; `test/unit/detail.test.ts` — 18 test: ánh xạ `ten/dvtinh/sluong/dgia/thtien` + thuế suất hai trường `ltsuat`/`tsuat`, giữ `raw`, ca mã chữ KCT/KKKNT giữ nguyên, biên rỗng/null.)
- [x] Contract test cho cấu trúc detail; lệch → dừng + cập nhật schema tường minh (không nới assertion). (`test/contract/detail.contract.test.ts`, `it.skipIf(!TOKEN)`, khớp `gdt-contract-schema.json` → `invoice_detail`.)
- [x] `getInvoiceDetail()` cô lập qua `GdtTransport`; 401 → `SESSION_EXPIRED`; kiểm hợp đồng mềm `invoice_detail`. `make lint` sạch; `make test` xanh (**59 unit** gdt-client + 2 apps/api); coverage `detail.ts` **100%** (stmts/lines/branch/funcs; ngưỡng 80%).
- [x] ✅ **ĐÃ KIỂM CHỨNG (2026-07-13, probe detail thật từ Chrome đăng nhập thật của người dùng — HĐ mua vào thường, dòng thuế suất 8%; chỉ đọc network, không ghi token/giá trị hóa đơn):**
  - `GET /api/query/invoices/detail?nbmst&khhdon&shdon&khmshdon` → `200`. **CHỈ 4 tham số, KHÔNG có `tdlap`** (lệch giả thuyết cũ 5 tham số).
  - Mảng dòng hàng ở khóa **`hdhhdvu`** (khớp giả thuyết). Mỗi dòng: `stt, ten, dvtinh, sluong, dgia, thtien, tchat`…
  - **Thuế suất = HAI trường:** `ltsuat` (chuỗi `"8%"`) + `tsuat` (số `0.08`); tiền thuế dòng `tthue` (null ở dòng này). `mapDetailLines` giữ NGUYÊN cả hai + `raw`, không ép kiểu.
  - Đã gỡ nhãn CHƯA KIỂM CHỨNG cho `DETAIL_ENDPOINTS.normal` + `gdt-contract-schema.json` (`invoice_detail`). Chi tiết: ADR-0001 **Amendment #6**.
  - Còn lại (giữ nhãn CHƯA KIỂM CHỨNG): `DETAIL_ENDPOINTS.sco` (`/api/sco-query/invoices/detail`) suy từ đối xứng, chưa gọi trực tiếp (tài khoản không có HĐ máy tính tiền); mã thuế đặc biệt KCT/KKKNT chưa quan sát (mới thấy 8%).

### ✅ U4 — Mô hình dữ liệu + migration (PostgreSQL/Drizzle qua Hyperdrive) · review: `security-reviewer` **PASS** + `dod-auditor` **PASS** (2026-07-13) · *ĐẠT (`make lint && make test` xanh, coverage 100%)*

- [x] `make migrate` tạo schema (Drizzle) trên Postgres. → `packages/db` (`@vat/db`): `drizzle-kit generate` sinh `migrations/0000_*.sql`; `make migrate` = `drizzle-kit migrate` (cần `DATABASE_URL` thật). Kiểm áp migration thật bằng PGlite: test (12) tạo đủ 7 bảng, áp lần hai không lỗi.
- [x] Test ràng buộc **khóa tự nhiên** (unique) trên bảng hóa đơn. → UNIQUE `hoa_don_natural_key(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`; test (7) chèn trùng → lỗi thật, (8) khác `tenant_id` → chèn được (nguồn chân lý: `packages/db/src/naturalKey.ts`).
- [x] Mọi bảng nghiệp vụ có `tenant_id` NOT NULL; `raw_json` kiểu JSONB. → unit test (1)(4)(5) introspect lược đồ; integration (9) chèn thiếu `tenant_id` → lỗi; (11) `raw_json` round-trip JSONB. **Không** cột mật khẩu thô ở `tai_khoan_thue` (test (3)).
- [x] Bật **Row-Level Security** theo `tenant_id`. → `ENABLE` + **`FORCE`** ROW LEVEL SECURITY + policy fail-closed (`NULLIF(current_setting('app.tenant_id', true), '')`); test (13) chứng minh cách ly cho **cả role owner (nhờ FORCE) lẫn non-owner**. Ràng buộc vận hành: role app U6 không được là superuser (xem `.claude/rules/multi-tenant.md`).

### ✅ U5 — Dịch vụ đồng bộ idempotent (upsert) · `packages/sync` = `@vat/sync` · review: `security-reviewer` + `dod-auditor` (+ `contract-guardian` nhẹ) · *ĐẠT (`make lint && make test` xanh; coverage nhánh 83%, câu lệnh/hàm 99–100%)*

- [x] (a) Chạy đồng bộ 2 lần cùng kỳ → **không nhân đôi** bản ghi. → integration test (a): 3 HĐ, sync 2 lần → vẫn 3 dòng, `soHdMoi=0`/`soHdCapNhat=0` lần 2 (upsert theo khóa tự nhiên 6 trường, `withTenant`).
- [x] (b) `ttxly`/`tthai` đổi giữa 2 lần → **cập nhật**, không tạo mới. → test (b): đổi `ttxly 8→6`, `tthai 1→2` → **cùng `id`** update, `soHdCapNhat=1`, `SyncResult.changes` ghi cũ→mới.
- [x] (c) Bản ghi lần đồng bộ ghi đúng số HĐ mới / số HĐ cập nhật. → test (c): 1 mới + 1 đổi trạng thái → `soHdMoi=1`, `soHdCapNhat=1` (HĐ không đổi không bị đếm).
- [x] (d) Lỗi mạng tạm → retry; 401 → dừng + báo. → retry tạm do adapter `fetchWithRetry` (U1–U3); test (d): 401 → `trangThai='failed'`, **không** ghi hóa đơn, transport gọi **đúng 1 lần** (không retry credential); 401 giữa phân trang → rollback, không ghi dở dang.
- [x] (f) **Lịch sử đồng bộ có phiên bản**: mỗi phiên đồng bộ ghi mốc thời gian + số HĐ mới/cập nhật, truy vấn lại được theo tenant. → test (c)+(f): 2 phiên → 2 bản ghi `lan_dong_bo` phân biệt (`batDau`/`ketThuc`, `soHdMoi`/`soHdCapNhat`), truy theo `tenant_id`.
- [x] Cách ly tenant (`multi-tenant.md`): test (7) role non-superuser + RLS `FORCE` → sync tenant A không lộ sang tenant B.
- [~] (e) **Thông báo thay đổi hóa đơn** — **HOÃN sang unit riêng** (quyết định #A, chủ dự án 2026-07-13). U5 **phát hiện** `ttxly`/`tthai` đổi và trả `SyncResult.changes` (test (b) kiểm cũ→mới), nhưng **không** dựng bảng `thong_bao`/kênh phân phối — tránh U5 lấn mô hình hóa dữ liệu của U4 + tạo nguồn sự thật thứ hai. Bảng thông báo + phân phối tách thành đơn vị sau.

### ✅ U6 — REST API tra cứu + lọc + tổng hợp · `packages/query` = `@vat/query` + `apps/api` · review: `security-reviewer` **PASS** + `dod-auditor` + correctness đối nghịch (2026-07-14) · *ĐẠT (`make lint && make test` xanh; coverage `@vat/query` 100% dòng/82% nhánh, `apps/api` 100% dòng/90% nhánh)*

- [x] Test API (Hono `app.request`, PGlite offline — đọc DB đã đồng bộ, KHÔNG mock adapter/không gọi GDT): `GET /invoices` (lọc `chieu`/`nguon`/`ttxly`/`tthai`/`nbmst`/khoảng `tdlap` + kết hợp), phân trang `limit`/`offset` (`total` độc lập, sắp `tdlap desc` + tie-breaker `id`), `GET /invoices/summary` (count + sum tiền gom theo chiều + tổng chung, tiền giữ chuỗi — kiểm số > 2^53), `GET /invoices/:id`.
- [x] Mọi endpoint dữ liệu gắn `tenant_id` **tường minh** (lớp 1, `@vat/query.buildWhere` luôn kèm `eq(tenant_id)`) **+** `withTenant`/RLS (lớp 2); xác thực **JWT nội bộ HS256** trích `tenant_id` (trừ `/health`). **Test cách ly tenant qua route API** (bắt buộc — `multi-tenant.md`): JWT tenant A không đọc/không tổng hợp dữ liệu B; `GET /invoices/:idCủaB` → 404. 401 thiếu/hỏng/hết hạn JWT hoặc thiếu claim `tenant_id`; 400 tham số sai.
- [x] **Quyết định phạm vi (chủ dự án 2026-07-14):** (A) xác thực = verify JWT nội bộ, trích `tenant_id` (phát hành token + RBAC để **U8**); (#2) `/invoices/:id` **chỉ header từ DB**, KHÔNG kèm dòng hàng, KHÔNG gọi GDT. Xem `docs/plans/U6-plan.md`.
- [x] **Sửa từ review (2026-07-14):** fail-loud ngày lọc tràn số ngày của tháng (`2026-02-30` không âm thầm cuộn); tie-breaker `id` cho phân trang ổn định khi trùng `tdlap`; chặn `test/contract/**` khỏi `make test` của `apps/api`.
- [ ] ⚠️ Wiring `apps/api/src/db.ts` (pg qua Hyperdrive) + binding `wrangler.jsonc` **CHƯA kiểm chứng với Hyperdrive/Postgres thật** — test dùng PGlite tiêm; cần probe khi deploy (U6-plan "Rủi ro").

### ✅ U7 — Kết xuất Excel/CSV theo mẫu · `packages/export` = `@vat/export` + `apps/api` · *ĐẠT (`make lint && make test` xanh; coverage `@vat/export` 100% dòng/96.7% nhánh, `apps/api` 100% dòng/91.7% nhánh)*

- [x] Test **đọc lại file** kết xuất: đúng cột và **định dạng tiền**. → `xlsx`: reader tự viết (`fflate.unzipSync` + parse) khẳng định ô tiền là **số** + `numFmt "#,##0"` + giữ giá trị lớn (2^53+1) CHÍNH XÁC (không ép float); `csv`: parse RFC-4180 khẳng định header + tiền chuỗi nguyên bản + BOM UTF-8 + escape. Tiền lưu **chuỗi numeric** xuyên suốt (mục 7.1).
- [x] File lớn lưu **R2** (không giữ trong bộ nhớ Worker). → `POST /exports` ghi object R2 qua seam `getStorage`; nạp hàng bằng keyset `(tdlap,id)` lô-by-lô (không `SELECT *` cả tập một lần). **CSV = stream thật** (`ReadableStream` + generator, không gom cả file vào RAM). **XLSX = gom cả file trước khi ghi** (bản chất zip — không stream được từng phần; ghi chú minh bạch tại `xlsx.ts:111`), bị chặn bởi trần dòng Excel (~1.048M); tập cực lớn nên đi **CSV** hoặc kết xuất **nền U9**. Test dùng **R2 giả tiêm** (offline); binding R2 thật **CHƯA kiểm chứng** — probe khi deploy (như Hyperdrive U6).
- [x] **Kết xuất đa định dạng**: `xlsx` + `csv` (tối thiểu theo checklist + khảo sát 8a) + `xml.zip`/`html.zip` (U22 — mỗi hóa đơn 1 file trong zip, kèm dòng hàng). `pdf.zip`/`aio.pdf` — lộ trình sau (cần quyết định dependency PDF + font Unicode tiếng Việt, chưa chốt). *(Test: mỗi định dạng tải lại được + đúng số bản ghi.)*
- [x] **Cách ly tenant qua kết xuất** (multi-tenant.md): key R2 mang tiền tố `tenant_id`; tải chỉ dựng key từ tenant người gọi → A không tải được object của B (→ 404); export của A không chứa dữ liệu B. Mọi truy vấn trong `withTenant` + `buildWhere` lọc `tenant_id` tường minh.
- [x] **Audit "xuất dữ liệu"** (security.md, chốt #4): mỗi export ghi một dòng `audit_log` (`hanh_dong='export'`) append; không log `raw_json`/token. Append-only đầy đủ + masking → U12.
- [x] **Cổng spike (chốt #2):** encoder xlsx kiểm chứng chạy trên **workerd thật** (`spikes/xlsx-workers`, `wrangler dev` **không** `nodejs_compat`, 2026-07-14) — `ok:true`, `hasMoneyNumFmt:true`, `keepsBigMoneyExact:true`. Không ép nâng vitest 3→4 để chạy `vitest-pool-workers` (ngoài phạm vi U7).
- [x] **Review chéo (2026-07-14): `dod-auditor` PASS + `security-reviewer` PASS** (không rò rỉ chéo tenant). **Sửa từ review:** (a) chống **CSV/Excel formula injection** — ô văn bản (`nbten`/`nmten` từ GDF/bên thứ ba) bắt đầu `= + - @` được chèn `'` trong CSV (`guardCsvText`); xlsx an toàn sẵn (`t="inlineStr"` không diễn giải công thức) — có test cả hai; (b) `EXPORT_FORMATS`/`isExportFormat` thành nguồn định dạng duy nhất, route dùng thay vì hardcode.

### ✅ U8 — Auth người dùng nội bộ + RBAC + đa tenant · `apps/api` + `@vat/db` · *ĐẠT (`make lint && make test` xanh; coverage `apps/api` 100% dòng/93.5% nhánh) · review: `security-reviewer` PASS (1 Medium đã sửa) + `dod-auditor` PASS*

- [x] Test **cách ly dữ liệu**: tạo 2 tenant, xác nhận A không đọc/ghi được dữ liệu B. → `rbac.route.test.ts`: `quan_tri` của A vẫn chỉ thấy dữ liệu A qua `/invoices` và kết xuất `/exports` không lẫn B (RBAC KHÔNG nới cách ly). Token gắn đúng 1 `tenant_id`; `withTenant` + lọc `tenant_id` tường minh giữ nguyên.
- [x] **RBAC theo vai trò**; RLS là lớp phòng thủ thứ hai. → 3 vai `ke_toan`/`ke_toan_truong`/`quan_tri` (nguồn chân lý `apps/api/src/rbac.ts`), vai trong **claim JWT** (quyết định #3). `requireRole`: đọc = cả 3 vai; kết xuất = kế toán trưởng+quản trị (`ke_toan` → 403). Thiếu/sai token → 401; đúng token sai vai → 403 (test `rbac.test.ts` + `rbac.route.test.ts`).
- [x] **Phát hành + xác thực token** (mở rộng seam `requireTenant` U6/U7): `POST /auth/login` email+mật khẩu → JWT HS256 mang `tenant_id`+`role`, ký bằng Workers Secret `JWT_SECRET`. Mật khẩu băm **PBKDF2/WebCrypto** (100k vòng, salt/hash 256-bit, so sánh hằng thời gian); sai email/mật khẩu → 401 gọn (không rò lý do). Test `auth.route.test.ts` + `password.test.ts`.
- [x] **Login vs RLS** (điểm kiến trúc): login xảy ra TRƯỚC khi biết tenant nhưng `nguoi_dung` FORCE RLS ⇒ tra cứu qua hàm **SECURITY DEFINER `auth_lookup_user`** (owner `auth_lookup` NOLOGIN+BYPASSRLS, bề mặt hẹp; **least-privilege: REVOKE FROM PUBLIC**, chỉ EXECUTE tường minh cho role app). `email` UNIQUE toàn cục. Test `(U8-14)` chứng minh hàm vượt RLS dưới role non-superuser, SELECT thường bị chặn, và role không được cấp EXECUTE bị từ chối.
- [ ] ⚠️ **Nợ vận hành** (production, CHƯA KIỂM CHỨNG trên DB thật): `GRANT EXECUTE` hàm `auth_lookup_user` cho role app Hyperdrive khi provision; role BYPASSRLS có thể cần quyền admin Neon/Supabase. Cùng lớp nợ với wiring Hyperdrive U6 (test dùng PGlite tiêm).

### ✅ U9 — Đồng bộ nền theo lịch (Cloudflare Cron + Queues + Durable Object) · `apps/sync-worker` = `@vat/sync-worker` · *ĐẠT (`make lint && make test` xanh; coverage `@vat/sync-worker` 98.8% dòng, mọi file logic ≥ 80% mọi trục)*

- [x] Test job **idempotent** (chạy lại cùng kỳ không nhân đôi — e2e PGlite qua `sync()` U5); retry khi lỗi tạm (`failureKind='transient'` → outcome `retry` → `message.retry()`, trần `max_retries`→DLQ); **401 KHÔNG retry** (`session_expired` → đánh dấu token chết + audit).
- [x] `tenant_id` nằm **tường minh** trong payload message (`SyncJobMessage`); mọi truy cập dữ liệu tenant-scoped qua `withTenant` (RLS); ca cách ly tenant qua role non-superuser + RLS FORCE xanh.
- [x] Rate limit + circuit breaker theo tenant/MST (**Durable Object `TenantLimiter`**, tối thiểu — quyết định #3); logic thuần test 100%. Breaker mở → bỏ qua tick, **0 call GDT**.
- [x] **Ranh giới token nền (quyết định #1):** chỉ đồng bộ tài khoản token còn hạn; hết hạn → `lan_dong_bo`=`can_dang_nhap_lai` + audit, **KHÔNG tự đăng nhập, KHÔNG captcha** (test chứng minh 0 call GDT ở nhánh pre-flight). Lịch = **cửa sổ trượt** tháng hiện tại (giờ VN), không bảng lịch (quyết định #4).
- [x] **Cô lập adapter:** worker nền KHÔNG tự `fetch()` GDT — chỉ qua `sync()`→`GdtTransport`; egress T0 `createDirectCfTransport` nằm ở `packages/gdt-client` (điểm gọi GDT duy nhất). Xem `docs/plans/U9-plan.md`.

### ✅ U10 — Module đối chiếu (thiếu HĐ, lệch thuế, HĐ hủy/thay thế) · `packages/reconcile` = `@vat/reconcile` + `apps/api` · *ĐẠT (`make lint && make test` xanh; coverage `@vat/reconcile` 100% dòng / 89% nhánh, mọi trục ≥ 80%)*

> Quyết định phạm vi (chủ dự án, 2026-07-14 — xem `docs/plans/U10-plan.md`): #1 **HĐ thiếu = gap dãy số đầu ra** (không đối chiếu sổ ngoài); #2 **hủy/thay thế = dựng cơ chế + bảng mã CHƯA KIỂM CHỨNG**; #3 **lệch thuế = số học nội tại header**. Module **đọc-only** (KHÔNG gọi GDT), findings **tính on-read** (không bảng mới, không nguồn sự thật thứ hai).

- [x] Test theo **bộ dữ liệu tình huống** (28 test `@vat/reconcile` + 5 route `apps/api`): **lệch thuế** (`taxIntegrity` — khớp/lệch/chiết khấu/null không false-positive/dung sai/số > 2^53/lọc kỳ); **thiếu số đầu ra** (`sequenceGaps` — gap giữa dãy, chỉ `chieu='sold'`, nhóm `(nbmst,khhdon)` độc lập, shdon phi số bỏ qua); **hủy/thay thế** (`statusAnomaly` — phân loại theo bảng mã tiêm ở test).
- [x] **Lệch thuế** đối chiếu trên cột header **đã ánh xạ từ `raw_json`** (U5): định danh `tgtcthue − ttcktmai + tgtthue = tgtttbso`, tính **trong SQL `numeric`** (không ép float); dung sai cấu hình (mặc định khớp tuyệt đối). *(Đối chiếu bảng `thttltsuat` trong `raw_json` — HOÃN, quyết định #3.)*
- [x] **HĐ hủy/thay thế:** cơ chế phân loại tách rời khỏi GIÁ TRỊ mã (`classifyStatus(row, map)`). **Cập nhật 2026-07-28 (U36.1):** `thayThe.tthai = [4]` (bị thay thế) — ĐÃ KIỂM CHỨNG trên 33.929 hóa đơn thật; mã **hủy** và MỌI `ttxly` vẫn **RỖNG**. Cổng guard `statusCodes.contract.test.ts` **đỏ nếu ai điền thêm mã chưa probe**. `GET /reconcile` có test phủ hành vi mới (seed `tthai:4` → `thayThe === 1`).
- [x] **Cách ly tenant:** mọi truy vấn lọc `tenant_id` tường minh (`buildWhere` của @vat/query, lớp 1) + endpoint `GET /reconcile` trong `withTenant` (RLS lớp 2), RBAC `ke_toan`+; test tenant A không thấy anomaly của B (package + route) xanh.
- [x] **Read-only:** 0 bảng mới, 0 gọi GDT (không import `@vat/gdt-client`/`fetch`), không đụng adapter/401/captcha/mật khẩu thô.

### ✅ U11 — Tích hợp/xuất sang phần mềm kế toán · review: `security-reviewer` + `dod-auditor`

> Quyết định phạm vi (chủ dự án, 2026-07-14 — xem `docs/plans/U11-plan.md`): #1 **cơ chế + profile tham chiếu** (chưa có template thật → không bịa layout); #2 **file convert** (R2 + link, như U7; webhook/pull API tách sau); #3 **KHÔNG gán mã tài khoản kế toán** (P12 tách đơn vị). Đọc-only (KHÔNG gọi GDT), tổng quát hóa encoder U7 qua **profile ánh xạ** (không nguồn sự thật thứ hai).

- [x] **Test ánh xạ đúng định dạng mục tiêu** (11 unit `accountingFile` + 8 unit `profiles` + 8 route `apps/api`): file đọc lại → **header ĐÍCH đúng thứ tự** của profile (khác nhãn native), **transform** định dạng (ngày `dd/MM/yyyy`), tiền = **chuỗi numeric nguyên bản** + numFmt `#,##0` (xlsx), giá trị > 2^53 chính xác, null → ô trống.
- [x] **Cơ chế profile cắm được** (`@vat/export`): `MappingProfile`/`MappingColumn` + `toAccountingFile`/`accountingCsvStream`/`accountingXlsxFromBatches` dựng TRÊN encoder csv/xlsx **tổng quát hóa** (`*For(columns)`) — U7 giữ nguyên (68 test export xanh, csv/xlsx/columns/rows không đổi hành vi). Registry là **nguồn sự thật** profile khả dụng (route validate qua `isProfileId`).
- [x] **Nguyên tắc bằng chứng:** MISA/FAST/SmartKTSC ở `PENDING_PROFILES` (**CHƯA KIỂM CHỨNG** — chưa có template) → KHÔNG khả dụng (`profile=misa` → 400). Cổng guard `accountingProfiles.contract.test.ts`: mọi profile khả dụng phải `verified=true`; mục tiêu thật vẫn bị chặn tới khi có template.
- [x] **File convert:** `POST /exports/convert?profile=<id>&format=xlsx|csv&<bộ lọc U6>` → keyset streaming (không gom RAM) → **R2** (tiền tố tenant) + link; tải qua `GET /exports/:id` (cùng keyspace U7).
- [x] **Cách ly tenant + RBAC + audit:** `buildWhere` lọc `tenant_id` tường minh (lớp 1) + `withTenant`/RLS (lớp 2); test A **không** convert/tải được dữ liệu B (→ 404); RBAC `ke_toan` → **403** (như export); audit `hanh_dong='convert'`, `doi_tuong=<profile>`, không log `raw_json`/token.
- [x] **Read-only:** 0 bảng mới, 0 gọi GDT (không import `@vat/gdt-client`/`fetch`), không đụng adapter/401/captcha/mật khẩu thô; không gán mã tài khoản (P12 tách). Coverage `@vat/export` 98.77% (≥80%); `make lint` sạch.

### ✅ U12 — Bảo mật: mã hóa bí mật, audit log, rate limit client · `@vat/crypto` + `@vat/db` + `apps/sync-worker` · *ĐẠT (`make lint && make test` xanh, coverage `@vat/crypto` 100% / `@vat/db` 100% dòng / `apps/sync-worker` 98.8%)*

> **Đã xong — U12:** `@vat/crypto` mới (envelope encryption `sealSecret`/`openSecret` AES-256-GCM — KEK bọc DEK ngẫu nhiên mỗi bản ghi, IV 96-bit ngẫu nhiên, chuỗi tự mô tả `v1$aesgcm$…` mở đường rotation; `maskSensitive` che token/password/connection-string/`raw_json` đệ quy). Seam `@vat/db` `storeToken`/`readToken` mã hóa `tai_khoan_thue.token_hien_tai` tại nghỉ (tenant-scoped `withTenant`, test fixture chứng minh: đọc lại đúng token, cột DB không phải plaintext, cách ly tenant). `audit_log` **bất biến** qua trigger migration `0002` (chặn UPDATE/DELETE kể cả owner/superuser — kiểm dưới role PGlite). `recorder` mask `chi_tiet` trước khi ghi. `TenantLimiter` ngưỡng **tiêm từ env** (`resolveLimiterConfig`, fail-safe khi cấu hình sai) + log quan sát khi chặn (`limiterEvent`). Quyết định (chủ dự án 2026-07-14): #1 **seam + fixture** (đường GHI token runtime = đơn vị sau) · #2 **1 KEK + version-tag** (rotation sau) · #3 **counter/log đã mask** (Analytics Engine = wiring deploy). Xem `docs/plans/U12-plan.md`.

- [x] Test mã hóa/giải mã bí mật (envelope): round-trip, ciphertext≠plaintext, không tất định (IV/DEK ngẫu nhiên), KEK sai → ném lỗi, chuỗi hỏng → thất bại có kiểm soát. Bí mật (KEK) qua **Workers Secret** — `wrangler secret put SECRET_KEK` (không hard-code/commit).
- [x] **Không** lưu mật khẩu thuế thô; token lưu dạng **sealed** (`storeToken`), điểm đọc chuyển sang `readToken` cùng đường GHI token (đơn vị sau — quyết định #1).
- [x] Audit log **append-only**: trigger `audit_log_immutable` chặn UPDATE/DELETE độc lập tên role app (chặn cả owner — như FORCE RLS); `chi_tiet` masked. **CHƯA KIỂM CHỨNG trên DB thật:** grant `SELECT, INSERT` cho role app khi provision.
- [x] **Chặn vượt ngưỡng** rate limit client: test tường minh vượt `capacity` (từ env) → `rate_limited`; breaker mở sau `failureThreshold` lỗi → `breaker_open` (kế thừa U9 + đường config từ env).
- [x] **Review chéo (2026-07-14): `security-reviewer` — không Critical/High, không rò rỉ chéo tenant.** Hai phát hiện đã sửa (TDD): (a) **Medium** — `audit_log` chưa chặn `TRUNCATE` (trigger row-level không bắt lệnh statement-level) → thêm trigger `BEFORE TRUNCATE FOR EACH STATEMENT` + `REVOKE TRUNCATE` (migration `0002`, test TRUNCATE→ném); (b) **Low** — `maskSensitive` bỏ sót JWT thô nhúng trong chuỗi tự do dưới khóa vô hại → thêm pattern JWT vào `maskString` (test). Đồng thời áp `maskSensitive` cho `chi_tiet` route `/exports` + `/exports/convert` (`apps/api`) — bộ lọc `nbmst` là chuỗi tự do có thể mang giá trị nhạy cảm (test JWT-trong-nbmst).

### ⬜ U15 — Frontend: SPA khách-hàng-thấy (cụm: đặc tả · ánh xạ dữ liệu · UX) · *KẾ HOẠCH — chưa hiện thực · `docs/plans/U15-plan.md`*

> Lớp thứ ba (Tầng trình bày) — U0–U12 cố ý chưa chạm (chỉ PoC `frontend/index.html`). **Một cụm**, chạy qua 6 lát cắt U15.0→U15.5. **Thuần frontend**: chỉ tiêu thụ API `apps/api` (U6–U11), KHÔNG gọi GDT, KHÔNG thêm endpoint backend. Ngăn xếp đề xuất: React+TS+Vite trên Workers Static Assets (chốt Điểm mơ hồ #1 của plan).

- [ ] **U15.0** Khung `apps/web` + build Static Assets + harness test (Vitest/TL + Playwright) + `apiClient` gõ kiểu (ánh xạ 401/403/400/404); `make test` xanh trên khung.
- [ ] **U15.1** Đăng nhập nội bộ `POST /auth/login` + giữ JWT + guard vai (RBAC `rbac.ts`) + 401→login; nút kết xuất **ẩn với `ke_toan`**.
- [ ] **U15.2** Tra cứu `GET /invoices`(+`/summary`) — toàn bộ bộ lọc (`filters.ts`) + phân trang (`limit`≤200); formatter **tiền-chuỗi KHÔNG ép float** (test >2^53), ngày-VN, nhãn trạng thái.
- [ ] **U15.3** Chi tiết `GET /invoices/:id` (chỉ header — U6 #2).
- [ ] **U15.4** Kết xuất `POST /exports` + convert (chỉ profile khả dụng) + tải `GET /exports/:id`; RBAC ẩn với `ke_toan`.
- [ ] **U15.5** Đối chiếu `GET /reconcile` — 4 loại finding + tóm tắt; gap nhãn "nghi thiếu". ⚠️ **Màn ĐANG ẨN** khỏi bảng điều khiển từ 2026-07-22 (cờ `SHOW_RECONCILE=false`, `apps/web/src/lib/featureFlags.ts`): menu + route tắt, mã màn và `@vat/reconcile` giữ nguyên. Nghiệm thu màn này hoãn tới khi bật lại cờ.
- [ ] **Ánh xạ dữ liệu (Nguyên tắc bằng chứng):** nhãn `tthai` 1–5 từ `@vat/domain` `nhanTthai()` (một nguồn cho web + file xuất); `ttxly` chưa mã nào kiểm chứng; mã ngoài tập → số + "(chưa rõ)" **kèm cảnh báo**; cột bảng = `EXPORT_COLUMNS`.
- [ ] **Cách ly tenant + bảo mật client:** `tenant_id` lấy từ token (không tin client); không bí mật/không token trong mã/log.
- [ ] **DoD chung (mục A)** + coverage tầng logic UI (formatter/mapping/guard) ≥ 80% + a11y smoke + **hồi quy U0–U15 xanh**.
- [ ] **Fenced (chờ đơn vị BACKEND trước):** UI đăng nhập thuế + captcha (chưa có đường ghi token GDT), "đồng bộ ngay", lịch sử đồng bộ, Cổng Admin, webhook tích hợp — xem `docs/plans/U15-plan.md` §NGOÀI phạm vi.

---

## C. Vòng lặp giám sát rủi ro (xuyên suốt, không phải một mốc) — **= U13 ✅ (commit `08b3f76`)**

> U13 hiện thực mục C (`docs/plans/EXP-giam-sat-rui-ro.md`): review chéo contract-guardian **PASS** + security-reviewer **PASS**; `make lint` sạch; `make test` xanh (355 test); coverage `health.ts`/`egressProbe.ts` 100%. Drift QĐ #1 (cảnh báo audit_log→observability, vì audit_log tenant-scoped) đã ghi trong plan — **chủ dự án đã xác nhận (2026-07-14)**.

- [x] **Contract test định kỳ** (CI theo lịch) gọi endpoint công khai GDT — phát hiện khi cơ quan thuế đổi API. → `.github/workflows/ci.yml` job `contract` chạy `test:contract` theo `schedule: 0 2 * * *`; thất bại → GitHub tự thông báo. Bổ sung `workflow_dispatch` để chạy thủ công.
- [x] **Probe egress định kỳ** — theo dõi T0 (thuần Cloudflare) còn gọi được GDT không; `GEO_BLOCKED`/`RATE_LIMITED` ổn định (3 tick liên tiếp) → cảnh báo (Workers observability). → cron `*/15 * * * *` trong `apps/sync-worker` (`egressProbe.ts`/`health.ts` + DO `EgressHealth`). **KHÔNG bật T1** (đang TREO) — chỉ phát hiện + cảnh báo. (ADR-0001 mục 5B.)

---

## D. Điều kiện hoàn thành toàn dự án

Tất cả U0–U15 đạt Definition of Done, test hồi quy toàn bộ xanh, và hai vòng giám sát rủi ro (mục C) đang chạy ổn định. **Lưu ý phạm vi:** U0–U12 (Backend + Xử lý/Dữ liệu) đã ✅; **U15 (Frontend — Tầng trình bày) hiện KẾ HOẠCH, chưa hiện thực** — dự án chỉ "hoàn thành đủ 3 lớp vận hành" khi U15 đạt DoD.

---

## E. Lát cắt 3 (U34 / QĐ-14) — runbook deploy & nghiệm thu

> Mã đã xong và `make test` toàn kho xanh (172 file / 1449 test), `make lint` mã thoát 0.
> Nhánh `feat/u34-lat3-dat-mat-khau`. **Chưa có gì chạm production.**

### Vì sao BỐN thứ phải đi một lượt

Hợp đồng `POST /admin/tenants/:id/duyet` **đổi** (bỏ `mat_khau_tam`, thêm `da_gui_thu`) và
route `reset-mat-khau` **đã xoá**. Lệch pha là hỏng thật, không phải hỏng đẹp:

| Nếu deploy lệch | Hỏng thế nào |
|---|---|
| `vat-api` trước khi `make migrate` | Duyệt chết ngay — thiếu bảng `dat_mat_khau`. Đúng sự cố `deploy.md` đã ghi |
| `vat-admin` trước `vat-api` | Cổng Admin gọi `gui-link-dat-mat-khau` → 404 |
| `vat-api` mà quên `vat-admin` | Duyệt chạy, thư gửi đi, nhưng Cổng Admin đọc `mat_khau_tam` không còn tồn tại → hộp thoại vỡ |
| `vat-api` mà quên `vat-web` | Thư tới tay khách mang liên kết `/dat-mat-khau` → **trang trắng** |

### 1. Áp migration 0014

```bash
make migrate
```

⚠️ **`drizzle-kit migrate` NUỐT thông báo lỗi** — chỉ quay spinner rồi thoát mã 1. Hỏng thì
áp tay bằng `pg`: tách theo `--> statement-breakpoint`, chạy trong transaction, in lỗi
**TỪNG CÂU**. Không có bước này thì mò cả buổi (bài học migration 0013).

### 2. Hậu kiểm DB — 5 điểm, chạy trên `DATABASE_URL` production

Đây là **chỗ duy nhất** kiểm chứng được quyền thật. Test trong kho chạy PGlite dưới
superuser nên chỉ kiểm được *khai báo*, không kiểm được *thi hành*.

```sql
-- 1. Bảng có, RLS bật + force, KHÔNG policy nào (fail-closed)
SELECT relrowsecurity, relforcerowsecurity,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS so_policy
FROM pg_class c WHERE c.relname = 'dat_mat_khau';
-- kỳ vọng: t | t | 0

-- 2-4. Hai hàm thuộc đúng role; vat_app gọi được; PUBLIC KHÔNG gọi được
SELECT p.proname, r.rolname AS chu_so_huu,
       has_function_privilege('vat_app', p.oid, 'EXECUTE') AS vat_app_goi_duoc,
       has_function_privilege('public',  p.oid, 'EXECUTE') AS public_goi_duoc
FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname IN ('dat_mat_khau_tao', 'dat_mat_khau_dung');
-- kỳ vọng: 2 hàng, chu_so_huu = dat_mat_khau_api, vat_app_goi_duoc = t, public_goi_duoc = f

-- 5. Còn hàng nào mang mật khẩu tạm đang sống không? (chỉ để BIẾT, không chặn deploy)
SELECT count(*) FROM nguoi_dung WHERE mat_khau_tam_het_han IS NOT NULL;
```

Điểm 5 quyết định khi nào dọn được hai cột đó — xem BACKLOG. **Bằng 0 không phải điều kiện
để deploy**; cổng chặn ở `routes/auth.ts` vẫn giữ dù bằng bao nhiêu.

Nếu điểm 2–4 sai (thường vì role app tên khác `vat_app`/`app_user`), migration đã
`RAISE WARNING` — cấp tay:

```sql
GRANT EXECUTE ON FUNCTION public.dat_mat_khau_tao(uuid,text,timestamptz),
                          public.dat_mat_khau_dung(text,text) TO <ten_role_app>;
```

### 3. Deploy ba worker, ĐÚNG thứ tự

```
vat-api  →  vat-web  →  vat-admin
```

### 4. Smoke sau deploy (không dừng ở /health)

`/health` vẫn 200 trong khi đường mới đã chết — nó không đủ để kết luận gì.

- [ ] Mở `https://vatengine.tourdao.vn/dat-mat-khau` (KHÔNG kèm token) → phải thấy
      **"Liên kết không hợp lệ"**, không phải trang trắng. Trang trắng = SPA fallback chưa
      nhận route mới.
- [ ] Mở Cổng Admin, vào tab **Đang hoạt động** → nút phải là **"Gửi lại link đặt mật khẩu"**,
      KHÔNG còn "Cấp lại mật khẩu".

### 5. Nghiệm thu — bằng NGƯỜI THẬT, không bằng test tự động

Chuỗi này đã có test phủ. Thứ chưa có bằng chứng là **đường thật xuyên qua bốn hệ thống**
(DB · vat-api · SES · vat-web) — test không chạm tới được.

- [ ] Đăng ký một hồ sơ thật trên `vatengine.tourdao.vn` bằng địa chỉ thật
- [ ] Nhận thư xác thực → bấm link → thấy "chờ duyệt" (Lát cắt 1, đã LIVE)
- [ ] Điện thoại chủ dự án kêu (Telegram) đúng ở bước xác thực
- [ ] Vào Cổng Admin bấm **Duyệt** → hộp thoại báo **"Đã gửi thư đặt mật khẩu"** tới đúng
      địa chỉ, và **KHÔNG hiện mã 6 số nào** ← đây là điều kiện cốt lõi của QĐ-14
- [ ] Mở hộp thư khách → có thư **"Đặt mật khẩu cho tài khoản VATEngine"**
- [ ] Bấm liên kết → đặt mật khẩu → **đăng nhập được**
- [ ] Bấm lại đúng liên kết đó lần hai → thấy **"Liên kết này đã được dùng"** (không phải
      lỗi chung chung)

### Nếu hộp thoại báo "⚠️ CHƯA gửi được thư"

Doanh nghiệp **đã được duyệt** (trạng thái đã đổi trong DB) nhưng thư không đi. Bấm
**"Gửi lại thư"** ngay trong hộp thoại. Vẫn hỏng thì vấn đề nằm ở cấu hình SES phía ta,
không ở hộp thư khách — kiểm `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`
(`ap-southeast-1`) / `EMAIL_FROM` (`no-reply@vatengine.tourdao.vn`) trước khi báo cho khách.

---

## U36 — Trạng thái hóa đơn trong tổng hợp và kết xuất (2026-07-28)

Kế hoạch: `docs/plans/U36-plan.md` · Tiến độ: `docs/plans/U36-tien-do.md` ·
Bằng chứng mã trạng thái: `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md`.

**Đổi hành vi người dùng thấy được:** hóa đơn `tthai=4` (BỊ THAY THẾ) không còn được cộng
vào tổng tiền. Tổng của các kỳ ĐÃ QUA vì vậy **khác** con số cũ — đây là sửa đúng, không
phải hồi quy.

### Máy kiểm (đã có test)

- [x] Tổng tiền loại `tthai=4`; `tthai=5` và `tthai=NULL` **vẫn được cộng**
- [x] `count` "hóa đơn khớp bộ lọc" **giữ nguyên nghĩa** ⇒ kỳ chỉ có mã 4 KHÔNG tự kích hoạt
      đồng bộ lên Tổng cục Thuế (nguồn của sự cố 429 ngày 27/07)
- [x] Một chiều toàn mã 4 vẫn còn trong `byChieu` (loại trừ đặt ở aggregate, không ở WHERE)
- [x] Kỳ chỉ có mã 4 → `thueDaLoai` là **số**, không null
- [x] `soMaLa > 0` → giao diện cảnh báo mã chưa xác định
- [x] Thuế phải nộp đúng dấu: bán ra làm **giảm**, mua vào làm **tăng**; tính bằng BigInt
- [x] Tab đang mở giữ dữ liệu shape CŨ → không crash, không hiện thông báo sai
- [x] File tải về 19 cột mặc định, 3 cột trạng thái ngay sau `Tổng tiền (sau thuế)`
- [x] Người dùng đã lưu lựa chọn cột cũ vẫn thấy 3 cột mới (khóa localStorage v2)
- [x] Cách ly tenant nguyên vẹn

### Nghiệm thu thủ công — số đo thật ngày 2026-07-28

Tenant MST `4201969169`, chiều **Bán ra**:

| Kỳ | Số HĐ mã 4 | Thuế phải giảm | Tổng thanh toán phải giảm |
|---|---|---|---|
| 2026-04 | 6 | 7.787.702 ₫ | 105.134.000 ₫ |
| 2026-05 | 5 | 9.257.482 ₫ | 124.976.000 ₫ |
| 2026-06 | 3 | 1.579.630 ₫ | 21.325.000 ₫ |
| **2026-07** | **3** | **1.711.111 ₫** | **23.100.000 ₫** |

- [x] Mở kỳ 07/2026, chiều **Bán ra** → tổng thuế giảm **đúng 1.711.111 ₫** so với trước · *chủ dự án xác nhận trên production 2026-07-28*
- [x] Thông báo hiện đúng số hóa đơn + tiền đã loại, **tách theo chiều** · *đã đối chiếu nguyên văn với mẫu §4b kế hoạch: "Kỳ 01/07 – 31/07/2026 · Bán ra / 3 hóa đơn bị thay thế - đã loại khỏi tổng: thuế -1.711.111 ₫, tổng thanh toán -23.100.000 ₫ / 3 hóa đơn thay thế và 1 hóa đơn điều chỉnh lập trong kỳ - đã tính vào tổng"*
- [x] Dòng *"Thuế phải nộp trên báo cáo giảm 1.711.111 ₫"* xuất hiện **một lần**, kèm chú
      giải "số thuế phải nộp thật không đổi" · *xác nhận 2026-07-28*
- [x] Tải file Excel → có 3 cột trạng thái; hóa đơn mã 4 **vẫn có trong file** với
      "Tính vào tổng" = **Không** · *đã đối chiếu MÁY trên file thật
      `docs/doi_chieu_data/vatengine-export-01072026-31072026.xlsx` (2026-07-28): 19 cột đúng
      thứ tự, 3 cột trạng thái ngay sau `Tổng tiền (sau thuế)`; 3.589 hóa đơn / 7.923 dòng
      mặt hàng; 3 HĐ mã 4 (`Tính vào tổng` = Không) tổng thuế **1.711.111 đ**, tổng sau thuế
      **23.100.000 đ** — khớp TỪNG ĐỒNG với thông báo trên màn hình; "Có" + "Không" = 3.589
      không sót dòng nào*

**U36 ĐÓNG — cả 4 ô nghiệm thu đã đạt.**

⚠️ **20.335.925 ₫ là tổng TOÀN BỘ 3 tenant × 5 tháng — KHÔNG dùng để nghiệm thu một kỳ.**

⚠️ Chiều **Mua vào** hiện 0 hóa đơn mã 4 ở mọi kỳ. **Không coi là quy luật:** toàn bộ dữ
liệu chỉ có đúng 1 ca thay thế ở chiều mua vào, và biên bản §6.5 **đã rút** kết luận cũ
"GDT không trả bản gốc cho bên mua". Mã và test xử lý hai chiều như nhau.

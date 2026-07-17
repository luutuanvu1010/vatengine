# Kế hoạch U22 — Backfill ngầm khi lọc kỳ quá khứ chưa đồng bộ + báo tiến trình theo tháng

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** File này chỉ là đặc tả + phân rã bước để duyệt; chưa có dòng code nào.
>
> Nguồn gốc: mục backlog `docs/BACKLOG-y-tuong-va-de-xuat.md` — *"[2026-07-16] Lọc 'Danh sách hóa đơn' theo giai đoạn quá khứ chưa đồng bộ → phải tự backfill ngầm + báo tiến trình"* (ưu tiên **Cao**). Yêu cầu chủ dự án, phiên Cowork 2026-07-16.
>
> Quyết định phạm vi đã chốt (phiên Cowork 2026-07-16, chọn nhanh):
> 1. **Tự lấy TOÀN BỘ khoảng lọc** — mọi tháng còn thiếu trong khoảng người dùng lọc đều được backfill, không giới hạn số tháng/lần, không hỏi xác nhận trước.
> 2. **Thanh tiến độ theo tháng** — hiển thị "Đang lấy X/N tháng — tháng MM/YYYY…" kèm phần trăm.
> 3. Sau khi backfill xong, tự áp lại bộ lọc và hiển thị kết quả.
>
> Luật áp dụng: `multi-tenant.md` (mọi job/query gắn `tenant_id` tường minh), `security.md` (không log token/mật khẩu; audit hành động), `testing.md` (TDD, coverage ≥80% tầng nghiệp vụ), `gdt-adapter.md` (backfill vẫn đi qua adapter GDT + `GdtTransport`, tôn trọng rate limit/backoff). Hiến pháp §Ranh giới đạo đức (tôn trọng máy chủ thuế) là ràng buộc cứng của đơn vị này.

---

## 1. Tiền đề đã kiểm chứng (đọc từ mã nguồn 2026-07-16 — KHÔNG suy đoán)

Mọi khẳng định dưới đây tái lập được bằng cách đọc file đã dẫn. Đây là bề mặt hiện có mà U22 **tái dùng, không dựng lại**.

| Thành phần đã có | Sự thật (dẫn nguồn) | Hệ quả cho U22 |
|---|---|---|
| `GET /invoices` | `apps/api/src/routes/invoices.ts` — **chỉ ĐỌC** dữ liệu đã đồng bộ trong Neon qua `@vat/query`, **không gọi GDT**. | Lọc kỳ chưa có dữ liệu ⇒ trả rỗng. Đây là nơi cần "biết còn thiếu tháng nào" nhưng KHÔNG nên tự backfill đồng bộ trong request (Worker stateless, nhanh). |
| Bộ lọc | `packages/query/src/filters.ts` — `tuNgay`/`denNgay` định dạng `YYYY-MM-DD`, lọc theo `hoaDon.tdlap`. Không có tham số "kỳ". | Khoảng backfill suy ra từ `tuNgay`/`denNgay` của bộ lọc → tách thành danh sách tháng (YYYY-MM). |
| `currentPeriodWindow(nowMs)` | `packages/sync/src/syncJob.ts:40` — chỉ dựng **một** cửa sổ = **tháng hiện tại** giờ VN. `buildSyncMessages` gắn `dateFrom/dateTo/period` cố định. | Cần **hàm mới** dựng danh sách `PeriodWindow` cho một khoảng ngày tùy ý (nhiều tháng), KHÔNG sửa `currentPeriodWindow` (còn dùng cho cron + "Đồng bộ ngay"). |
| "Đồng bộ ngay" | `apps/api/src/routes/taxAccounts.ts:314` `POST /tax-accounts/:id/sync` — chỉ enqueue kỳ hiện tại, `purchase`+`sold`, trả `202 {enqueued, period}`. Yêu cầu token còn hạn (`409 token_het_han`). | Khuôn producer để nhân bản: U22 cần một producer enqueue **nhiều kỳ** cho khoảng tùy ý. Tái dùng ràng buộc token + cách ly tenant y hệt. |
| `SyncJobMessage` | `packages/sync/src/syncJob.ts` — payload 1 job = 1 tenant × 1 tài khoản × 1 chiều × 1 kỳ; có `period`, `dateFrom`, `dateTo`. Idempotent theo kỳ. | Backfill = phát N kỳ × 2 chiều job cùng dạng message. Consumer hiện tại xử lý được ngay, **không đổi consumer**. |
| `lan_dong_bo` | `packages/db/src/schema/lanDongBo.ts` — mỗi lần đồng bộ ghi 1 bản ghi: `tenant_id, taikhoan_id, chieu, tu_ngay, den_ngay, trang_thai(running/completed/…), so_hd_moi, so_hd_cap_nhat, bat_dau, ket_thuc`. Idempotent theo kỳ (U5). | **Đây là nguồn chân lý "tháng nào đã từng đồng bộ"** — không cần bảng mới để biết phạm vi đã phủ. Truy vấn `lan_dong_bo` theo `(tenant_id, taikhoan_id, chieu)` giao với khoảng ngày. |
| Idempotent | `CLAUDE.md` §Kiến trúc — khóa tự nhiên `(tenant_id,nbmst,khmshdon,khhdon,shdon,tdlap)`, chạy lại cùng kỳ KHÔNG nhân đôi. | Backfill trùng kỳ đã có là **an toàn** (chỉ upsert). Việc "bỏ tháng đã đủ" là tối ưu tải, không phải yêu cầu đúng-sai. |
| Chưa có job-status API | `grep` `apps/api/src` + `apps/web/src`: **không có** route/màn theo dõi tiến độ job nào. `SYNC_QUEUE` chỉ fire-and-forget. | U22 phải **thêm mới** cơ chế theo dõi tiến độ (id backfill + trạng thái từng tháng) để frontend poll. Đây là phần việc lớn nhất của đơn vị. |
| Rate limit | `apps/sync-worker/src/tenantLimiter.ts` — token-bucket + circuit breaker **theo tenant/MST** (Durable Object). | Backfill nhiều tháng của một tenant vẫn tự giới hạn qua limiter sẵn có. **Nhưng** phát một loạt job cùng lúc cần cân nhắc tải (xem §6 Rủi ro — liên quan mục backlog "rate limit toàn cục"). |

**ĐÃ KIỂM CHỨNG (2026-07-16) — cổng B1 ĐÓNG:**
- ✅ **Tháng rỗng thật (0 hóa đơn) VẪN để dấu trong `lan_dong_bo`.** Bằng chứng tái lập: `packages/sync/src/sync.ts:399-427` — sau khi `queryInvoices` trả 0 dòng, `upsertBatch` trả `{soHdMoi:0, soHdCapNhat:0}` (dòng 152) nhưng nhánh Bước 2 VẪN `insert(lanDongBo)` trạng thái `completed`. Consumer nền `apps/sync-worker/src/runJob.ts:47` gọi thẳng `sync()` (không đoản mạch). Test tái lập: `packages/sync/test/integration/sync.test.ts` → *"(U22 B1) tháng RỖNG THẬT … VẪN ghi 1 phiên 'completed'"* (xanh 2026-07-16). **Hệ quả chốt:** `coveredMonths` (AC2/4B) suy ra TRỰC TIẾP từ `lan_dong_bo` — **KHÔNG cần bảng/migration/patch ghi dấu tháng rỗng.** "Đã phủ (kể cả rỗng)" = có ≥1 bản ghi trạng thái thành công phủ tháng; "chưa từng" = không có bản ghi nào.
  - *Lưu ý cho B3:* `lan_dong_bo` lưu `tu_ngay`/`den_ngay` (timestamp), KHÔNG lưu `period`. Backfill + cron + "Đồng bộ ngay" đều phát cửa sổ THÁNG ĐẦY ĐỦ (01→cuối tháng) nên mọi bản ghi đều căn tháng → `coveredMonths` đối chiếu tháng bằng `tu_ngay` (giờ VN) hoặc containment khoảng tháng. Trạng thái tính "đã phủ": `completed` (và cân nhắc `hoan_thanh_mot_phan`) — chốt ở B3.

**CHƯA KIỂM CHỨNG (phải xác minh trong bước hiện thực, chưa được chốt ở kế hoạch này):**
- Giới hạn CPU/wall-time thực tế của Worker khi enqueue một khoảng rất rộng (vd 24 tháng × 2 chiều = 48 message trong một request). Cần đo, không giả định.

---

## 2. Vấn đề & mục tiêu

**Vấn đề:** người dùng lọc một giai đoạn quá khứ (kê khai/đối chiếu quý trước, hoặc tháng bị bỏ sót do token hết hạn cả tháng) thấy danh sách **rỗng** — vì dữ liệu đó **chưa từng được lấy về Neon**, không phải lỗi lọc. Dễ hiểu nhầm là phần mềm mất dữ liệu → mất lòng tin, đánh trực tiếp vào giá trị cốt lõi (đối chiếu – kê khai).

**Mục tiêu U22:** khi người dùng lọc một khoảng có tháng **chưa từng đồng bộ**, hệ thống **tự động backfill ngầm** đúng các tháng thiếu (toàn khoảng), **hiển thị tiến độ theo tháng** trong lúc chạy, và **tự hiển thị kết quả** khi xong — người dùng không cần biết khái niệm "kỳ đồng bộ" hay tự bấm "Đồng bộ ngay".

**Ngoài phạm vi U22 (không làm ở đơn vị này):**
- Rate limit TOÀN CỤC khi gọi GDT (mục backlog riêng — chỉ *tham chiếu* như rủi ro ở §6, không giải quyết ở đây).
- Đổi cron/lịch đồng bộ định kỳ (giữ nguyên `currentPeriodWindow`).
- Đổi consumer/pipeline lấy hóa đơn (U5) — tái dùng nguyên trạng.

---

## 3. Tiêu chí nghiệm thu (Definition of Done cho U22)

Mỗi tiêu chí phải có test tự động phủ, toàn bộ xanh; `make lint` sạch; coverage tầng nghiệp vụ không giảm dưới 80%; không lộ bí mật; cập nhật tài liệu; commit nhỏ theo lát cắt.

1. **AC1 — Tách khoảng thành danh sách tháng.** Cho `tuNgay`/`denNgay` bất kỳ (cùng tháng, nhiều tháng, vắt qua năm), hàm thuần trả đúng danh sách `PeriodWindow` (mỗi tháng: `period`, `dateFrom=01/mm/yyyy`, `dateTo=<ngày cuối>/mm/yyyy`, theo giờ VN). Biên tháng, năm nhuận, đầu/cuối khoảng lệch giữa tháng đều đúng. *(Test thuần, không mạng.)*
2. **AC2 — Biết tháng nào đã phủ.** Cho một tenant × tài khoản × chiều, hàm truy vấn `lan_dong_bo` trả đúng tập tháng **đã từng đồng bộ thành công** giao với khoảng hỏi — phân biệt được "đã phủ (kể cả rỗng)" vs "chưa từng". *(Phụ thuộc kết quả kiểm chứng §1 "CHƯA KIỂM CHỨNG" #1 — nếu tháng rỗng không để dấu, AC2 phải kèm bản vá ghi dấu; xem §5 B1.)*
3. **AC3 — API khởi tạo backfill.** `POST /backfill` (hoặc dưới `tax-accounts/:id/backfill`) nhận khoảng ngày + tài khoản, **chỉ enqueue các tháng còn thiếu** trong khoảng (giao AC1 trừ AC2), phát job đúng dạng `SyncJobMessage` cho cả 2 chiều, trả `202 { backfillId, thangCanLay: [...], tongSoThang }`. Token hết hạn → `409 token_het_han` (như "Đồng bộ ngay"). Cách ly tenant: tài khoản không thuộc tenant → `404`, không rò tồn tại chéo.
4. **AC4 — Theo dõi tiến độ.** `GET /backfill/:id` trả trạng thái tổng + **từng tháng** (`cho | dang_chay | xong | loi`), đủ để frontend dựng thanh "X/N tháng — tháng MM/YYYY…". Cập nhật khi consumer hoàn tất mỗi kỳ. Phạm vi tenant (không xem được backfill tenant khác → 404).
5. **AC5 — Idempotent & an toàn chạy lại.** Gọi backfill trùng khoảng đã có dữ liệu KHÔNG nhân đôi bản ghi hóa đơn (dựa idempotent U5); backfill lại một backfill đang chạy không tạo job trùng vô hạn.
6. **AC6 — Frontend tự kích hoạt + thanh tiến độ.** Trên màn Danh sách hóa đơn: khi bộ lọc chạm khoảng có tháng chưa phủ, UI tự gọi `POST /backfill`, hiển thị **thanh tiến độ theo tháng** (poll `GET /backfill/:id`), KHÔNG để màn trắng/rỗng gây hiểu nhầm; xong thì tự áp lại bộ lọc + hiển thị kết quả. Trường hợp token hết hạn hiển thị thông báo "cần đăng nhập lại tài khoản thuế" rõ ràng, không im lặng.
7. **AC7 — Audit + tôn trọng ràng buộc.** Hành động khởi tạo backfill được ghi audit (như hành động đồng bộ). Không log token/mật khẩu. Mọi query/job gắn `tenant_id` tường minh. Backfill vẫn qua adapter GDT (rate limit/backoff/breaker sẵn có).

---

## 4. Thiết kế (khối chức năng — chi tiết chốt trong bước hiện thực)

### 4A. Tầng thư viện `@vat/sync` (thuần, dễ test)
- **`monthlyWindows(dateFromIso, dateToIso): PeriodWindow[]`** — tách khoảng `YYYY-MM-DD` thành danh sách cửa sổ tháng (giờ VN), tái dùng logic biên tháng của `currentPeriodWindow`. Hàm thuần → phủ test biên đầy đủ (AC1).
- **`buildBackfillMessages(account, windows, directions)`** — tổng quát hoá `buildSyncMessages` cho nhiều cửa sổ. (Có thể chỉ là `windows.flatMap(w => buildSyncMessages([account], w, directions))`.)

### 4B. Tầng truy vấn phủ (`@vat/query` hoặc `@vat/sync`)
- ✅ **`coveredMonths(db, tenantId, taikhoanId, chieu, windows)`** (2026-07-16, `packages/sync/src/coverage.ts`) — đọc `lan_dong_bo` trả tập `period` đã phủ giao khoảng (AC2). **CHỐT trạng thái tính "đã phủ" = CHỈ `completed`** (KHÔNG tính `hoan_thanh_mot_phan`/`running`/`failed`/`can_dang_nhap_lai`): đồng bộ lại idempotent (U5) an toàn → thà backfill lại phần dở còn hơn bỏ sót. Lọc `tenant_id`/`taikhoan_id`/`chieu` tường minh (multi-tenant.md lớp 1) + gọi trong `withTenant` (RLS lớp 2); chỉ đọc cột `tu_ngay`.
- ✅ **`missingMonths = windows − coveredMonths`** — danh sách cửa sổ tháng cần enqueue (giữ thứ tự đầu vào). Đây chính là đầu vào producer B5.

### 4C. Theo dõi tiến độ — nơi lưu trạng thái backfill
- ✅ **CHỐT PA-A: Durable Object `BackfillTracker`** (2026-07-16, chủ dự án chọn — **ADR-0005**). DO chỉ lưu **định nghĩa** backfill (`tenantId, taikhoanId, months[], directions[], createdAtMs`); **tiến độ từng tháng SUY từ `lan_dong_bo`** (B3 `coveredMonths`) ở tầng GET (B6) → **consumer/pipeline U5 KHÔNG bị đụng** (không cần báo "xong kỳ" về DO — sửa lại so với mô tả PA-A cũ, tôn trọng §7). `apps/api/src/backfillTracker.ts` (thuần) + `backfillTrackerDO.ts` (DO wiring), binding `BACKFILL_TRACKER`, migration v4.
- ~~PA-B: bảng Postgres~~ — KHÔNG chọn (thêm migration + ghi chéo từ consumer nền = đụng §7). Lý do đầy đủ: ADR-0005.

### 4D. API (tầng `apps/api`, Hono)
- `POST /tax-accounts/:id/backfill` — producer, khuôn giống `:id/sync` (token check, cách ly tenant, audit), enqueue `missingMonths`, trả `{backfillId, thangCanLay, tongSoThang}`.
- `GET /backfill/:id` — trạng thái tổng + từng tháng.
- (Cân nhắc) endpoint "khoảng này còn thiếu tháng nào" tách riêng để frontend hỏi TRƯỚC khi lọc, tránh vừa lọc vừa mới biết thiếu.

### 4E. Frontend (`apps/web`)
- Trên màn Danh sách hóa đơn: sau khi đổi bộ lọc ngày, hỏi backend "khoảng này đã phủ chưa"; nếu thiếu → gọi `POST …/backfill`, chuyển sang trạng thái **đang backfill** với thanh tiến độ theo tháng (poll `GET /backfill/:id` mỗi vài giây, có backoff), rồi tự áp lại bộ lọc. Trạng thái rỗng THẬT (đã phủ, không có hóa đơn) hiển thị khác trạng thái "đang lấy".

---

## 5. Phân rã bước (lát cắt con — mỗi lát tự chạy + tự test, theo vòng lặp U0–U12)

> Mỗi lát: đọc spec → viết test trước → hiện thực tối thiểu → `make lint && make test` → review chéo subagent → commit nhỏ. **Mỗi lần một lát.**

- **B1 — ✅ XONG (2026-07-16).** Kiểm chứng "tháng rỗng có để dấu không" (research + test, KHÔNG code tính năng). Kết quả: tháng rỗng VẪN ghi `lan_dong_bo` 'completed' → **AC2/4B KHÔNG cần bản vá ghi dấu**; `coveredMonths` suy từ `lan_dong_bo`. Bằng chứng: §1 "ĐÃ KIỂM CHỨNG" + test `sync.test.ts` "(U22 B1)". Cổng đóng, B2+ mở.
- **B2 — `monthlyWindows` + `buildBackfillMessages`** trong `@vat/sync` (AC1). Test thuần, phủ biên tháng/năm/nhuận. Không mạng.
- **B3 — ✅ XONG (2026-07-16).** `coveredMonths`/`missingMonths` (AC2) trong `packages/sync/src/coverage.ts`. Test integration `backfillCoverage.test.ts` (9 ca, PGlite — KHÔNG `vitest-pool-workers`: pg/PGlite không chạy trong workerd, khớp `sync` vitest.config, không gọi GDT thật). Cách ly tenant/tài khoản/chiều + biên; coverage 100% dòng. dod-auditor + security-reviewer: ĐẠT, không lỗ hổng.
- **B4 — ✅ XONG (2026-07-16).** Cơ chế theo dõi tiến độ (AC4, phần primitive): chốt **PA-A Durable Object** (ADR-0005). `BackfillTracker` DO lưu định nghĩa backfill; logic thuần `initDef` (store-once + `conflict` chéo tenant) / `readDef` (phạm vi tenant) trong `apps/api/src/backfillTracker.ts` (6 test, 100% phủ); DO wiring `backfillTrackerDO.ts` (loại coverage); binding + migration v4 (thuần cộng dồn). dod-auditor + security-reviewer: ĐẠT sau khi vá lỗ hổng `/init` echo def chéo tenant. **Wiring vào AppDeps + route để B5 dùng.**
- **B5 — ✅ XONG (2026-07-16).** `POST /tax-accounts/:id/backfill` (AC3, AC5, AC7) trong `apps/api/src/routes/taxAccounts.ts`: tính missingMonths mỗi chiều (B3) → enqueue (B2) → tạo tracker DO (B4) → audit; token 409, cách ly tenant 404, thiếu binding 503, body sai/khoảng đảo ngược 400; khoảng đã phủ → `{backfillId:null, tongSoThang:0}` (idempotent AC5). **Thứ tự enqueue→init→audit** (không tracker mồ côi khi enqueue lỗi). `getBackfillTracker` wiring vào AppDeps + index + test helper. 9 test integration (PGlite + queue/tracker giả). dod-auditor + security-reviewer: ĐẠT (đã vá thứ tự side-effect theo góp ý). B6 (GET) + B7 (frontend) còn lại.
- **B6 — ✅ XONG (2026-07-16).** `GET /backfill/:id` (AC4): đọc def từ tracker DO (phạm vi tenant → 404, không rò chéo) + suy trạng thái từng tháng (cho|dang_chay|xong|loi) + tổng (hoan_thanh|dang_chay|co_loi|can_dang_nhap_lai) từ `lan_dong_bo` (`deriveBackfillStatus` thuần + `monthlyBackfillStatus` DB, `packages/sync/src/coverage.ts`). Route `apps/api/src/routes/backfill.ts` (đọc-only, cả 3 vai). 9 test thuần + 1 integration + 5 route. dod + security: ĐẠT (404 đồng nhất chống dò id chéo tenant).
- **B7 — ✅ XONG (2026-07-17, nâng cấp TRÊN TRUNK).** Frontend thanh tiến độ theo tháng + tự backfill khi kỳ RỖNG (AC6). *Bối cảnh:* trunk (sau khi B1-B6 merge) đã ship nút THỦ CÔNG "Đồng bộ khoảng này" (`RangeSyncPanel`, gọi POST /backfill + /backfill-lines U26). Lát này NÂNG CẤP thay vì làm lại: giữ nút, thêm poll `GET /backfill/:id` (B6) → thanh tiến độ `<progress>` theo tháng; TỰ chạy khi danh sách rỗng (không để màn rỗng gây hiểu nhầm); phân biệt idle/đang lấy/xong/hết phiên (nhắc kết nối lại)/lỗi; xong → tự `invalidate ["invoices"]`; vẫn đồng bộ dòng hàng (U26). `useRangeBackfill.ts` (deriveRangeBackfillState thuần, MỘT instance ở InvoicesPage → không backfill trùng) + `RangeSyncPanel.tsx` (presentational). Nhánh `claude/u22-b7-progress` từ `feat/cloudflare-stack-u0`. Test: máy trạng thái thuần + RangeSyncPanel render + tích hợp (tự chạy/bấm tay non-empty/hoàn thành-làm mới/hết phiên/thiếu khoảng). Sửa cổng coverage (glob `features/**/*.ts`). dod + security: ĐẠT.
- **B8 — Contract/soát khớp cuối** (verification): rà toàn bộ AC, chạy `make test` + `make test-contract` (phát hiện đổi API GDT), review chéo bằng subagent độc lập, cập nhật `docs/BACKLOG` (đánh dấu mục đã lên kế hoạch → trỏ file này) + tài liệu liên quan.

---

## 6. Rủi ro & phụ thuộc

- **Tải GDT khi backfill khoảng rộng (liên quan mục backlog "rate limit TOÀN CỤC").** "Tự lấy toàn bộ khoảng" (quyết định chủ dự án) có thể phát nhiều tháng × 2 chiều job cùng lúc. Limiter theo-tenant sẵn có bảo vệ *một* tenant; nhưng nhiều tenant backfill đồng thời vẫn cộng dồn tải. U22 **không giải mục rate-limit toàn cục** nhưng phải: (a) không phá limiter sẵn có (job vẫn qua adapter), (b) cân nhắc rải job (không cần `sendBatch` tức thời tất cả nếu khoảng quá rộng), (c) ghi chú lại để mục rate-limit toàn cục xử lý sau. **Cần một phép đo tải thật (contract/probe) trước khi chốt "phát tất cả cùng lúc" hay "rải theo lô".**
- **Phân biệt "rỗng thật" vs "chưa phủ"** (§1 CHƯA KIỂM CHỨNG #1) — nếu không giải đúng ở B1, sẽ backfill lặp vô ích tháng rỗng. Đây là rủi ro thiết kế lớn nhất → đặt B1 làm cổng chặn trước.
- **Giới hạn wall-time Worker** khi enqueue khoảng rất rộng — đo ở B5, nếu chạm trần thì rải theo lô/queue trung gian.
- **Phụ thuộc token còn hạn.** Backfill không tự đăng nhập GDT (quyết định A hiện có). Token hết hạn giữa khoảng → một số tháng dừng `can_dang_nhap_lai`; frontend phải báo rõ, tracker phản ánh đúng.

---

## 7. Không làm (ranh giới rõ ràng)
- Không sửa `currentPeriodWindow` / cron / consumer pipeline U5.
- Không phá vỡ cách ly tenant hay RLS.
- Không tự đăng nhập GDT thay người dùng; không phá captcha.
- Không giải mục "rate limit toàn cục" (chỉ tham chiếu như rủi ro).
- Không thêm gói trả phí/hạn mức (mục backlog khác).

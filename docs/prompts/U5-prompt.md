# Prompt thực thi — U5: Dịch vụ đồng bộ idempotent (upsert)

> Sản phẩm của `/write-prompt U5`. Prompt tự chứa để dán vào một phiên `/start-unit U5` (hoặc chạy tay). Bám kế hoạch `docs/plans/U5-plan.md`. Ngày: 2026-07-13.

---

## NHIỆM VỤ (U5): Dịch vụ đồng bộ idempotent (upsert)

Tạo package dịch vụ đồng bộ mới `packages/sync` (`@vat/sync`) cung cấp hàm `sync(...)`: gọi adapter lấy hóa đơn **một chiều** trong **một khoảng ngày** → **upsert idempotent** vào bảng `hoa_don` theo khóa tự nhiên 6 trường (chạy trong `withTenant` để RLS chốt tenant) → ghi **một** bản ghi `lan_dong_bo` với `so_hd_moi`/`so_hd_cap_nhat`. Đây là tầng nghiệp vụ dựng trên schema U4 và adapter U2; U6 (API) và U9 (đồng bộ nền) sẽ gọi lại `sync()`.

**QUAN TRỌNG — U5 KHÔNG sửa `packages/gdt-client` và KHÔNG gọi `fetch()` tới GDT trực tiếp.** Mọi truy cập GDT đi qua `queryInvoices()` của adapter (đã cô lập). Cấu trúc phản hồi API thuế đã được adapter chuẩn hóa thành `InvoiceRow`; *định dạng giá trị* của các trường liên quan (`tdlap`, `ncnhat`, trường tiền) **đã kiểm chứng bằng probe thật** (2026-07-13, ADR-0001 Amendment #7) — xem "KHI GẶP MƠ HỒ" #3 để biết định dạng chốt + giới hạn còn lại.

### Hai quyết định phạm vi ĐÃ CHỐT (chủ dự án 2026-07-13, KHÔNG tự đổi)
- **#A — Tiêu chí (e) "Thông báo thay đổi hóa đơn": HOÃN** sang unit riêng. U5 vẫn **phát hiện** `ttxly`/`tthai` đổi (so cũ↔mới) và **trả trong `SyncResult.changes`**, nhưng **KHÔNG** dựng bảng `thong_bao`/kênh thông báo (tránh lấn mô hình hóa dữ liệu của U4 + tạo nguồn sự thật thứ hai). U5 làm **(a)(b)(c)(d)(f)**.
- **#B — Cấp đồng bộ: CHỈ cấp hóa đơn** (header-level). U5 upsert `hoa_don` + ghi `lan_dong_bo`; **KHÔNG** gọi `getInvoiceDetail`, **KHÔNG** ghi `dong_hang_hoa`. Đồng bộ chi tiết dòng hàng là pass/unit sau.

---

## BỐI CẢNH & MỤC TIÊU — Tiêu chí nghiệm thu (trích `docs/CHECKLIST-NGHIEM-THU.md` mục U5)

Đóng đơn vị khi các tiêu chí sau có test đỏ→xanh:
- **(a)** Chạy đồng bộ 2 lần cùng kỳ → **không nhân đôi** bản ghi.
- **(b)** `ttxly`/`tthai` đổi giữa 2 lần → **cập nhật**, không tạo mới.
- **(c)** Bản ghi lần đồng bộ ghi **đúng** số HĐ mới / số HĐ cập nhật.
- **(d)** Lỗi mạng tạm → retry (đã do adapter `fetchWithRetry` backoff); **401 → dừng + báo**, không retry credential cũ.
- **(f)** **Lịch sử đồng bộ có phiên bản**: mỗi phiên ghi mốc thời gian + số HĐ mới/cập nhật, truy vấn lại được theo tenant (2 phiên → 2 bản ghi phân biệt).
- **(e) HOÃN** (quyết định #A) — ghi rõ lý do khi cập nhật checklist; không hiện thực bảng thông báo.

**Khóa tự nhiên hóa đơn (6 trường, đúng thứ tự):** `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` — là cơ sở upsert idempotent. Adapter khử trùng 5 trường; `tenant_id` bổ sung ở tầng này.

---

## TÀI LIỆU PHẢI ĐỌC TRƯỚC (chỉ phần liên quan, không nạp toàn bộ)

- `docs/plans/U5-plan.md` — **kế hoạch đã duyệt của chính đơn vị này** (phạm vi, 8 test, file, quyết định #A/#B). Đọc TRƯỚC TIÊN.
- `KIEN_TRUC_VA_KE_HOACH.md` **mục 7.2** (logic upsert idempotent — nguồn "làm gì"), **7.1** (thực thể `HoaDon`/`LanDongBo`), **7.3** (`ttxly` lưu mã).
- `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng **142–145** (ví dụ đặc tả + DoD cho U5).
- **Mã đã có — TÁI DÙNG, đọc chữ ký:**
  - `packages/gdt-client/src/query.ts` — `queryInvoices(transport, token, params, opts)`, kiểu `InvoiceRow` (`Record<string,unknown> & { _source, _direction }`), `InvoiceQueryParams` (`direction, dateFrom, dateTo, statuses?, includeSco?, size?`), 401 → `GdtError` code `SESSION_EXPIRED`.
  - `packages/db/src/schema/hoaDon.ts`, `lanDongBo.ts`, `taiKhoanThue.ts` — cột đích của upsert/nhật ký.
  - `packages/db/src/naturalKey.ts` — `HOA_DON_NATURAL_KEY` (6 trường) + `HOA_DON_NATURAL_KEY_CONSTRAINT`.
  - `packages/db/src/tenantContext.ts` — `withTenant(db, tenantId, fn)` (đặt `SET LOCAL app.tenant_id` trong transaction).
  - `packages/db/vitest.config.ts` — **mẫu cấu hình** node + PGlite offline + coverage 80% để nhân cho `packages/sync`.
- `.claude/rules/multi-tenant.md` — mọi truy vấn lọc `tenant_id`; `withTenant` + RLS lớp phòng thủ thứ hai; job nền truyền `tenant_id` tường minh.
- `.claude/rules/gdt-adapter.md` — chỉ `packages/gdt-client` gọi GDT; 401 dừng không retry; không nuốt lỗi.
- `.claude/rules/security.md` — không lưu mật khẩu/token thô; không log token/`raw_json` ở mức INFO+.
- `.claude/rules/testing.md` — TDD; `make test` = unit + integration (offline); coverage ≥ 80%.

---

## HÌNH DẠNG (đề xuất — bám kế hoạch; điều chỉnh nhỏ được nếu giữ nguyên bất biến)

**Chữ ký:**
```ts
interface SyncOptions {
  db: Db;                       // Drizzle client (PGlite trong test, pg thật khi chạy)
  transport: GdtTransport;      // adapter egress hoán đổi được
  token: string;                // token JWT GDT — nhận từ ngoài (U1), KHÔNG tự đăng nhập, KHÔNG persist
  tenantId: string;             // UUID tenant
  taikhoanId: string;           // FK tai_khoan_thue (lan_dong_bo.taikhoan_id NOT NULL)
  direction: "purchase" | "sold";
  dateFrom: string; dateTo: string;  // định dạng adapter kỳ vọng (dd/mm/yyyy)
  statuses?: number[]; includeSco?: boolean; size?: number;  // chuyển thẳng cho queryInvoices
  retry?: RetryOptions;
}
interface SyncResult {
  lanDongBoId: string;
  soHdMoi: number; soHdCapNhat: number;
  trangThai: "completed" | "failed";
  thongDiepLoi?: string;
  changes: Array<{ naturalKey: string; ttxlyCu: number|null; ttxlyMoi: number|null; tthaiCu: number|null; tthaiMoi: number|null }>; // #A: phát hiện, KHÔNG persist
}
```

**Cơ chế upsert (đề xuất):** trong `withTenant(db, tenantId, tx => …)`: 1 lượt `SELECT` bản ghi hiện có theo tập khóa tự nhiên (lọc `tenant_id`) → diff trong bộ nhớ → insert bản mới + update bản có `ttxly`/`tthai`/tiền/`raw_json` đổi (cập nhật `updated_at`), đếm `soHdMoi`/`soHdCapNhat`, gom `changes`.

**Bất biến BẮT BUỘC (test phải chốt):**
1. **Idempotent:** cùng input → chạy lại không tăng số dòng `hoa_don`.
2. **Không ghi dở dang:** nếu upsert lỗi giữa chừng → transaction rollback, `hoa_don` không đổi một phần.
3. **`lan_dong_bo` luôn ghi nhận phiên** (completed hoặc failed) với mốc `bat_dau`/`ket_thuc`; số đếm khớp số dòng **thực sự** ghi.
4. **401 → dừng ngay**, `trangThai='failed'`, không retry credential cũ, không ghi `hoa_don`.

*Gợi ý thứ tự để giữ bất biến (3)+(4):* gọi `queryInvoices` trước (chưa chạm DB); nếu ném → ghi `lan_dong_bo` failed (transaction riêng) rồi trả. Nếu thành công → mở transaction: upsert + ghi `lan_dong_bo` completed (nguyên tử: không có số đếm mà thiếu dữ liệu). Cho phép hiện thực khác miễn giữ đủ 4 bất biến.

---

## RÀNG BUỘC BẮT BUỘC (trích Hiến pháp + Luật — chỉ cái áp dụng cho U5)

- **Cô lập adapter:** U5 **chỉ** gọi `@vat/gdt-client` (`queryInvoices`); **tuyệt đối không** `fetch()` tới `hoadondientu.gdt.gov.vn` trong `packages/sync`; không sửa `packages/gdt-client` (`gdt-adapter.md`).
- **Khóa tự nhiên 6 trường + idempotent:** upsert theo `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`, dựa ràng buộc `hoa_don_natural_key` (U4). Không dùng khóa thiếu `tenant_id` (`multi-tenant.md`).
- **`tenant_id` + RLS:** mọi ghi/đọc trong `withTenant`; insert luôn kèm `tenant_id`; RLS là lớp phòng thủ thứ hai, **không** thay lọc tường minh (`multi-tenant.md`).
- **401 → dừng + báo hết phiên:** bắt `GdtError code SESSION_EXPIRED`, ghi `lan_dong_bo` failed, **không** retry với credential cũ (`gdt-adapter.md`). Lỗi tạm (5xx/timeout) đã do adapter `fetchWithRetry` backoff — U5 không tự retry.
- **Không lưu mật khẩu/token thô:** `sync` nhận `token` qua tham số, **không** persist credential (mã hóa/xoay token = U12); không log token/`raw_json` ở mức INFO+ (`security.md`).
- *KHÔNG áp dụng cho U5 (nêu để khỏi lạc):* giải captcha (không chạm); rate-limit/circuit breaker Durable Object (U9); mã hóa envelope (U12); đồng bộ chi tiết dòng hàng (#B).

---

## YÊU CẦU TDD (viết test TRƯỚC, đỏ → xanh; nhóm theo `.claude/rules/testing.md`)

### Nhóm `unit` — offline, mock `GdtTransport`, không DB thật (`packages/sync/test/unit/`)
1. `mapInvoiceRowToHoaDon`: ánh xạ đủ trường header; `chieu=_direction`, `nguon=_source`, `rawJson` = nguyên row; `tdlap`/`ncnhat` → `Date` đúng; tiền giữ nguyên (không làm tròn/mất số).
2. `mapInvoiceRowToHoaDon` chịu được trường tùy chọn thiếu (`nmmst`/`nmten`/tiền `null`) — không ném; cột null hợp lệ.
3. `sync` khi transport trả **401** (adapter ném `SESSION_EXPIRED`) → `SyncResult.trangThai='failed'`, `thongDiepLoi` có; **không** ghi hóa đơn nào; **không** retry credential cũ. *(Có thể dùng fake db-writer để cô lập nhánh này.)*

### Nhóm `integration` — PGlite (Postgres WASM offline; áp migration U4; seed 1 tenant + 1 `tai_khoan_thue`) (`packages/sync/test/integration/`)
4. **(a)** chạy `sync` hai lần cùng tham số (mock adapter trả cùng tập rows) → số bản ghi `hoa_don` **không tăng** lần hai.
5. **(b)** giữa hai lần, mock đổi `ttxly`/`tthai` của một hóa đơn → **cùng `id` được cập nhật** (giá trị mới), không tạo dòng mới; `so_hd_cap_nhat` phản ánh; `changes` chứa đúng 1 phần tử với cũ→mới.
6. **(c)+(f)** mỗi lần chạy ghi đúng `so_hd_moi`/`so_hd_cap_nhat`; hai lần → **hai bản ghi `lan_dong_bo` phân biệt** (mốc thời gian riêng), truy vấn lại được theo `tenant_id`.
7. **Cách ly tenant** *(bắt buộc — `multi-tenant.md`)*: `sync` cho tenant A không ghi/không lộ dữ liệu sang tenant B; đọc dưới ngữ cảnh B không thấy HĐ của A (`withTenant` + RLS `FORCE`).
8. **(d)** 401 giữa chừng (mock transport trả 401 ở trang thứ hai của phân trang) → `lan_dong_bo.trang_thai='failed'`, bảng `hoa_don` **không đổi** (rollback, không commit dở).

**Không có nhóm `contract`** cho U5 (không gọi GDT thật; không sửa adapter).

---

## LỆNH TỰ KIỂM CHỨNG (dán kết quả vào báo cáo)

- `make lint` — Biome + `tsc --noEmit`, phải sạch.
- `make test` — unit + integration (PGlite offline), phải xanh; coverage `packages/sync` ≥ 80% (loại `src/index.ts` wiring thuần).
- *KHÔNG chạy `make test-contract`* — U5 **không đụng** `packages/gdt-client`, không gọi GDT thật.

---

## QUY TRÌNH BẮT BUỘC

1. Đọc `docs/plans/U5-plan.md` + các mục tài liệu/chữ ký trên. Trình bày kế hoạch ngắn (file sẽ tạo, test sẽ viết) **rồi mới code**.
2. **Viết 8 test trước** (3 unit + 5 integration) thể hiện tiêu chí (a)(b)(c)(d)(f) + cách ly tenant — kể cả ca lỗi/biên. Chạy để thấy **đỏ**.
3. Hiện thực tối thiểu: `mapInvoice.ts` → `upsertHoaDon.ts` (diff/upsert theo khóa) → `sync.ts` (điều phối + `withTenant` + ghi `lan_dong_bo`). Giữ 4 bất biến ở mục "HÌNH DẠNG".
4. `make lint && make test`. Dán kết quả. Đỏ thì tự sửa, lặp tối đa N vòng.
5. Tự rà checklist bảo mật: không persist token/mật khẩu; không log dữ liệu nhạy cảm; mọi truy vấn qua `withTenant` + lọc `tenant_id`; 401 dừng không retry.
6. Commit nhỏ, thông điệp rõ (một đơn vị). **Không** chuyển nhiệm vụ khác.

---

## FILE SẼ TẠO/SỬA (theo `apps/`+`packages/`, ADR-0001)

**Mới — `packages/sync` (`@vat/sync`):**
- `package.json` — deps `@vat/gdt-client`, `@vat/db` (workspace `*`), `drizzle-orm`; dev `@electric-sql/pglite`, `vitest`, `typescript`. Scripts `test` (`vitest run`) + `typecheck` (`tsc --noEmit`).
- `tsconfig.json` (extends base như `packages/db`), `vitest.config.ts` (node + PGlite offline, `include: test/**/*.test.ts`, coverage v8 thresholds 80%, `exclude: src/index.ts`; **KHÔNG** `vitest-pool-workers`), `.dev.vars.example` (`DATABASE_URL`).
- `src/mapInvoice.ts` (`mapInvoiceRowToHoaDon`), `src/upsertHoaDon.ts` (`upsertBatch`), `src/sync.ts` (`sync`), `src/index.ts` (re-export).
- `test/unit/mapInvoice.test.ts`, `test/unit/sync.test.ts`, `test/integration/sync.idempotent.test.ts`.

**Sửa:** root `package.json`/`package-lock.json` (deps mới; workspace `packages/*` tự nhận package). `docs/CHECKLIST-NGHIEM-THU.md` — tick U5 (a)(b)(c)(d)(f) sau khi xanh + ghi **(e) HOÃN** kèm lý do + cập nhật dòng trạng thái tiến độ. *(Makefile KHÔNG cần sửa.)*

---

## CỔNG REVIEW CHÉO (sau khi lint+test xanh, trước khi coi là xong)

- **`security-reviewer`** (BẮT BUỘC — U5 đụng `tenant_id`/RLS/token/dữ liệu tenant): xác nhận không rò rỉ chéo tenant (test 7 + policy `withTenant`), token không bị persist/log, 401 xử lý đúng.
- **`dod-auditor`** (LUÔN): DoD tổng quát — test/coverage/tài liệu/code chết/commit/không lệch Hiến pháp; xác nhận (e) hoãn được ghi trung thực.
- **`contract-guardian`** (KHUYẾN NGHỊ — nhẹ): xác nhận U5 **không** gọi `fetch()` GDT trực tiếp và **không** sửa `packages/gdt-client`; chỉ tiêu thụ `queryInvoices`; 401/lỗi propagate đúng qua adapter. *(Không cần `make test-contract`.)*
- Hoặc gọi gọn: `/qa-unit U5`.

---

## DEFINITION OF DONE (đóng đơn vị khi ĐỦ)

- [ ] 8 test (3 unit + 5 integration PGlite) **đỏ → xanh**; `make test` toàn xanh.
- [ ] Tiêu chí CHECKLIST U5 **(a)(b)(c)(d)(f)** đạt; **(e) HOÃN** ghi rõ.
- [ ] `make lint` sạch; coverage `packages/sync` ≥ 80% (không tụt ngưỡng).
- [ ] `sync` cô lập adapter (không `fetch()` GDT trực tiếp, không sửa `packages/gdt-client`); upsert theo khóa 6 trường; idempotent + không ghi dở dang; 401 dừng không retry.
- [ ] Không persist token/mật khẩu; không log dữ liệu nhạy cảm.
- [ ] `security-reviewer` + `dod-auditor` **PASS** (contract-guardian nếu chạy: PASS).
- [ ] `docs/CHECKLIST-NGHIEM-THU.md` cập nhật (tick U5 + dòng trạng thái). Commit nhỏ, rõ.

---

## KHI GẶP MƠ HỒ — DỪNG VÀ HỎI (không đoán thầm)

- **#3 (định dạng trường trong `InvoiceRow`) — ĐÃ CHỐT bằng probe thật (2026-07-13, ADR-0001 Amendment #7), không còn là điểm mơ hồ:** `tdlap` = chuỗi ISO-8601 UTC **không** mili giây (`YYYY-MM-DDTHH:mm:ssZ`, quan sát luôn `17:00:00Z` = 00:00:00 giờ VN); `ncnhat` = ISO-8601 UTC **có** mili giây; `tgtcthue`/`tgtttbso` = JSON number (có thể dạng khoa học cho giá trị lớn, không phải chuỗi); `ttxly`/`tthai` = JSON integer. Viết `mapInvoiceRowToHoaDon` parse `tdlap`/`ncnhat` bằng ISO-8601 chuẩn (`new Date()`/Zod `.datetime()`), **không** tự cộng/trừ múi giờ thủ công; thêm test cho giá trị tiền dạng khoa học (`E7`/`E8`). Giới hạn còn lại (xem ADR-0001 Amendment #7 mục "Giới hạn của bằng chứng"): mẫu chỉ từ 1 lô hóa đơn máy tính tiền cùng ngày lập, chưa kiểm chứng hóa đơn thường/ngày khác — nếu gặp `tdlap` không khớp mẫu khi thực thi thật, DỪNG và ghi amendment mới, không nới test cho xanh.
- **#4 (nguồn token) — đã đề xuất:** `sync` nhận `token`+`taikhoanId` qua tham số. Nếu yêu cầu đổi sang `sync` tự đọc `tai_khoan_thue.token_hien_tai` → kéo giải mã token/U12 vào sớm: **DỪNG và hỏi** trước khi làm.
- **Bất kỳ mâu thuẫn tài liệu/xung đột phạm vi khác:** DỪNG, nêu rõ thiếu/xung đột gì + phương án đề xuất + cách kiểm chứng, hỏi trước khi code tiếp (Hiến pháp mục "Khi gặp mơ hồ").

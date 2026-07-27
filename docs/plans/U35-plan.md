# U35 — Tầng lưu vết + cảnh báo thay đổi hóa đơn (kèm U35b: sửa 3 trường thuế export)

> Ngày: 2026-07-27 · Trạng thái: **đã chốt thiết kế + đã review chéo độc lập (subagent) và VÁ
> 3 blocker** — SẴN SÀNG THỰC THI. · **Người thực thi: Claude Code.**
> Nguồn quy tắc: `CLAUDE.md` (Hiến pháp), `.claude/rules/{multi-tenant,security,testing,ui}.md`.
> Nguồn gốc nghiệp vụ: `docs/KHAO-SAT-NIBOT-co-che-xuat-du-lieu-2026-07-27.md` §4–5.
> **Xem "Phụ lục Z — Nhật ký review 27/07" ở cuối** để hiểu vì sao bản này khác bản nháp đầu.

Hai đơn vị độc lập trong một tài liệu — **commit riêng từng đơn vị** (không trộn):
- **U35** — lưu vết + cảnh báo thay đổi trạng thái hóa đơn (tầng đồng bộ + API + web).
- **U35b** — sửa 3 trường thuế trong file kết xuất (chỉ `@vat/export` + `@vat/domain`).

---

# PHẦN A — U35: Lưu vết + cảnh báo thay đổi hóa đơn

## A1. Bối cảnh & bằng chứng (đã soi mã + review chéo 27/07 — không điều tra lại)

Một hóa đơn trên hệ thống thuế đổi trạng thái theo thời gian (Mới → Điều chỉnh / Thay thế /
Hủy). Kế toán cần biết để rà lại tờ khai. NIBOT làm điều này (cảnh báo + đánh phiên bản V:554).

**HAI đường đồng bộ — phải phân biệt (bài học review):**

- **Đường production = delta-sync:** `runDeltaJob → keoChunk → syncChunk`
  (`packages/sync/src/chunkSync.ts:329-346`) gọi `upsertBatch` (dòng ~330) và **chỉ lấy
  `{ soHdMoi, soHdCapNhat, detailCandidates }` — KHÔNG tính/không đọc `changes`**. `syncChunk`
  đã có sẵn `opts.lanDongBoId` (dùng ở dòng ~346). Đây là đường phải đấu dây chính.
- **Đường cũ `sync()`** (`packages/sync/src/sync.ts`): `upsertBatch` (dòng ~227) đường
  "đã tồn tại" SELECT trước → so `ttxlyCu !== ttxlyMoi || tthaiCu !== tthaiMoi` → đẩy vào mảng
  `changes` (interface `InvoiceChange`, dòng ~40); comment "U5 chỉ PHÁT HIỆN, không persist".
  **Nhưng `sync()` tạo bản ghi `lan_dong_bo` SAU khi upsert** (insert…returning ở dòng ~556,
  sau upsertBatch ở ~550) → lúc upsert chạy thì phiên đồng bộ CHƯA có `id`. Đường race
  `onConflictDoUpdate` (dòng ~319) ghi đè nguyên tử, **không so cũ/mới** (comment ~310).

**Khoảng trống:** không tồn tại bảng lịch sử thay đổi hóa đơn; `lan_dong_bo`
(`packages/db/src/schema/lanDongBo.ts`) không có cột đánh số phiên bản; `hoa_don`
(`schema/hoaDon.ts`) có `ttxly/tthai/updatedAt/rawJson`, không version, không history.
Đã có **trigger append-only** cho `auditLog` (migration `0002`) làm mẫu; và **cơ chế biến
phiên transaction-local đã chạy production**: `withTenant` (`packages/db/src/tenantContext.ts:20-23`)
đặt `app.tenant_id` bằng `set_config(..., is_local=true)`; RLS đọc bằng
`nullif(current_setting('app.tenant_id', true), '')::uuid` (`schema/_rls.ts:6-16`). ⇒ Đọc biến
phiên trong CÙNG transaction là **đã kiểm chứng**, không phải rủi ro.

## A2. Quyết định đã chốt (trắc nghiệm 27/07)

| # | Câu hỏi | Chốt |
|---|---------|------|
| 1 | Lưu vết ở mức nào | **Cả hai**: bảng lịch sử thay đổi TỪNG hóa đơn + bộ đếm phiên bản mỗi phiên đồng bộ |
| 2 | Người dùng thấy cảnh báo ở đâu | **Trong ứng dụng** (badge + danh sách trên màn Tra cứu). KHÔNG gửi Telegram/email đợt này |
| 3 | Tính là "thay đổi" khi nào | **Chỉ đổi trạng thái** (`ttxly`/`tthai`). Đổi số tiền: xếp v2 |
| 4 | Cột Tiền thuế khi GDT thiếu | **Tự tính khi thiếu** (ưu tiên số GDT khi có) — xem Phần B |
| 5 | Xử lý đường `sync()` cũ | **Vá cả hai đường** (delta-sync + sync() cũ) để an toàn dù đường nào chạy |

## A3. Mô hình dữ liệu (migration Drizzle mới)

### A3.1 Bảng mới `lich_su_thay_doi_hoa_don` (nhật ký thay đổi — bất biến trừ `da_doc`)

Ghi MỘT dòng cho MỖI lần một trường trạng thái đổi giá trị:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | (như bảng khác) | **RLS + FORCE** (multi-tenant.md) |
| `hoa_don_id` | uuid | thành phần FK composite (xem dưới) |
| `truong` | text | `'ttxly'` \| `'tthai'` |
| `gia_tri_cu` | integer nullable | trạng thái trước |
| `gia_tri_moi` | integer nullable | trạng thái sau |
| `lan_dong_bo_id` | uuid nullable | phiên đồng bộ phát hiện |
| `phat_hien_luc` | timestamp default now | |
| `da_doc` | boolean default false | cho badge "chưa đọc"; **cột DUY NHẤT được UPDATE** |

- **FK same-tenant thật (sửa theo review C5):** FK đơn `hoa_don_id → hoa_don.id` KHÔNG ép cùng
  tenant. Dùng **composite FK `(tenant_id, hoa_don_id) → hoa_don(tenant_id, id)`** (cần unique/PK
  phù hợp trên `hoa_don`; nếu chưa có, thêm). Tương tự cân nhắc `(tenant_id, lan_dong_bo_id)`.
- **Idempotent — CHỐT (sửa theo review B3):** unique `(hoa_don_id, truong, gia_tri_moi,
  lan_dong_bo_id)` CHỈ an toàn nếu **INSERT của trigger dùng `ON CONFLICT DO NOTHING`**. Không có
  mệnh đề này, redelivery Queue (cùng `lan_dong_bo_id`) sẽ **vi phạm unique → RAISE → rollback cả
  chunk → sync failed**. Bắt buộc `ON CONFLICT DO NOTHING`.
- **Biên hiếm (review C3):** vì khóa gồm `gia_tri_moi`, chuyển tiếp lặp giá trị trong CÙNG một
  run (B→A→B, cùng `lan_dong_bo_id`) sẽ trùng khóa ở lần `moi=A` thứ hai và bị bỏ. Cực hiếm (mỗi
  run một snapshot GDT). Ghi nhận, không xử thêm đợt này.

### A3.2 Bộ đếm phiên bản đồng bộ (sửa theo review C1)

- **Bảng bộ đếm riêng** `bo_dem_phien_ban(tenant_id PK, gia_tri integer)` — **RLS + FORCE**,
  migration riêng. Cấp số nguyên tử:
  `INSERT … ON CONFLICT (tenant_id) DO UPDATE SET gia_tri = bo_dem_phien_ban.gia_tri + 1
  RETURNING gia_tri` — tránh race của `MAX()+1`.
- Thêm cột `so_phien_ban` integer nullable trên `lan_dong_bo`; gán từ bộ đếm khi một phiên
  **hoàn thành** (`trangThai='completed'`). Hiển thị "V:{so_phien_ban} lúc {ketThuc}".
- **Lưu ý ngữ nghĩa (review C1):** delta-sync mở NHIỀU `lan_dong_bo` mỗi kỳ (mỗi chuỗi kéo một
  run) → số phiên bản phình nhanh, khác "V:554" đơn nhất của NIBOT. Chấp nhận đợt này; nếu muốn
  một số phiên bản/tenant/ngày thì tính ở tầng hiển thị (v2). Ghi rõ để không hiểu nhầm.

## A4. Backend — persist thay đổi qua TRIGGER + đấu dây CẢ HAI đường (trục 1)

**Cách chốt: trigger DB (bắt thay đổi ở tầng gần dữ liệu nhất → phủ mọi đường ghi, không sót).**
Review xác nhận trigger `AFTER UPDATE` kích hoạt cho cả hàng bị `onConflictDoUpdate` → đóng được
lỗ hổng đường race; INSERT hóa đơn mới KHÔNG kích hoạt → không nhiễu lần đồng bộ đầu.

1. **Trigger `AFTER UPDATE ON hoa_don`** (migration mới, mẫu trigger `auditLog` 0002): khi
   `OLD.ttxly IS DISTINCT FROM NEW.ttxly` → `INSERT … ON CONFLICT DO NOTHING` một dòng
   `lich_su…` (`truong='ttxly'`); tương tự `tthai`. `lan_dong_bo_id` lấy từ
   **`nullif(current_setting('app.lan_dong_bo_id', true), '')::uuid`** (guard chuỗi rỗng theo
   `_rls.ts:6-16` — sửa theo review S1; thiếu guard sẽ ném 22P02 ở mọi UPDATE `hoa_don` ngoài
   đường đồng bộ). Biến rỗng → `lan_dong_bo_id = NULL` (vẫn ghi lịch sử, chỉ khuyết liên kết phiên).

2. **Đấu `app.lan_dong_bo_id` vào CẢ HAI đường (quyết định #5):**
   - **delta-sync:** `syncChunk` đã có `opts.lanDongBoId` (`chunkSync.ts:346`) → set biến phiên
     trước khi upsert trong cùng transaction.
   - **sync() cũ:** **ĐẢO THỨ TỰ (sửa theo review B1):** mở `lan_dong_bo` trạng thái `running`
     + lấy `id` **TRƯỚC** `upsertBatch`; set biến phiên; upsert; rồi cập nhật `completed` +
     `so_phien_ban`. (Hiện `sync()` tạo phiên SAU upsert → trigger không có id để bám.)
   - **Cơ chế đặt biến:** mở rộng/bọc `withTenant` (`tenantContext.ts:20-23`) để nhận thêm
     `lanDongBoId?` và `set_config('app.lan_dong_bo_id', …, true)` cùng chỗ đặt `app.tenant_id`
     (một nơi, hai call-site cùng dùng). Claude Code xác nhận chữ ký thực tế trước khi sửa.

3. **Nguồn sự thật DUY NHẤT là trigger.** Mảng `changes` cũ ở `sync.ts` (đường delta còn không
   tính) chỉ để đếm/log nếu tiện — KHÔNG persist song song (tránh hai nguồn ghi → trùng).

4. **Gán `so_phien_ban`** khi đóng phiên `completed` (A3.2), cả hai đường.

> **Rủi ro đã đánh giá lại (review S2):** tính transaction-local của `set_config(is_local=true)`
> ĐÃ chạy production cho RLS (`tenantContext.ts` + `_rls.ts`) → trigger đọc trong cùng transaction
> **không phải rủi ro**. Rủi ro thật là thứ tự (B1), đấu dây (B2), conflict (B3) — đã xử ở trên.
> Không cần "phương án B" phòng rủi ro không thật; nếu Claude Code vẫn muốn fallback ứng dụng thì
> phải TỰ dựng lại phát hiện thay đổi trong đường delta (tốn hơn) — ưu tiên trigger.

## A5. API (apps/api)

- `GET /invoices/changes` — danh sách thay đổi gần đây của tenant (phân trang, `?unread=1`,
  `?tuNgay/&denNgay`), join hóa đơn trả kèm định danh (ký hiệu/số HĐ, người bán) + **số chưa đọc**
  cho badge (hoặc `GET /invoices/changes/count`).
- `POST /invoices/changes/mark-read` — đánh dấu đã đọc (`ids[]` hoặc "tất cả"); chỉ cập nhật
  `da_doc`. RBAC vai đọc hóa đơn (`canViewInvoices`); **lọc `tenant_id`** tường minh.
- Không endpoint nào chạm GDT (thuần đọc kho nội bộ, như `listInvoices`).

## A6. Frontend (apps/web) — cảnh báo trong ứng dụng

- Màn **Tra cứu hóa đơn**: thêm **badge** "Hóa đơn vừa thay đổi (N)" (N = số chưa đọc). Bấm mở
  **panel**: mỗi dòng nêu định danh HĐ + câu thật "Trạng thái: {nhãn cũ} → {nhãn mới}, phát hiện
  {thời điểm}" + liên kết tới hóa đơn. Hiển thị "V:{so_phien_ban}" phiên gần nhất (tùy chọn, nhẹ).
- Nhãn trạng thái lấy từ **Registry một-nguồn-sự-thật** (ui.md); mã `ttxly/tthai` chưa map →
  bổ sung ở Registry (đồng bộ quyết định U6). Xem panel → `mark-read` → badge về 0.
- Chỉ token + primitive (thêm nếu thiếu, KHÔNG tô inline); gate `canViewInvoices`; trạng thái
  rỗng ("Chưa có thay đổi nào") tử tế.

## A7. Đa tenant, bảo mật, rủi ro

- Bảng mới `lich_su…` và `bo_dem_phien_ban`: **RLS + FORCE** theo `tenant_id`; composite FK
  same-tenant (A3.1). Mọi truy vấn gắn `tenant_id` tường minh (phòng thủ kép).
- Audit log (`security.md`): cân nhắc ghi `auditLog` cho hành động `mark-read` nếu thuộc nhóm
  nhạy cảm; KHÔNG lưu bí mật.
- **Nhiễu badge / hiệu năng:** kỳ đồng bộ lớn có thể sinh nhiều thay đổi — badge đếm, panel phân
  trang, index trên `(tenant_id, da_doc, phat_hien_luc)`.
- **Backfill (review C4):** trigger chỉ bắt thay đổi TƯƠNG LAI; hóa đơn đã đổi trước khi bật
  tính năng không có lịch sử; `lan_dong_bo` cũ có `so_phien_ban = NULL`. Chấp nhận, nêu rõ.

## A8. Kiểm thử (TDD — đỏ trước; testing.md, phủ ≥80% nghiệp vụ)

- **Migration/DB:** bảng mới có **RLS test cả role owner LẪN non-owner** (multi-tenant.md:17, vì
  FORCE); unique + `ON CONFLICT DO NOTHING` chống trùng redelivery; composite FK chặn chéo tenant.
- **Trigger:** INSERT đúng khi `ttxly`/`tthai` đổi; KHÔNG khi không đổi; KHÔNG khi tạo hóa đơn
  mới (INSERT); **ca biến phiên `app.lan_dong_bo_id` CHƯA set → không ném lỗi, ghi
  `lan_dong_bo_id=NULL`** (bắt lỗi guard S1); redelivery cùng phiên → không thêm dòng.
- **`packages/sync` — CẢ HAI đường:** delta-sync (`chunkSync`) và `sync()` cũ đều sinh lịch sử
  đúng; **đường race `onConflictDoUpdate` cũng sinh lịch sử**; `sync()` sau khi đảo thứ tự vẫn
  chạy đúng (phiên `running` trước, `completed` sau); `so_phien_ban` tăng nguyên tử, không trùng
  khi hai phiên gần nhau.
- **apps/api:** `GET /invoices/changes` lọc đúng tenant + phân trang + `unread`; `mark-read` chỉ
  đổi `da_doc`; RBAC 403 đúng vai; không rò tenant khác.
- **apps/web:** badge đúng số chưa đọc; panel render "từ→thành" bằng nhãn Registry; xem →
  mark-read → badge 0; trạng thái rỗng; `ui-luat.test.ts` XANH; convention test không vỡ.

## A9. Định nghĩa hoàn thành (DoD — cổng Stop hook)

`make lint` + `make test` XANH toàn repo; phủ không giảm; `make migrate` chạy được + **migration
reversible** (down); RLS (owner+non-owner) + RBAC nguyên vẹn; không lộ bí mật; thay đổi trạng thái
**lưu vết đầy đủ qua CẢ hai đường ghi + đường race** (có test); cảnh báo hiện đúng trong ứng dụng;
cập nhật lộ trình `KIEN_TRUC_VA_KE_HOACH.md` mục 12; commit nhỏ, rõ, KHÔNG trộn với U35b.

---

# PHẦN B — U35b: Sửa 3 trường thuế trong file kết xuất

## B1. Bối cảnh & bằng chứng (đã soi mã + review 27/07)

- **`tsuat` "Thuế suất"** (`packages/domain/src/flatExport.ts:51`, `kieu:"num"`; render
  `packages/export/src/columns.ts:278` = `numCell(r.tsuat)` = `String(v)`): **xuất số thô `0.08`**.
  `xlsx.ts:136` chỉ có 1 numFmt `#,##0`, **không** numFmt phần trăm. `tsuat` lưu dạng phân số
  `0.08` (`detailLines.ts:51`).
- **`tsuatTien` "Tiền thuế"** (`columns.ts:279` = `numCell(r.tsuatTien)`): đọc thẳng `tthue` GDT
  (`detailLines.ts:52`), **không tự tính**, GDT có thể null → ô trống.
- **`tongSauThue` "Tổng tiền (sau thuế)"** (`columns.ts:241-246`): công thức `thtien + tsuatTien`
  đúng (cộng BigInt `congThapPhan`), NHƯNG đọc thẳng `r.tsuatTien` → **KHÔNG tự đúng** nếu chỉ sửa
  renderer cột Tiền thuế (sửa theo review S3).
- **KCT/KKKNT có `tsuat = 0`** (số, không null — `columns.ts:210-213`), giống 0% thật (review S5).

## B2. Việc cần làm

**(1) `tsuat` → hiện phần trăm 8% (không phải 0,08).**
- **xlsx:** thêm numFmt phần trăm **custom `165` = `0%`** vào `xlsx.ts` — **KHÔNG dùng built-in
  10 (là `0.00%`)** (sửa theo review S4). Bump `numFmts count` (hiện 1) và `cellXfs count` (hiện
  4) ở `xlsx.ts:136`; thêm style index song song `STYLE_MONEY` (dòng 27, 63) + cờ cột `percent`.
  Giá trị ô GIỮ `0.08` → Excel hiện "8%".
- **csv:** render chuỗi "8%" (nhân 100 + "%": `0.08→"8%"`, `0.1→"10%"`, `0.085→"8.5%"`).
- **Phân biệt 0% thật vs KCT/KKKNT (sửa theo review S5):** đọc `ltsuat` — nếu `ltsuat` là mã chữ
  (KCT/KKKNT/…) hoặc `tsuat` null → **để trống** (KHÔNG in "0%"); chỉ format phần trăm khi `tsuat`
  là số thuế suất (kể cả 0 khi `ltsuat` = "0%"). KHÔNG đổi cột `ltsuat`.
- Thread kiểu ô "percent" xuyên encoder (giá trị số + cờ percent; xlsx áp numFmt, csv format chuỗi).

**(2) `tsuatTien` "Tiền thuế" → tự tính khi GDT thiếu (quyết định #4), CHUẨN HÓA MỘT NƠI.**
- **Sửa theo review S3:** KHÔNG chỉ sửa renderer cột Tiền thuế. **Chuẩn hóa `tsuatTien` tính được
  lên chính `r` ở tầng trên (một chỗ, trước khi render cột)**, để CẢ `tsuatTien` LẪN `tongSauThue`
  cùng đọc một giá trị. Quy tắc: `r.tsuatTien` có → giữ (số GDT là chuẩn); null + có `thtien` &
  `tsuat` (thuế suất số) → tính `tienThue = round(thtien × tsuat)` về **đồng nguyên** (0 thập
  phân, làm tròn nửa lên); dòng không chịu thuế (KCT/KKKNT, hoặc tsuat null) → **để trống**.
- Cần helper **nhân thập phân** chính xác (tiền `numeric` có thể > 2^53 — KHÔNG `parseFloat`).
  Kiểm `packages/**` có helper nhân chưa (đã có `congThapPhan` cho cộng); chưa có → thêm
  `tinhTienThue(thtien, tsuat)` bằng BigInt (vd `tsuat=0.08` → `thtien*8/100` làm tròn). Đây là
  **dẫn xuất hợp lệ, không phải bịa số** — ưu tiên số GDT khi có; ghi rõ trong test/nhãn nếu cần.
- `tongSauThue` khi đó tự đúng vì đọc cùng `r.tsuatTien` đã chuẩn hóa.

## B3. Kiểm thử (TDD)

- `@vat/export`:
  - `tsuat`: xlsx có numFmt `0%` (custom 165) gán đúng cột, giá trị ô vẫn `0.08`, count numFmts/
    cellXfs bump đúng; csv ra "8%"; **KCT/KKKNT (tsuat=0, ltsuat mã chữ) → TRỐNG, không "0%"**;
    tsuat null → trống.
  - `tsuatTien`: GDT có `tthue` → giữ; GDT null + có thtien/tsuat → `round(thtien×tsuat)` (ca số
    lớn > 2^53 kiểm bằng BigInt); dòng không thuế → trống.
  - `tongSauThue`: sau chuẩn hóa `tsuatTien`, `= thtien + tienThue` đúng; một vế trống → trống.
  - Cập nhật **golden test** (đổi có chủ đích — ghi rõ, KHÔNG âm thầm sửa golden).
- `@vat/domain`: nếu đổi metadata cột `tsuat`, catalog vẫn 29 key, 16 mặc định, thứ tự §4.

## B4. DoD (U35b)

`make lint` + `make test` XANH; golden cập nhật có chủ đích; xlsx mở bằng Excel hiện "8%" ở cột
Thuế suất (và TRỐNG cho KCT/KKKNT), Tiền thuế + Tổng sau thuế có số kể cả khi GDT thiếu tthue;
CSV hiện "8%"; KHÔNG đổi phạm vi dữ liệu tenant, KHÔNG đổi cột khác; commit riêng, KHÔNG trộn U35.

---

## Phụ lục — thứ tự giao & lưu ý cho Claude Code

1. **Xác nhận số U** (hiện U34 cao nhất → U35). Lộ trình trong `CLAUDE.md` đã cũ (dừng U16b) —
   không dựa vào đó; nguồn chân lý là `KIEN_TRUC_VA_KE_HOACH.md` mục 12 + `docs/plans/`.
2. Làm **U35b trước** (nhỏ, độc lập, rủi ro thấp) rồi **U35** — **hai commit tách bạch**.
3. Theo vòng lặp `/start-unit`: đọc spec → kế hoạch ngắn → **viết test trước** → hiện thực tối
   thiểu → `make lint && make test` → xanh thì review chéo bằng subagent + commit.
4. **Nguyên tắc bằng chứng:** chỗ phải giả định về Postgres (trigger, biến phiên, composite FK)
   → kiểm chứng bằng test tích hợp thật, ghi kết quả; không "chốt mù".

---

## Phụ lục Z — Nhật ký review chéo 27/07 (vì sao bản này khác bản nháp đầu)

Bản nháp đầu đã qua review chéo bằng subagent kiến trúc độc lập. Ba **blocker** đã vá vào thân
bài:
- **B1 — thứ tự `sync()`:** hàm cũ tạo `lan_dong_bo` SAU upsert → trigger không có `id` để bám.
  Đã yêu cầu **đảo thứ tự** (mở phiên `running` trước) — §A4.2.
- **B2 — nhầm pipeline:** đường production là **delta-sync** (`chunkSync.ts`), không phải `sync()`,
  và delta **không hề tính `changes`**. Đã đấu `app.lan_dong_bo_id` vào **cả hai** đường qua
  `withTenant` mở rộng — §A1, §A4.2.
- **B3 — conflict:** unique key chỉ chống trùng nếu trigger `INSERT … ON CONFLICT DO NOTHING`;
  thiếu sẽ rollback cả chunk. Đã bắt buộc — §A3.1, §A4.1.

Các **nên sửa** đã vá: guard `nullif(current_setting(...),'')::uuid` (S1); khung rủi ro dựa vào
bằng chứng RLS thay vì lo "SET LOCAL qua Hyperdrive" không thật (S2); `tongSauThue` KHÔNG tự đúng —
phải chuẩn hóa `tsuatTien` một nơi (S3); numFmt custom `165=0%` chứ không phải built-in `10=0.00%`
(S4); ca `tsuat=0` của KCT/KKKNT phải để trống (S5). **Cân nhắc** đã đưa vào: bộ đếm phiên bản
nguyên tử + RLS (C1), test RLS owner/non-owner + ca biến phiên rỗng (C2), backfill nêu rõ (C4),
composite FK same-tenant (C5).

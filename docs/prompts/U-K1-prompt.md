# U-K1 — Dựng Registry miền hoá đơn (nguồn sự thật) + `EXPORT_COLUMNS` dẫn xuất

**Loại:** đơn vị công việc (một lần một đơn vị). **Nền:** khung `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md`, Luật `.claude/rules/ui.md`.
**Kim chỉ nam:** khai báo một lần — chiếu ra nhiều bề mặt.

## Mục tiêu

Tạo **Registry miền hoá đơn** dạng gói dùng chung, có kiểu, và làm `EXPORT_COLUMNS` (file xuất) **dẫn xuất** từ Registry thay vì tự khai. Đây là bước đầu biến "tập trường hoá đơn định nghĩa 4 nơi" về một nguồn — **không đổi hành vi file xuất**, chỉ đổi *nguồn* của nó.

> U-K1 CHỈ đụng tầng dữ liệu + file xuất. Bảng UI (`InvoiceTable`) và allowlist server (`filters.ts`) **để U-K2** — một lần một đơn vị.

## Đọc trước

- `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md` (Phần C: Registry; Phần G5: tiêu chí nghiệm thu).
- `packages/export/src/columns.ts` — `EXPORT_COLUMNS` hiện tại (nguồn cần rút về Registry).
- `apps/web/src/lib/statusLabels.ts` — lớp nhãn mã trạng thái (không lặp lại ở Registry, chỉ tham chiếu).
- `.claude/rules/ui.md`, `.claude/rules/testing.md`.

## Phạm vi

**TRONG:**
- Gói mới `packages/domain` (npm workspace, TypeScript thuần, không phụ thuộc runtime).
- Kiểu `InvoiceField` + mảng `INVOICE_FIELDS` (Registry) + bộ chọn: `fieldsForExport()`, `fieldsForTable()`, `sortableKeys()`, `labelOf(key)`.
- Sửa `packages/export/src/columns.ts`: `EXPORT_COLUMNS` **dẫn xuất** từ `INVOICE_FIELDS` (lọc `tren.fileXuat`, giữ NGUYÊN thứ tự + nhãn + ánh xạ `kind`).

**NGOÀI (không làm ở U-K1):**
- Không sửa `InvoiceTable.tsx`, `FilterBar.tsx`, `filters.ts` (allowlist/Zod), `types/api.ts`.
- Không đổi encoder csv/xlsx, không đổi thứ tự/nhãn cột file xuất, không đổi sheet.
- Không thêm/bớt trường nghiệp vụ. `tgia` vẫn loại (M3); `ttxly`/`tthai` vẫn xuất MÃ.

## Thiết kế Registry (bám Phần C)

`InvoiceField` tối thiểu: `key`, `nhan`, `kieu` (`text|ngay|tien|ma|enum|list`), `tren:{bang?,fileXuat?,chiTiet?}`, và (khai sẵn cho U-K2, chưa dùng ở U-K1) `locDuoc?`, `sapDuoc?`, `enum?`, `canh?`. `INVOICE_FIELDS` phải **tái tạo CHÍNH XÁC** danh sách `EXPORT_COLUMNS` hiện tại (đúng key, đúng `nhan` = label hiện có, đúng thứ tự, `kind` cũ ↔ `kieu` mới) — vì đầu ra file xuất phải bất biến.

## Tiêu chí nghiệm thu (test-first)

1. **Đầu ra file xuất KHÔNG đổi** — test "golden": với một tập hoá đơn cố định, header + mọi dòng của csv và xlsx **giống hệt** trước khi refactor (chụp fixture từ đầu ra hiện tại rồi so).
2. **Dẫn xuất đúng** — test: `EXPORT_COLUMNS` bằng đúng `deriveExportColumns(INVOICE_FIELDS)` (key/nhãn/kind/thứ tự). Sửa lệch Registry ⇒ test đỏ.
3. **Một nguồn nhãn** — test: mọi nhãn cột file xuất đến từ `INVOICE_FIELDS[].nhan` (không có chuỗi nhãn rời trong `columns.ts`).
4. **Kiểu ép dẫn xuất** — `EXPORT_COLUMNS` mang kiểu suy từ Registry; `tsc --noEmit` xanh (thêm cột không qua Registry ⇒ lỗi biên dịch).

## Các bước (vòng lặp chuẩn)

1. Đọc bối cảnh trên + chốt danh sách trường đối chiếu `EXPORT_COLUMNS`.
2. Viết test (1)–(3) trước — để đỏ.
3. Dựng `packages/domain` + `INVOICE_FIELDS` + bộ chọn; refactor `columns.ts` cho `EXPORT_COLUMNS` dẫn xuất.
4. `make lint && make test` → đỏ thì sửa và lặp.
5. Review chéo bằng subagent độc lập (đối chiếu đầu ra file xuất trước/sau).
6. Commit nhỏ, thông điệp rõ (chỉ U-K1). Cập nhật `docs/design` nếu thực thi lệch thiết kế.

## Ràng buộc bắt buộc

- **Nguyên tắc bằng chứng:** nhãn/kind trong Registry phải khớp đầu ra ĐÃ CÓ, không "cải thiện" nhãn ở U-K1 (đổi nhãn là việc riêng, có chủ đích, ở U-K2 khi gộp bảng).
- **Không nới an toàn:** không đụng Zod `invoiceFilterSchema` và allowlist `ORDER BY` (U-K2).
- **Đa tenant:** Registry chỉ mô tả trình bày; không mang dữ liệu tenant.
- **DoD:** `make lint` sạch, `make test` xanh, coverage không giảm dưới ngưỡng, không lộ bí mật, commit nhỏ.

## Đính kèm A — Vá khoảng hở audit (từ `docs/audit/AUDIT-hooks-2026-07-22.md`)

- **Matcher hook (khoảng hở #1):** `.claude/` khoá ghi trong phiên Cowork nên giao **bản vá** để chủ dự án tự chép: trong `.claude/settings.json`, đổi matcher `"Edit|Write"` → `"Edit|Write|MultiEdit|NotebookEdit"` ở PreToolUse và PostToolUse — **chỉ khi** xác nhận các tool đó đang bật. (Xác nhận danh sách tool trước; không thêm bừa.)
- **Grep hex/inline-style (khoảng hở #2):** **HOÃN sang U-K3** (khi refactor `FilterBar`/primitive). Lý do bằng chứng: `FilterBar.tsx` còn `selectStyle/inputStyle` nội tuyến — thêm grep chặn NGAY sẽ làm CI đỏ trước khi có bản sửa. Thêm phép kiểm cùng đơn vị fix nó.
- **Hệ kiểu (khoảng hở #3):** đã xử lý một phần ở U-K1 (Registry có kiểu). CI (`typecheck` + `make test`) là cổng bắt cả khi sửa tay ngoài phiên Claude.

## Đính kèm B — Chủ dự án review gì (tiêu chí nào, cổng nào)

**Xem bằng mắt (không cần kỹ thuật):**
- Mở một file xuất thật **trước và sau** → phải **giống hệt** (tiêu chí 1).
- Xem diff: chỉ chạm `packages/domain/*` + `packages/export/src/columns.ts` + test. Không đụng bảng/UI/allowlist.

**Tiêu chí nghiệm thu:** (1) đầu ra file xuất bất biến; (2) `EXPORT_COLUMNS` dẫn xuất; (3) một nguồn nhãn; (4) coverage không giảm.

**Cổng chứng minh (tự động):**
- `auto-lint.sh` (PostToolUse) — style/lint tức thì sau mỗi sửa.
- `gate-dod.sh` (Stop) — ép `make lint && make test` xanh mới cho kết thúc lượt.
- CI `quality` — `biome check` + `typecheck` + `make test` (ép coverage ≥80%) trên PR.
- `tsc` — dẫn xuất sai kiểu = đỏ.

Chỉ khi **tất cả cổng xanh** + hai lần xem mắt ở trên khớp thì U-K1 mới coi là "xong".

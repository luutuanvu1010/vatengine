# U-K2 — Bảng hoá đơn + allowlist server đọc Registry (hết lệch nhãn)

**Loại:** đơn vị công việc (một lần một đơn vị). **Phụ thuộc:** U-K1 đã xong (đã có `packages/domain` + `INVOICE_FIELDS`).
**Nền:** `.claude/rules/ui.md`, `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md` (Phần C).

## Mục tiêu

Cho **bảng danh sách** (`InvoiceTable`) và **allowlist lọc/sắp phía server** (`filters.ts`) **dẫn xuất từ Registry** thay vì khai tay. Kết quả: một nguồn nhãn duy nhất → **hết lệch** "Tổng TT" (bảng) vs "Tổng thanh toán" (file xuất).

## Đọc trước

- `packages/domain/*` (Registry từ U-K1).
- `apps/web/src/features/invoices/InvoiceTable.tsx` — cột khai tay hiện tại (`<ThMenu …>`).
- `packages/query/src/filters.ts` — `SORT_COLUMNS` (allowlist ORDER BY), `invoiceFilterSchema` (Zod).
- `apps/web/src/lib/statusLabels.ts`, `.claude/rules/ui.md`, `.claude/rules/multi-tenant.md`.

## Phạm vi

**TRONG:**
- Bổ sung thuộc tính trình bày vào `INVOICE_FIELDS` (đã khai khung ở U-K1): `tren.bang`, `nhanNgan?` (nhãn rút gọn cho cột hẹp), `locDuoc` (`false|'text'|'range'|'enum'`), `sapDuoc`, `enum?` (chiều/nguồn), `canh?` (`'phai'` cho tiền).
- `InvoiceTable.tsx`: sinh cột bằng cách duyệt `fieldsForTable()` — **không** khai `<ThMenu>` từng cột bằng tay. Nhãn cột = `nhanNgan ?? nhan` (lấy từ Registry, KHÔNG gõ chuỗi trong bảng). Kiểu ô lọc/tuỳ chọn/khả năng sắp lấy từ field.
- `filters.ts`: `SORT_COLUMNS` **dẫn xuất** từ `sortableKeys()` của Registry (giữ ánh xạ key→cột Drizzle trong một bảng tra). Vẫn là allowlist đóng.

**NGOÀI:**
- Không sửa `FilterBar.tsx` (U-K3), không đổi Zod `invoiceFilterSchema` (chỉ *đọc* danh sách trường lọc từ Registry, không nới).
- Giữ nguyên các ô đặc biệt là renderer riêng, khai qua cờ Registry hoặc ngoại lệ có ghi chú: cột chọn (checkbox), link số HĐ, và 2 cột tóm tắt dòng hàng (`Hàng hóa, dịch vụ`/`Số lượng` — vốn là sub-select, không lọc/sắp).

## Tiêu chí nghiệm thu (test-first)

1. **Hết lệch nhãn** — test: mọi tiêu đề cột bảng thuộc `{field.nhan, field.nhanNgan}` của đúng field; KHÔNG có chuỗi nhãn literal trong `InvoiceTable.tsx`. (Hiện ĐỎ vì "Tổng TT" ≠ nhãn Registry; sau khi rút về Registry → XANH.)
2. **Allowlist dẫn xuất, vẫn đóng** — test: tập khóa `SORT_COLUMNS` bằng đúng `sortableKeys()`; khóa lạ vẫn bị từ chối (giữ chống SQL injection).
3. **Hành vi không đổi** — mọi test lọc/sắp/phân trang hiện có vẫn xanh.
4. **Kiểu ép** — bảng + allowlist tiêu thụ `InvoiceField` có kiểu; `tsc` xanh.

## Các bước (vòng lặp chuẩn)

1. Đọc bối cảnh; liệt kê cột bảng hiện tại ↔ field Registry tương ứng (gồm `nhanNgan` cho cột đang dùng nhãn ngắn: "Tổng TT", "TT xử lý", "Ký hiệu · Số HĐ"…).
2. Viết test (1)–(2) trước — để đỏ.
3. Bổ sung thuộc tính trình bày vào Registry; refactor `InvoiceTable` duyệt Registry; refactor `SORT_COLUMNS` dẫn xuất.
4. `make lint && make test` → đỏ thì sửa, lặp.
5. Review chéo bằng subagent (đối chiếu bảng trước/sau: cùng cột, cùng thứ tự, nhãn nay thống nhất với file xuất).
6. Commit nhỏ (chỉ U-K2).

## Ràng buộc bắt buộc

- **Thay đổi nhãn thấy được là CÓ CHỦ Ý:** sau U-K2, vài nhãn bảng đổi cho khớp nguồn chung (vd cột trạng thái). Ghi rõ trong mô tả commit để chủ dự án thấy.
- **Không nới an toàn:** allowlist chỉ *dẫn xuất*, không mở; Zod giữ nguyên; mọi truy vấn vẫn gắn `tenant_id`.
- **Nguyên tắc bằng chứng:** nhãn mã trạng thái vẫn qua `statusLabels.ts` (chỉ nhãn mã đã kiểm chứng).

## Definition of Done + cổng
`make lint` sạch · `make test` xanh (gồm test no-drift) · coverage không giảm · `tsc` xanh · review chéo · commit nhỏ. Cổng ép: `gate-dod.sh` (Stop) + CI `quality` (required) + `tsc`.

## Chủ dự án review gì
- **Xem:** bảng vẫn đủ cột/đúng thứ tự; nhãn nay khớp file xuất (vd "Tổng thanh toán" thống nhất).
- **Tiêu chí:** (1) hết lệch nhãn · (2) allowlist vẫn đóng · (3) lọc/sắp không đổi hành vi.
- **Cổng:** `make test` (test no-drift) → Stop + CI; `tsc`.

# U-K3 — Primitive Select/Field + bộ chọn kỳ dropdown (giao yêu cầu 1)

**Loại:** đơn vị công việc. **Phụ thuộc:** U-K1 (Registry). **Nền:** `.claude/rules/ui.md`.
**Giao yêu cầu ban đầu (1):** chọn **tháng/quý/năm cụ thể** bằng dropdown, thân thiện điện thoại.

## Mục tiêu

Bổ sung primitive form còn thiếu (`Select`, `Field`), dựng pattern **`ChonKy`** (Tháng/Quý/Năm dạng dropdown chọn kỳ *bất kỳ*), và **dọn tô kiểu nội tuyến** trong `FilterBar`. Kèm **bật phép kiểm convention** (không hex/không inline-style) — đặt ở đơn vị này vì đây là nơi dọn sạch, test xanh ngay.

## Đọc trước

- `apps/web/src/components/ui/primitives.tsx` (đã có `Button`, `TextField`, `Card`, `Alert`).
- `apps/web/src/features/invoices/FilterBar.tsx` (đang dùng `selectStyle`/`inputStyle` nội tuyến + 3 nút kỳ "hiện tại").
- `apps/web/src/lib/period.ts` (`monthRange`/`quarterRange`/`yearRange` nhận `ref: Date`).
- `apps/web/src/styles/tokens.css`, `.claude/rules/ui.md`.

## Phạm vi

**TRONG:**
- **Primitive** `Select` và `Field` trong `primitives.tsx` (chỉ dùng token; có `<label>` gắn `htmlFor`; a11y).
- **`period.ts`**: thêm hàm THUẦN nhận kỳ tường minh — `monthRangeOf(y,m)`, `quarterRangeOf(y,q)`, `yearRangeOf(y)`; refactor `monthRange(ref)`… gọi lại chúng (một hiện thực, không nhân đôi).
- **`ChonKy`**: chọn độ chi tiết (Tháng/Quý/Năm) + dropdown **Năm** (5 năm gần nhất — trần cấu hình được) + dropdown **Tháng** (1–12) hoặc **Quý** (1–4) tuỳ độ chi tiết; xuất `{tuNgay, denNgay}` qua `*Of()`. Dùng `<select>` gốc (cảm ứng tốt). Giữ **"Khoảng tuỳ chỉnh"** (2 ô ngày) dạng thu gọn.
- **`FilterBar`**: thay 3 nút kỳ + ô ngày thô bằng `ChonKy`; thay `<select>/<input>` nội tuyến bằng `Select`/`Field`/`TextField`. Bỏ `selectStyle`/`inputStyle`.
- **Phép kiểm convention** (Luật ui.md): test Vitest quét `apps/web/src/features/**` — cấm màu hex cứng (trừ `tokens.css`) và cấm `style=` trên `<select>/<input>`.

**NGOÀI:**
- Chưa đổi mặc định kỳ, chưa đổi tên nút "Áp dụng", chưa đụng "Đồng bộ" (tất cả ở U-K4). `ChonKy` cập nhật bản nháp; nút áp dụng hiện tại vẫn hoạt động.

## Tiêu chí nghiệm thu (test-first)

1. **Chọn kỳ quá khứ được** — test: chọn Năm=2025, Tháng=3 → `tuNgay=2025-03-01`, `denNgay=2025-03-31` (giờ VN); Quý/Năm tương tự. Đây là lõi yêu cầu (1).
2. **Convention xanh** — test quét: không hex cứng, không inline-style ô nhập trong `features/`. (Sau khi dọn `FilterBar` → xanh; nếu còn sót → đỏ, chặn.)
3. **A11y** — mọi `Select`/`Field` có nhãn gắn đúng (`label`↔`id`).
4. **Không đổi hợp đồng lọc** — bản nháp `ChonKy` set `tuNgay/denNgay` đúng shape `InvoiceFilter`.

## Các bước (vòng lặp chuẩn)

1. Viết test (1)(2)(3) trước — để đỏ.
2. Thêm `Select`/`Field`; mở rộng `period.ts`; dựng `ChonKy`; refactor `FilterBar`.
3. Viết `apps/web/test/conventions/ui-luat.test.ts` (`// @vitest-environment node`, quét mã nguồn).
4. `make lint && make test` → đỏ thì sửa, lặp.
5. Chạy thử tay trên khung hẹp (điện thoại) — dropdown bật đúng, chọn kỳ quá khứ ra đúng khoảng.
6. Review chéo bằng subagent; commit nhỏ (chỉ U-K3).

## Ràng buộc bắt buộc

- Chỉ token + primitive; không hardcode màu/px.
- `period.ts` giữ thuần (nhận kỳ, không `Date.now()` bên trong) để test xác định.
- Native `<select>` cho di động; không thêm thư viện UI nặng.

## Definition of Done + cổng
`make lint` sạch · `make test` xanh (gồm test convention + chọn kỳ) · coverage không giảm · `tsc` xanh · review chéo. Cổng ép: `gate-dod.sh` (Stop) + CI `quality` (required). *(Phép kiểm convention nay là test trong `make test` → tự bắt buộc theo hợp đồng cổng U-K0.1.)*

## Chủ dự án review gì
- **Xem:** trên điện thoại, bấm Tháng/Quý/Năm ra **dropdown** chọn kỳ cụ thể (kể cả kỳ quá khứ), không phải gõ tay 2 ô ngày.
- **Tiêu chí:** (1) chọn kỳ bất kỳ đúng khoảng · (2) không còn tô kiểu nội tuyến.
- **Cổng:** `make test` (chọn kỳ + convention) → Stop + CI.

# U-K4 — Mặc định tháng hiện tại + đổi tên nút + tự tải (giao yêu cầu 2, 3)

**Loại:** đơn vị công việc. **Phụ thuộc:** U-K3 (đã có `ChonKy` + primitive). **Nền:** `.claude/rules/ui.md` (hợp đồng tương tác).
**Giao yêu cầu ban đầu (2) và (3).** Mức: cơ bản (theo quyết định chủ dự án 2026-07-22).

## Mục tiêu

Áp **hợp đồng tương tác** của Luật ui.md vào màn danh sách: (2) mặc định **tháng hiện tại**; (3) đổi **"Áp dụng" → "Lọc dữ liệu"** đặt cạnh chọn kỳ, và **"Đồng bộ khoảng này" → "Đồng bộ và tải xuống"** (đồng bộ xong **tự tải file**).

## Đọc trước

- `apps/web/src/features/invoices/InvoicesPage.tsx` (khởi tạo bộ lọc, ráp màn).
- `apps/web/src/features/invoices/FilterBar.tsx` (nút áp dụng), `RangeSyncPanel.tsx` + `useRangeBackfill.ts` (đồng bộ).
- `apps/web/src/lib/filterStore.ts` (nhớ bộ lọc), `apps/web/src/features/invoices/InvoiceExportButtons.tsx` (luồng xuất/tải sẵn có).
- `apps/web/src/lib/period.ts`, `.claude/rules/ui.md`.

## Phạm vi

**TRONG:**
- **(2) Mặc định tháng hiện tại:** khởi tạo `InvoicesPage` = bộ lọc đã lưu (chiều/nguồn/MST) **ghi đè** `tuNgay/denNgay` = `monthRangeOf(<năm nay>, <tháng nay VN>)`. Trong `filterStore.ts`: **bỏ `tuNgay`/`denNgay` khỏi `ALLOWED`** (không nhớ kỳ); giữ các khoá khác.
- **(3a) Đổi tên + vị trí nút lọc:** "Áp dụng" → **"Lọc dữ liệu"**, đặt **ngay sau `ChonKy`**. Hợp đồng tương tác: sửa bộ lọc → áp dụng khi bấm (nhất quán, không trộn tức-thì/không-tức-thì).
- **(3b) Đồng bộ và tải xuống:** đổi "Đồng bộ khoảng này" → **"Đồng bộ và tải xuống"**; sau khi backfill `hoan_thanh`, **tự kích hoạt xuất + tải** cho đúng bộ lọc đang xem (tái dùng luồng `InvoiceExportButtons`/`POST /exports`). Giữ nguyên xử lý phiên hết hạn/lỗi hiện có; tách bạch trực quan hành động **đọc nhẹ** ("Lọc dữ liệu") với **kéo nặng** ("Đồng bộ và tải xuống").

**NGOÀI:**
- Không thêm trường; không đổi schema (chỉ mục `(tenant_id, tdlap)` để U-K5); không sửa Registry (trừ khi thiếu cờ hiển thị nhỏ).

## Tiêu chí nghiệm thu (test-first)

1. **Mặc định tháng hiện tại** — test: mở màn (dù có/không bộ lọc lưu) → kỳ = tháng hiện tại (giờ VN). `filterStore` **không** còn lưu `tuNgay/denNgay`, vẫn nhớ chiều/nguồn/MST.
2. **"Lọc dữ liệu" chỉ đọc** — test: bấm nút áp bộ lọc và **không** gọi đồng bộ mạng (chỉ truy vấn dữ liệu đã có).
3. **"Đồng bộ và tải xuống"** — test: bấm → chạy backfill; khi `hoan_thanh` → kích hoạt xuất/tải cho bộ lọc hiện tại. Phiên hết hạn → vẫn nhắc kết nối lại (giữ hành vi cũ).
4. **Đa tenant giữ nguyên** — dọn lựa chọn/bộ lọc khi đổi phiên vẫn đúng (H-B.3).

## Các bước (vòng lặp chuẩn)

1. Viết test (1)–(3) trước — để đỏ.
2. Sửa khởi tạo `InvoicesPage` + `filterStore.ALLOWED`; đổi nhãn/vị trí nút lọc; nối bước tự-tải sau backfill (dùng lại luồng xuất).
3. `make lint && make test` → đỏ thì sửa, lặp.
4. Chạy thử tay: mở màn thấy tháng hiện tại; "Lọc dữ liệu" lọc tức thì; "Đồng bộ và tải xuống" kéo xong ra file.
5. Review chéo bằng subagent; commit nhỏ (chỉ U-K4).

## Ràng buộc bắt buộc

- **Tiết kiệm tài nguyên máy chủ:** mặc định kỳ hẹp (tháng hiện tại) để không đồng bộ ngoài phạm vi thường (đúng lý do yêu cầu 2).
- **Không nguồn thứ hai:** tự-tải tái dùng hạ tầng xuất sẵn có, không viết bộ xuất mới.
- **Hợp đồng tương tác** theo ui.md: tên nút phản ánh đúng loại hành động (đọc nhẹ vs kéo nặng).

## Definition of Done + cổng
`make lint` sạch · `make test` xanh · coverage không giảm · `tsc` xanh · review chéo · commit nhỏ. Cổng ép: `gate-dod.sh` (Stop) + CI `quality` (required).

## Chủ dự án review gì
- **Xem:** mở màn ra **tháng hiện tại**; nút **"Lọc dữ liệu"** nằm cạnh chọn kỳ và lọc ngay; **"Đồng bộ và tải xuống"** kéo xong tự tải file.
- **Tiêu chí:** (2) mặc định tháng hiện tại + không nhớ kỳ cũ · (3) tên/vị trí nút đúng + tự tải chạy.
- **Cổng:** `make test` → Stop + CI.

---
## Ghi chú trình tự (đọc trước khi chạy cả cụm)
Chạy đúng thứ tự **U-K1 → U-K2 → U-K3 → U-K4**; K2/K3 cần Registry (K1), K4 cần `ChonKy` (K3). Mỗi đơn vị commit riêng, xanh mới sang đơn vị sau. 3 yêu cầu ban đầu hoàn tất ở **K3 (yêu cầu 1)** và **K4 (yêu cầu 2, 3)**.

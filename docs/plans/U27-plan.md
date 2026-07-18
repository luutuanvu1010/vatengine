# U27 — Lọc theo chiều · Kết xuất trong danh sách · Role-gate đồng bộ khoảng (frontend)

> Đơn vị **frontend-only** (`apps/web`). Nền: trunk `feat/cloudflare-stack-u0`.
> Prompt gốc: `PROMPT_U26_dong-bo-loc-ketxuat_1.md`.

## Vì sao là "U27" chứ không phải "U26"

Prompt gốc đặt tên "U26", nhưng **"U26" đã bị dùng và đã merge** cho một đơn vị khác hẳn
— *queue 2 pha đồng bộ dòng hàng (backend)*, PR #6. Để nhật ký không trùng số, đơn vị
frontend này đổi tên thành **U27**.

## Ba lát cắt (mỗi lát một commit)

- **B1 — Ẩn ô MST theo chiều lọc** (`FilterBar.tsx`): `chieu=purchase` → ẩn + dọn `nmmst`;
  `chieu=sold` → ẩn + dọn `nbmst`; rỗng → hiện cả hai. Không lọc ngầm bằng trường đã ẩn.
- **B2 — Nút Xuất Excel/CSV theo hóa đơn** (`InvoiceExportButtons.tsx` trong `InvoicesPage`):
  xuất TOÀN BỘ kết quả theo bộ lọc (server-side), tái dùng luồng `ExportsPage`
  (`createExport → downloadExport → saveBlob`). Tự ẩn với vai không có quyền (`canExport`).
  Giữ nguyên trang "Kết xuất & Convert" (`ExportsPage`).
- **B3 (thu gọn) — Role-gate đồng bộ theo khoảng**: xem quyết định bên dưới.

## Quyết định B3 — thu gọn thành RGLE role-gate

Prompt gốc yêu cầu B3 gồm: (a) `yesterdayVN()` mặc định, (b) polling tiến độ, (c) role-gate.

**Trong lúc làm, trunk đã tiến** (merge PR #8 fix-queue-429, PR #9 U22 B7). **U22 B7 đã ship
range-sync ĐẦY ĐỦ**: `RangeSyncPanel` (presentational) + `useRangeBackfill` với **thanh tiến
độ + polling + tự chạy khi danh sách rỗng** — tức đã bao trùm (a)(b) của prompt, theo một
thiết kế khác (tốt) đã có test riêng.

⇒ Phần còn thiếu duy nhất: **U22 B7 KHÔNG role-gate** — vai `ke_toan` vẫn thấy nút và
auto-backfill vẫn tự kích hoạt rồi **403** (`/tax-accounts*` chỉ cho `ke_toan_truong`+`quan_tri`).

**B3 chốt làm GỌN = chỉ role-gate** (chủ dự án duyệt): trong `InvoicesPage`, gate **cả**
`auto: listEmpty && canSync` **lẫn** render panel theo `canManageTaxAccounts`. **Không** đụng
`RangeSyncPanel`/`useRangeBackfill` (giữ nguyên thiết kế đã ship — tránh viết lại + tránh
nguồn sự thật thứ hai).

## Ghi chú vận hành

Đơn vị này hiện thực trong một **git worktree tách riêng** (`feat/u27-clean`) vì thư mục
repo chính lúc đó bị nhiễu (một tiến trình khác đồng-sửa cùng file theo thời gian thực + chỉ
số index git dùng chung từng nuốt nhầm việc chưa-commit). Giao nộp qua PR → CI → merge.
Sau khi trunk tiến, nhánh được **rebase lại lên trunk mới** (`c3d0c6b`, sau U22 B7).

# Design: Delta-sync chia lô + hợp nhất UX "Tra cứu hóa đơn" + thống kê Kết quả

> Ngày: 2026-07-26. Trạng thái: đã duyệt qua brainstorm với chủ dự án (5 câu hỏi trắc nghiệm
> + 2 hiệu chỉnh tên/ghi chú). Nguồn gốc rễ: `docs/CHAN-DOAN-thieu-hoa-don-thang.md`.
> Spec này thay thế hướng "force re-sync nguyên khoảng" của `docs/prompts/force-backfill-ui.md`
> (KHÔNG xây UI force nữa; cờ `force` backend giữ nguyên làm lối thoát).

## 1. Bối cảnh & lỗi gốc (đã kiểm chứng — không điều tra lại)

- Triệu chứng: tháng 6/2026 MST 4201969169 mua vào — DB 6802 vs thực ~7076 (thiếu ~4%).
- Lỗi gốc (chẩn đoán 25/07, xác minh bằng probe token thật):
  1. **[CHÍNH]** Production under-capture: GDT rate-limit mạnh (429 / "Too many
     subrequests") → run tháng fail; ghi all-or-nothing nên fail = 0 dòng → DB đóng băng
     ở high-water thấp. Probe có backoff kéo một lần được 6981 > 6802 ⇒ dữ liệu kéo lại được.
  2. **[KHUẾCH ĐẠI]** A1+A2: cron chỉ đồng bộ tháng hiện tại; backfill bỏ qua tháng đã có
     ≥1 run completed (coverage nhị phân) ⇒ tháng hụt không bao giờ tự lành.
  3. **[GDT-SIDE]** `total` trong phong bì bất ổn (đo được 6755–7023 trong MỘT lần phân
     trang); con trỏ hụt ~0.6% ⇒ phải kéo-lặp + hợp (upsert idempotent) mới hội tụ.
- Mâu thuẫn cần kiểm chứng: chủ dự án xác nhận Workers **Paid** (trần 1000 subrequest)
  nhưng prod từng lỗi "Too many subrequests" (n=61, 2026-07-18). CHƯA KIỂM CHỨNG nguyên
  nhân — xem mục 7 (bước xác minh bắt buộc, không chốt mù).

## 2. Quyết định đã chốt (trắc nghiệm 2026-07-26)

| # | Câu hỏi | Lựa chọn |
|---|---------|----------|
| 1 | Chiến lược vá thiếu | **Delta-detect + kéo lô nhỏ** (không force nguyên khoảng) |
| 2 | Hạ tầng | **Đã Workers Paid** (phải xác minh lại trần subrequest — mục 7) |
| 3 | UX điều khiển | **1 thẻ, 2 nút tách bạch**; bỏ tự tải file sau đồng bộ |
| 4 | Thống kê Kết quả | **Đủ bộ 4 số**, in đầy đủ dấu phân cách, không làm tròn |
| 5 | Vòng lặp kéo lô | **Queue tự nối chuỗi** (không dùng Workflows đợt này) |
| 6 | Tên thẻ gộp | **"Tra cứu hóa đơn"** |
| 7 | Ghi chú nút | **Icon ⓘ + tooltip** (thêm primitive `Tooltip`), bỏ caption dài cạnh nút |

## 3. Backend — động cơ delta-sync (trục 1)

### 3.1 Luồng mới của `POST /tax-accounts/:id/backfill` (không `force`)

Mọi tháng trong khoảng được enqueue job **`audit`** (không còn "bỏ qua tháng đã phủ"):

1. **Audit** (rẻ, 1–2 request GDT/tháng×chiều): hỏi trang đầu mỗi họ endpoint
   (`/query` thường + `/sco-query` máy tính tiền) lấy `total` phong bì; so với `count`
   DB theo `(tenant, tháng, chiều, nguồn)`.
   - DB ≥ total (cả hai họ) → tháng **đủ** → đánh dấu xong, không kéo.
   - DB < total ở họ nào → enqueue **pull lô 1** cho họ đó.
2. **Pull theo lô**: mỗi message kéo tối đa `CHUNK_PAGES` trang (mặc định **40 trang
   ≈ 2.000 HĐ**, cấu hình được), upsert + **commit riêng từng lô** (bỏ all-or-nothing;
   idempotent theo khóa tự nhiên nên an toàn), lưu **checkpoint** (con trỏ `state` GDT +
   số trang đã kéo + vòng) vào `lan_dong_bo` (cột mới JSONB), rồi enqueue lô kế.
   - 429 giữa lô → phân loại `rate_limited` có sẵn → reenqueue-delay (cơ chế H-B.4
     đã chạy prod), checkpoint còn nguyên → resume đúng chỗ. **Đây là điểm giết
     triệu chứng "fail = 0 dòng, đóng băng".**
3. **Hội tụ**: hết trang → audit lại. Nếu count DB còn tăng so với vòng trước VÀ vẫn
   < total → kéo vòng nữa. Trần **3 vòng**/lần backfill (vì `total` bất ổn ±4%).
   Bão hòa (không tăng nữa) → `hoan_thanh`. Còn hụt sau 3 vòng → ghi số hụt tường minh
   vào progress + log (không nuốt im lặng).
4. Cỡ lô 40 trang = an toàn kép: dưới trần 50 (nếu account hóa ra tính như Free) lẫn
   1000 (Paid). Chỉnh qua cấu hình, không hard-code rải rác.
5. Cờ `force` (commit `97285f1`, đã live): giữ nguyên hành vi, không xây UI.

### 3.2 Đóng lỗ hổng A1 (tháng cũ tự lành)

Cron hằng ngày enqueue thêm **audit cho tháng liền trước** (current-1) mỗi account×chiều.
Hóa đơn người bán đẩy lên GDT trễ sẽ tự được vá; chi phí vài request/ngày/tenant.

### 3.3 Payload tiến độ (`BackfillProgress`)

Mỗi tháng có trạng thái mới: `dang_kiem` → `du` (đủ, không kéo) | `dang_keo`
(kèm số lô/vòng) → `xong` | `loi`. Giữ tương thích: thêm trường, không đổi nghĩa trường cũ.
UI nói được câu thật: "Đang kiểm 3 tháng… 1 tháng hụt, đang kéo lô 2/7".

### 3.4 Schema/migration

- `lan_dong_bo`: thêm cột nullable `checkpoint` (JSONB: con trỏ state, trang đã kéo,
  vòng, total quan sát) — migration Drizzle mới. Không đổi khóa/RLS.

## 4. Frontend — thẻ "Tra cứu hóa đơn" (trục 2)

- **Gộp** thẻ Bộ lọc + thẻ Đồng bộ thành MỘT thẻ `SectionLabel` **"Tra cứu hóa đơn"**:
  các ô lọc như cũ (ChonKy, ngày, segmented chiều, nguồn, MST), hàng cuối:
  `[Lọc dữ liệu]` (secondary, đọc nhẹ) · `[Đồng bộ từ Thuế]` (primary, kéo nặng) · `ⓘ`.
- **Ghi chú kiểu tooltip**: icon ⓘ cạnh nút Đồng bộ; hover/chạm hiện giải thích ngắn
  ("Kiểm tra và kéo phần còn thiếu từ máy chủ thuế cho kỳ đã chọn — chạy nền").
  Thêm primitive **`Tooltip`** vào `components/ui/primitives.tsx` (token-only, a11y:
  hiện khi focus bàn phím, `aria-describedby`). KHÔNG còn caption dài thường trực.
- **Bỏ tự-tải-file sau đồng bộ**: xóa `taiSauDongBo`/`xuatSauDongBo`/`loiTaiXuong`.
  Tải file chỉ qua nút Xuất ở thẻ Kết quả. Đổi tên nút "Đồng bộ và tải xuống" →
  **"Đồng bộ từ Thuế"**.
- Tiến độ + cảnh báo (hết phiên, lỗi gửi, tháng lỗi) hiện ngay dưới hàng nút, trong cùng thẻ.
- **Giữ**: tự đồng bộ khi kỳ rỗng (nay là delta nên rẻ), gate vai (`canManageTaxAccounts`),
  các trạng thái cảnh báo hiện có.
- **Sửa kèm lỗi đã phát hiện**: `staleTime: Infinity` theo khoảng làm bấm lần 2 cùng kỳ
  không gửi request — chuyển cơ chế kích hoạt cho phép chạy lại sau khi kết thúc
  (đếm lượt trong queryKey hoặc mutation).

## 5. Frontend — thống kê thẻ Kết quả (trục 3)

- 4 `Stat` từ `/invoices/summary` (payload ĐÃ có sẵn `tongTcthue`/`tongTthue`/`tongTtbso`
  — thuần hiển thị, không sửa backend): **Số hóa đơn · Tổng chưa thuế · Tổng tiền thuế ·
  Tổng thanh toán**, cho đúng kỳ + chiều đang lọc.
- Định dạng: đủ chữ số, phân cách kiểu VN (`1.234.567.890 ₫`), font tabular, `null` → "—".
  KHÔNG làm tròn/viết tắt (thói quen đối chiếu kế toán).
- Nhãn khai một nguồn theo `ui.md`: nếu Registry chưa có nhãn cho 3 trường tiền tổng thì
  bổ sung ở Registry (không gõ chuỗi rời trong màn).

## 6. Kiểm thử (TDD — `testing.md`)

- `packages/sync`: audit quyết định đủ/hụt đúng theo (nguồn, chiều) · checkpoint resume
  đúng chỗ sau 429 · commit từng lô không nhân đôi (chạy lại lô = idempotent) · hội tụ
  dừng khi bão hòa · trần 3 vòng · còn hụt → báo tường minh.
- `apps/api`: backfill enqueue audit cho CẢ tháng đã phủ (hành vi mới) · `force` giữ
  nguyên · payload progress có trạng thái mới.
- `apps/web`: hook suy trạng thái mới (`dang_kiem`/`du`/`dang_keo`) · bấm lại được sau
  khi xong · 4 Stat render đúng kể cả null · không còn hành vi tự tải file · Tooltip
  đạt a11y (focus hiện, `aria-describedby`) · convention test không vỡ (style trên
  primitive mới nằm trong `components/ui/`).
- Contract test: giữ nguyên (phong bì `total` đã trong `gdt_contract_schema`).

## 7. Bước xác minh bằng chứng (bắt buộc trong Slice 1 — không chốt mù)

1. Xác nhận gói Workers thật trên dashboard Cloudflare (Workers Paid ≠ zone Pro).
2. Instrument job đồng bộ: log phân loại lỗi + đếm request thật của một run để chốt
   nguyên nhân "Too many subrequests" ngày 18/07 (trần 50? trần 1000? gộp nhiều job?).
3. Ghi kết quả (lệnh + số liệu + ngày) vào chẩn đoán; chỉnh `CHUNK_PAGES` theo bằng chứng.

## 8. Phạm vi — KHÔNG làm đợt này

- Không xây UI cho cờ `force`; không sửa trang Tài khoản thuế / luồng đăng nhập.
- Không dùng Cloudflare Workflows (đã chọn Queue tự nối chuỗi).
- Không đổi Registry/luật ngoài phần nhãn tiền tổng + primitive Tooltip.

## 9. Chia đơn vị thực thi

- **Slice 1 (backend)**: delta-engine (audit + chunk + checkpoint + hội tụ) + migration
  `checkpoint` + cron audit tháng trước + bước xác minh mục 7.
- **Slice 2 (frontend)**: thẻ "Tra cứu hóa đơn" (gộp + 2 nút + ⓘ Tooltip + bỏ tự tải)
  + 4 Stat thống kê + sửa staleTime.
- Điều kiện tiên quyết: `git pull` (local đang sau `origin/feat/cloudflare-stack-u0`
  1 commit — `97285f1`).
- Nghiệm thu cuối (end-to-end): chạy đồng bộ delta kỳ 01/06–30/06 chiều Mua vào trên
  production → count DB tăng 6802 → ≥6981 (mức probe đã chứng minh kéo được); đối chiếu
  lại với file công cụ thứ ba. Lưu ý khi kiểm: xuất đúng chiều **Mua vào** (file xuất
  sáng 26/07 là chiều Bán ra nên không so được với `MUA_VAO_4201969169.xlsx`).

---

## Amendment 2026-07-26 (sau final review, chủ dự án duyệt)

- **§3.1.3 "ghi số hụt tường minh vào progress" — deviation có chủ đích:** số hụt sau 3 vòng chỉ ghi ở mức RUN (`lan_dong_bo.thong_diep_loi` + log vận hành), KHÔNG lộ ra progress/UI — tháng hiển thị "xong" vì tổng đã hội tụ tới mức GDT cho phép (`total` vốn bất ổn ±4% nên "hụt" có thể là ảo). Chủ dự án chọn phương án này 2026-07-26 thay vì thêm trường `hutConLai` vào payload progress. Nếu tương lai cần minh bạch hơn với người dùng cuối: xem mục backlog delta-sync.

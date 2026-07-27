# Tra cứu trực tiếp khoảng hẹp — số liệu tươi từ GDT, hiển thị ngay, lưu nền

> Đơn vị công việc mới. Quyết định chủ dự án 2026-07-27 (thảo luận sau sự cố thiếu HĐ
> ngày 26/07 + đối chiếu NiBot): *"trả ngay các con số thống kê cơ bản (số lượng hoá đơn,
> tiền trước thuế, tổng tiền thuế, tổng sau thuế) từ chính response GDT; các chi tiết khác
> chạy nền; thấy số liệu tươi ngay, khi nào đồng bộ xong thì mới cho tải."*
>
> Trạng thái: **SPEC — chờ QA1**. Chỉ code sau khi (a) spec này qua QA1 và (b) vụ 289 HĐ
> ngày 26/07 + phép thử `ncnhat` (giả thuyết A/B về audit) ngã ngũ — tránh trộn hai việc.

## 1. Bối cảnh & vấn đề

Người dùng lọc một khoảng ngày và tin rằng con số thống kê trên màn là "sự thật", trong
khi DB có thể đang thiếu so với GDT (cửa sổ công bố HĐ máy tính tiền trễ 1–2 ngày;
hoặc chuỗi đồng bộ đang chạy dở). Hai sự cố liên tiếp (tháng 6 thiếu ~3%, ngày 26/07
thiếu ~400 HĐ) đều bùng lên từ khoảng-cách-niềm-tin này, dẫn tới bấm "Đồng bộ" lặp
(→ bão request → GDT phạt 429, xem BACKLOG mục [2026-07-27]).

NiBot cho trải nghiệm "hỏi là thấy số tươi" (kiến trúc thật của họ CHƯA KIỂM CHỨNG —
có thể pass-through, có thể lai). Ta đạt cùng trải nghiệm mà không bỏ kiến trúc lưu trữ:
**kéo–hiển thị–lưu trong một nhịp** cho khoảng hẹp.

## 2. Phạm vi

**Trong phạm vi:**
- Endpoint mới: kéo trực tiếp GDT cho khoảng ≤ 1 tháng, trả về ngay danh sách header +
  4 số thống kê (số HĐ, Σ tiền trước thuế, Σ tiền thuế, Σ tổng sau thuế) theo chiều.
- Lưu nền idempotent chính các dòng vừa kéo (upsert sẵn có) + enqueue pha dòng hàng.
- UI: nút "Xem nhanh từ Thuế", vùng hiển thị số liệu tươi, khoá nút Xuất tới khi DB đủ.

**Ngoài phạm vi (tường minh):**
- Thống kê dòng hàng (tên hàng, số lượng, thuế suất) live — GDT không trả trong danh
  sách; vẫn thuộc pha chi tiết chạy nền.
- Khoảng > 1 tháng (GDT từ chối cứng — đã kiểm chứng HTTP 400, xem query.ts).
- Thay thế đường Đồng bộ/backfill hiện có — không đụng.

## 3. Thiết kế

### 3.1 API — `POST /tax-accounts/:id/xem-nhanh`

Body: `{ tuNgay: "YYYY-MM-DD", denNgay: "YYYY-MM-DD", chieu?: "purchase"|"sold" }`
(mặc định cả hai chiều).

Luồng xử lý:
1. Validate: uuid, khoảng hợp lệ, `denNgay - tuNgay ≤ 31 ngày` và không vắt quá 1 tháng
   lịch theo giới hạn GDT → sai: 400.
2. Cách ly tenant (lớp 1 + RLS) như các route tài khoản thuế khác → 404.
3. Token thuế còn hạn → hết: 409 `token_het_han` (không tự đăng nhập — ranh giới Hiến pháp).
4. Gọi `queryInvoices` (adapter sẵn có: 2 họ normal+sco, khử trùng theo khóa tự nhiên)
   với **trần trang cứng** `XEM_NHANH_MAX_PAGES` (mặc định 40 trang/chiều ≈ 2.000 HĐ).
   Chạm trần → 413 `khoang_qua_lon` kèm thông điệp "thu hẹp khoảng hoặc dùng Đồng bộ".
5. Tính thống kê từ response (server tính, không tin client): mỗi chiều
   `{ soHoaDon, tongTruocThue, tongThue, tongSauThue }` — cộng `tgtcthue/tgtthue/tgtttbso`
   theo chuỗi số (Number an toàn: VND < 2^53; ghi chú làm tròn hiển thị ở client).
6. Trả 200 ngay: `{ lucLay: ISO, thongKe: {purchase?, sold?}, rows: [header rút gọn] }`.
7. **Nền, sau khi trả** (`executionCtx.waitUntil`): upsert idempotent các rows (mapInvoice +
   upsertBatch sẵn có — chạy lại không nhân đôi) + enqueue detail candidates lên
   `SYNC_QUEUE` (binding đã có ở API; message dạng sẵn có, KHÔNG đổi consumer).
8. Lỗi GDT: 401 → 409 "hết phiên"; timeout/429/5xx → 502 `gdt_khong_phan_hoi` kèm gợi ý
   "GDT đang giới hạn — số liệu đã lưu gần nhất vẫn xem được ở bảng chính".

### 3.2 Van rate-limit — ràng buộc wiring PHẢI giải quyết

`TenantLimiter` (token bucket 2 req/s + breaker) hiện là Durable Object của
**vat-sync-worker**; apps/api CHƯA có binding. Mọi lời gọi GDT của endpoint này BẮT BUỘC
đi qua van chung (bài học 2026-07-27 — "không gọi dồn dập").

Phương án chọn: **binding chéo script** trong `apps/api/wrangler.jsonc`:
`durable_objects.bindings += { name: "TENANT_LIMITER", class_name: "TenantLimiter",
script_name: "vat-sync-worker" }` — cùng một namespace DO, một trạng thái van duy nhất
cho cả sync nền lẫn xem-nhanh. ⚠️ CHƯA KIỂM CHỨNG trong repo này (tài liệu Cloudflare có
hỗ trợ `script_name`); bước 1 của implementation là PROBE binding này bằng một test/lệnh
thật trước khi viết tiếp — không đạt thì fallback: service binding gọi sang sync-worker.

Ghi chú hiện trạng: login/captcha ở API đang gọi GDT không qua van (nhịp người dùng,
volume thấp — chấp nhận từ U14). Xem-nhanh volume cao hơn → không hưởng ngoại lệ đó.

### 3.3 Cổng "cho tải" (export gating)

Yêu cầu chủ dự án: *"khi nào đồng bộ xong thì mới cho tải."*
- Điều kiện mở nút Xuất cho khoảng đã lọc: `demDb(khoang) ≥ soHoaDon(xem-nhanh)` cho
  từng chiều (so sánh với số liệu tươi vừa lấy — chính xác hơn `total` ±4%), HOẶC
  người dùng chưa từng xem-nhanh (giữ hành vi cũ, không chặn ngược).
- UI khi đang chờ: nút Xuất disabled + InfoTip "Đang lưu về máy (x/y hoá đơn) — nút mở
  khi đủ". Nguồn x: `GET sync-status` + count invoices (API sẵn có).

### 3.4 UI (theo ui.md — qua đủ 7 cổng kiểm)

- Nút **"Xem nhanh từ Thuế"** cạnh "Đồng bộ từ Thuế" trong FilterBar (cùng loại hành
  động "kéo từ Thuế" — nặng, có mạng; tên nói rõ tính chất). Primitive `Button` sẵn có.
- Kết quả: dải 4 `Stat` (số HĐ, trước thuế, thuế, sau thuế — nhãn từ Registry cho các
  trường tiền; "Số hoá đơn" là nhãn tổng hợp mới → khai ở Registry nếu thiếu) + `Alert
  tone="info"`: "Số liệu trực tiếp từ Thuế lúc HH:mm — đang lưu về máy, cột dòng hàng sẽ
  đầy dần." Đủ 4 trạng thái: idle / đang gọi (nút quay) / kết quả / lỗi (thông điệp 502
  nêu trên).
- Không tạo nguồn nhãn thứ hai; không hardcode màu/px.

## 4. Tiêu chí nghiệm thu (AC — mỗi cái một test)

1. Khoảng 2 ngày, mock transport 2 trang × 2 họ → 200; `thongKe` đúng bằng tổng cộng tay
   các rows mock; `rows` đủ và khử trùng.
2. Sau khi trả 200, DB có đúng các HĐ đó (upsert chạy nền); gọi lại lần 2 không nhân đôi
   (idempotent); detail candidates được enqueue đúng dạng message hiện hành.
3. Khoảng > 31 ngày hoặc vắt 2 tháng lịch → 400, KHÔNG gọi GDT.
4. Token hết hạn → 409, KHÔNG gọi GDT.
5. Tài khoản tenant khác → 404 (cách ly 2 lớp).
6. Chạm trần `XEM_NHANH_MAX_PAGES` → 413 + không upsert nửa vời ngoài các trang đã kéo
   (các trang đã kéo VẪN upsert — dữ liệu thật, không bỏ phí).
7. GDT 401 giữa phân trang → 409 hết phiên; timeout/429 → 502 `gdt_khong_phan_hoi`.
8. MỌI fetch đi qua van TenantLimiter (mock limiter đếm acquire ≥ số request).
9. UI: nút hiển thị đúng vai; 4 trạng thái; nút Xuất khoá khi `demDb < soHoaDon` và mở
   khi đủ; nhãn từ Registry.
10. `make lint` + `make test` xanh; coverage không giảm.

## 5. Rủi ro & điểm chưa kiểm chứng (gắn nhãn tường minh)

- **CHƯA KIỂM CHỨNG:** binding DO chéo script (`script_name`) hoạt động với free/paid
  plan hiện tại của dự án → probe ở bước 1.
- **CHƯA KIỂM CHỨNG:** thời gian thực tế 40 trang tuần tự qua van 2 req/s (~20s+) so với
  trần thời gian một request API trên Workers Paid — nếu sát trần, hạ mặc định trần trang
  hoặc trả 206 từng phần. Đo ở bước probe.
- `total`/dữ liệu GDT dao động ±4% — số liệu tươi cũng chỉ là "GDT nói lúc đó"; UI ghi mốc
  `lucLay` để trung thực.
- Khoảng hẹp nhưng mật độ HĐ cao (tenant lớn) sẽ chạm 413 thường xuyên → thông điệp phải
  dẫn người dùng sang đường Đồng bộ, không phải ngõ cụt.

## 6. Thứ tự triển khai

1. Probe hai điểm CHƯA KIỂM CHỨNG (binding DO chéo + thời gian 40 trang) — ghi kết quả
   vào spec này.
2. TDD backend (AC 1–8) → 3. TDD web (AC 9) → 4. Review chéo (dod-auditor +
   security-reviewer vì đụng token/tenant) → 5. Deploy worker→api→web.

Tiền đề bắt đầu: vụ 289 HĐ ngày 26/07 + phép thử `ncnhat` đã ngã ngũ (nếu ra giả thuyết B
— audit đếm sai — thì vá audit TRƯỚC, vì xem-nhanh dùng chung nền đếm/so sánh).

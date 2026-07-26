# Chẩn đoán: thiếu hóa đơn theo tháng (DB < GDT)

> Ngày lập: 2026-07-25. Triệu chứng thực tế: tháng 6 mua vào — portal thuế >7000 HĐ, hệ thống thống kê **6802**. Audit toàn bộ đường ĐỌC + ĐỒNG BỘ (3 mảng song song). **Chưa sửa gì** — đây là chẩn đoán.

## Khung kết luận (đã chứng minh từ code)

1. **Đường đọc/thống kê/xuất TRONG SẠCH.** `summarize`, `list`, `export` đều dùng chung `buildWhere` (`packages/query/src/filters.ts:201`), không có bộ lọc ẩn / LIMIT ẩn; keyset xuất có tie-breaker `id` đúng. ⇒ **6802 là số dòng THẬT trong DB**, không phải lỗi báo cáo. Bộ lọc ngày đã đúng giờ VN (đã xác minh trước đó).
2. **DB là hợp nhất idempotent, đơn điệu.** Mỗi lần đồng bộ kéo NGUYÊN tháng rồi upsert theo khóa tự nhiên `(tenant, nbmst, khmshdon, khhdon, shdon, tdlap)`, **không xóa**. Ghi một run là **all-or-nothing** trong một transaction (`packages/sync/src/sync.ts:549-581`). ⇒ Số trong DB = **hợp của mọi run ĐÃ HOÀN THÀNH**. ~200 HĐ thiếu ⇒ chúng **không nằm trong tập kéo của bất kỳ run completed nào**: hoặc (a) chưa từng được fetch, (b) chỉ có trong run FAILED, hoặc (c) lên GDT sau run tháng-6 completed cuối cùng.

## Bảng yếu tố có thể gây SAI/THIẾU (xếp theo khả năng)

### Nhóm A — Vì sao tháng 6 bị "đóng băng", không bao giờ tự lành (LỖ HỔNG thiết kế, chắc chắn từ code)

| # | Yếu tố | Bằng chứng | Cơ chế |
|---|--------|-----------|--------|
| A1 | **Chỉ đồng bộ THÁNG HIỆN TẠI, không có re-sync tháng quá khứ** | `apps/sync-worker/src/index.ts:87` (`currentPeriodWindow`); `apps/api/src/routes/taxAccounts.ts:376` (Đồng bộ ngay). Không có cơ chế `recentMonths`/re-sync nào. | Sang tháng 7, cửa sổ cron chuyển sang tháng 7; **không job nào nhắm lại tháng 6**. Tháng 6 đóng băng ở ảnh chụp của run cuối. |
| A2 | **Coverage nhị phân "≥1 run completed" → backfill BỎ QUA tháng đã phủ** | `packages/sync/src/coverage.ts:87`; `taxAccounts.ts:511,521-524`; `backfillSchema` không có cờ `force` (`taxAccounts.ts:78`). | Trong tháng 6, cron tạo NHIỀU run completed. Coverage đếm *có run*, không đếm *đủ HĐ*. ⇒ backfill tháng 6 trả `0 tháng cần lấy`. **Không có đường tay nào kéo lại.** |

**Điểm mấu chốt hướng nghi ngờ:** hóa đơn **mua vào do NGƯỜI BÁN phát hành/đẩy lên GDT trễ** vài ngày–tuần (ngày lập tháng 6 nhưng lên hệ thống đầu tháng 7). A1 khiến chúng không bao giờ được kéo lại. Hóa đơn **bán ra do chính tenant phát hành → đủ ngay**, nên A1 giải thích được vì sao thiếu **đúng chiều mua vào, đúng một tháng, ~3%**.

### Nhóm B — Vì sao ngay cả run tháng-6 cuối cũng có thể đã THIẾU (khiến 6802 thấp hơn cả mức GDT lúc đó)

| # | Yếu tố | Bằng chứng | Phân loại |
|---|--------|-----------|-----------|
| B3 | **Trần 50 subrequest / "Too many subrequests" làm run tháng lớn FAIL → ghi 0 dòng → đóng băng ở high-water cũ** | `sync.ts:205` phân loại `local_limit`; phân trang `query.ts:79` size 50 × (normal+sco) ~140 request. Bằng chứng prod 2026-07-18: `lan_dong_bo` n=61 "Too many subrequests". | LỖI (cơ chế đã chứng thực) / CHƯA rõ tenant/plan này |
| B4 | **Dừng phân trang `datas.length < size \|\| !state`, KHÔNG đối chiếu `total` GDT trả** | `packages/gdt-client/src/query.ts:157-161`. Con trỏ `state` chỉ kiểm tới 53 HĐ/11 trang; prod ~140 trang, `tdlap` phân giải theo NGÀY (nhiều HĐ trùng ngày). | LỖ HỔNG + GIẢ ĐỊNH chưa kiểm chứng ở quy mô lớn |
| B5 | **Một dòng `tdlap` hỏng làm HỎNG CẢ RUN (poison row)** | `packages/sync/src/mapInvoice.ts:46-51` throw *trong* transaction (`sync.ts:244,549`). | LỖ HỔNG (fail-loud phạm vi cả batch, không cách ly dòng lỗi) |

B3/B5 cho ra đúng triệu chứng "đóng băng ở số cũ" như A1. B4 cho ra **rụng phần ĐUÔI (HĐ cũ nhất tháng)** vì sort `tdlap:desc`, và vẫn ghi `completed` — tất định, mất đúng ~200 mỗi lần.

### Nhóm C — Rụng âm thầm khi fetch/ghi (phụ thuộc chất lượng dữ liệu, khả năng thấp)

| # | Yếu tố | Bằng chứng |
|---|--------|-----------|
| C6 | Dedup khóa tự nhiên gộp nhầm khi trường khóa rỗng (`null → ""`) / `tdlap` theo ngày | `query.ts:176-180,239-243`; `sync.ts:242-245`; ràng buộc unique `hoaDon.ts:58-65` |
| C7 | **KHÔNG duyệt trạng thái `ttxly`** (prod gửi rỗng); bản Python cũ duyệt (5,6,8) | `query.ts:210-211`; `backend/gdt_client.py:290,305-333`. Nếu GDT rỗng = tập con mặc định → thiếu; nếu = tất cả → lại dư. CHƯA kiểm chứng (cần probe token). |
| C8 | Nhánh sco trả `200 + datas:[]` giả-rỗng → mất HĐ máy tính tiền | `query.ts:216-246` (chỉ 404 mới bỏ qua; rỗng coi là hợp lệ) |
| C9 | `chieu` KHÔNG nằm trong khóa tự nhiên → va chạm 6-tuple chéo chiều gán nhãn sai | `hoaDon.ts:58-65`; `sync.ts:324`. Cần tự xuất hóa đơn (MST mình→mình), hiếm. |

### Đã LOẠI TRỪ (đã kiểm, không phải nguyên nhân)
Biên tháng `currentPeriodWindow` (đúng, không lệch ngày đầu/cuối) · coverage bucket theo UTC (khớp write/read) · `buildWhere` không có default ẩn · keyset xuất không rụng trang · không có cap đọc/xuất cho export theo bộ lọc · Zod fail-loud không thu hẹp ngầm · `onConflict` khớp đúng ràng buộc · không có commit từng-phần (một transaction) · `tenant_id`/RLS đúng · UPDATE-khi-đổi-trạng-thái chỉ ảnh hưởng *số tiền cũ*, không ảnh hưởng *số dòng* · MAX_PAGES=2000 không chạm (chỉ ~140 trang).

## Cách phân biệt DỨT ĐIỂM (mỗi nguyên nhân có dấu vân khác nhau)

| Bằng chứng cần lấy | Nếu... → nguyên nhân |
|---|---|
| **Ngày lập của các HĐ thiếu** | Cuối tháng 6 (28–30) → **A1** (về muộn). Đầu tháng / rải → **B4** (rụng đuôi) hoặc **B3** (đóng băng sớm). |
| **Lịch sử `lan_dong_bo` tháng 6** (completed vs failed, so_hd_moi) | Có run FAILED "Too many subrequests"/poison → **B3/B5**. Toàn completed → **A1** hoặc **B4**. |
| **Hỏi lại GDT tháng 6 NGAY (không lọc)** = G | G≈7000 → dữ liệu có trên GDT, chưa fetch → A1/B3/B4/B5. G≈6802 → truy vấn không-lọc chỉ trả 6802 → **C7** (duyệt lại `ttxly` để chốt). |
| **Chiều BÁN RA tháng 6 có thiếu không?** | Chỉ mua vào thiếu → nghiêng **A1**. Cả hai thiếu → nghiêng **B3/B4** (fetch-level). |
| **Tenant đang Workers Free hay Paid? `size` phân trang?** | Free (50 sub) + tháng lớn → **B3**. |

## Tổng kết
Hai trục độc lập, cần sửa cả hai:
- **Trục "không lành được"**: A1 + A2 — dù nguyên nhân thiếu ban đầu là gì, hệ thống **không có đường kéo lại** tháng đã phủ. Đây là lỗ hổng chắc chắn.
- **Trục "thiếu ngay từ đầu"**: B3 / B4 / B5 — run tháng-6 có thể chưa từng kéo đủ. Cần bằng chứng `lan_dong_bo` + ngày HĐ thiếu để chốt cái nào.

---

## KẾT LUẬN ĐÃ XÁC MINH (đối chiếu dữ liệu thật 2026-07-25)

Đối chiếu file công cụ thứ ba `docs/doi_chieu_data/MUA_VAO_4201969169.xlsx` (7076 HĐ tháng 6, 100% khóa riêng biệt) với export tháng 6 của hệ thống ta `ourjune.xlsx` (6802 HĐ), diff theo khóa `nbmst|ký hiệu|số|ngày`:

- **Thiếu 285 HĐ, thừa 11.** (6802 = 7076 − 285 + 11.)
- **100% số HĐ thiếu là "HĐ có mã từ máy tính tiền" (sco): 285/7023 = 4.1%.** Hai loại còn lại (hóa đơn thường: "TCT k nhận mã", "Đã cấp MST") **thiếu 0/53 = 0%**.
- Thiếu **rải đều toàn tháng** (5/30 ngày thiếu 0, còn lại 2–8%/ngày), **KHÔNG khối liền** (dãy số liền dài nhất = 3), **đều tỷ lệ theo người bán** (261/6442 và 23/574, đều ~4%).

Dấu vân này **bác bỏ** B3 (đóng băng subrequest → khối liền theo thời gian), B4-tail (rụng đuôi → khối liền một đầu), A1 (về muộn → cụm cuối tháng), C7 (lệch theo trạng thái). Chỉ còn một cơ chế khớp:

### → NGUYÊN NHÂN GỐC: con trỏ phân trang họ **sco** bỏ sót record ở RANH GIỚI TRANG, quy mô lớn

`packages/gdt-client/src/query.ts` `queryOne` phân trang bằng con trỏ `state`, sort **một trường `tdlap:desc`** (GDT chỉ cho sort 1 trường — `query.ts:64`), `size=50`. `tdlap` **phân giải theo NGÀY** → mỗi ngày 200–300 HĐ có **cùng khóa sort**. Luồng sco tháng 6 = 7023 HĐ ≈ **140 trang**; ranh giới trang (mỗi 50 dòng) **liên tục rơi vào GIỮA cụm cùng-ngày**. Con trỏ `state` của GDT **không giữ trọn record khi cắt ngang cụm trùng ngày** → mỗi ranh giới bị cắt rụng vài record → tổng ~4% rải đều, tất định.

Vì sao trước không phát hiện: probe 2026-07-15 chỉ **53 HĐ/11 trang** (`query.ts:53-60`) — không ngày nào >50 HĐ nên **không cụm nào bị cắt** → nhìn thì "distinct === total". Bug chỉ lộ khi một ngày >50 HĐ và ranh giới trang cắt ngang — xảy ra liên tục ở quy mô thật.

Điểm khuếch đại (đã ghi B4): `queryOne` **không đối chiếu `rows.length` với `total`** mà GDT trả trong phong bì (`gdt-contract-schema.json:10-12`) → thiếu hụt **không bị phát hiện**, run vẫn ghi `completed`. Cộng A1+A2 → 285 HĐ này **kẹt vĩnh viễn**, không đường kéo lại.

### Hướng sửa (chưa làm — chờ chốt)
1. **Dùng `total` làm oracle**: sau khi phân trang một truy vấn, nếu `distinct < total` → biết thiếu, phải kéo lại bằng chiến lược hẹp hơn (không nuốt im lặng).
2. **Thu hẹp cửa sổ để không cắt ngang cụm**: chia truy vấn theo NGÀY (hoặc nhỏ hơn) cho tới khi mỗi lát `total ≤ size` hoặc `distinct === total`. Với ngày >50 HĐ vẫn cần cơ chế (1) để chốt đủ.
3. **Đường ép đồng bộ lại tháng đã phủ** (sửa A2: cờ `force`) để kéo lại 285 HĐ hiện thiếu sau khi vá (1)/(2).

Trục A1/A2 vẫn cần sửa độc lập (late-arrival hóa đơn thường ở các tenant khác).

---

## HIỆU CHỈNH sau probe token THẬT (2026-07-25) — giả thuyết "cắt-ngang-cụm" BỊ BÁC BỎ

Chạy `scripts/gdt-paginate-probe.mjs` với token thật (tài khoản 4201969169), endpoint sco:

**Bằng chứng đo được:**
- **Cả tháng 6, sco:** 140 trang, **distinct 6981, 0 trùng chéo trang**, con trỏ kết thúc tự nhiên. **`total` GDT trả BẤT ỔN: dao động 6755–7023 ngay trong một lần phân trang.**
- **Cửa sổ 3 ngày (VN 26–28/06):** distinct 868; **quét từng ngày rồi hợp lại = 868 (CHÊNH 0).** ⇒ **Thu hẹp cửa sổ KHÔNG lấy thêm** → giả thuyết "cửa sổ tháng cắt ngang cụm cùng-ngày làm con trỏ bỏ sót" **SAI**.
- Con trỏ luôn lấy ít hơn total-max ~0.6% (868 vs 873; 6981 vs 7023) — nhỏ.
- **Ba quan sát cho ba con số khác nhau: DB ta 6802 · probe tươi 6981 · công cụ 3 7023.**

**Root cause đã hiệu chỉnh (theo bằng chứng, không đoán):**
1. **[CHÍNH] Production UNDER-CAPTURE do 429 / "Too many subrequests" (B3).** Probe gặp **429 ngay request đầu** — GDT rate-limit rất mạnh (khớp bằng chứng prod n=61 "Too many subrequests"). Run tháng-6 fail nhiều → ghi 0 dòng/run fail → DB đọng ở high-water thấp (6802). Bằng chứng quyết định: **một lần probe tươi (có backoff) đã lấy 6981 > 6802** — tức dữ liệu KÉO LẠI ĐƯỢC, chỉ là production chưa kéo đủ.
2. **[KHUẾCH ĐẠI] A1+A2: không re-sync tháng đã phủ** → high-water thấp không bao giờ được cải thiện; upsert idempotent lẽ ra HỢP dần qua nhiều lần kéo, nhưng cron dừng ở tháng hiện tại.
3. **[GDT-SIDE, thứ yếu] `total` bất ổn + con trỏ hụt ~0.6%.** Mỗi lần kéo ra một tập hơi khác (phi tất định), nên cần **kéo lặp + HỢP** mới hội tụ về đủ.

**Hướng sửa đã hiệu chỉnh:**
1. **Làm run hoàn tất được:** backoff 429 mạnh hơn + quản ngân sách subrequest (chia lô/nhiều invocation) — để phiên không fail giữa chừng. Đây là đòn bẩy chính.
2. **Kéo lặp + HỢP tới khi ổn định:** đối chiếu `distinct` với `total`; total bất ổn → kéo lại và hợp (upsert idempotent) tới khi không tăng nữa.
3. **Ép re-sync tháng đã phủ (A2 + cờ force):** để hợp thêm phần production đã bỏ sót — probe chứng minh một lần kéo lại đã +179.

Bài học phương pháp: giả thuyết "cắt-ngang-cụm ngày" nghe hợp lý và khớp phân bố diff, nhưng **probe thật bác bỏ** — đúng tinh thần "độ tự tin không thay bằng chứng" (Hiến pháp).

---

## Xác minh trần subrequest (khung — điền số liệu khi nghiệm thu)

### (a) Hướng dẫn kiểm gói Cloudflare Workers trên Dashboard

**Cách kiểm tra trên Cloudflare:**

1. Đăng nhập vào Cloudflare Dashboard → **Workers & Pages**
2. Tìm section **Plan** (hoặc **Subscriptions** tuỳ phiên bản)
3. Ghi rõ tên gói hiện tại: **Workers Paid** hay **Workers Free**
   - **Lưu ý quan trọng:** Gói **Workers Paid** ≠ gói **zone Pro/Business**. Hai cái này **độc lập**. Một tài khoản có thể "zone Pro" nhưng "Workers Free", hoặc ngược lại.
   - Subrequest limit của **Workers Free: 50/invocation**
   - Subrequest limit của **Workers Paid: 1000/invocation** (theo tài liệu Cloudflare Workers Limits — đối chiếu lại trang docs khi kiểm vì con số có thể thay đổi)

**Ngữ cảnh chẩn đoán:** Chủ dự án khẳng định tenant này "đã Paid", nhưng production log hôm 2026-07-18 ghi `local_limit` n=61 lần "Too many subrequests" trong `lan_dong_bo` (cron tháng 6). Điều này **chưa giải thích được** — hoặc gói thực tế là Free, hoặc có nguyên nhân khác (rate-limit GDT, overload request). Bước nghiệm thu phải **xác minh thực tế gói + lưu chứng minh**.

### (b) Lệnh quan sát log subrequest trong lúc chạy

Để quan sát tín hiệu `local_limit` khi thực hiện delta-sync tháng 6 ở phiên nghiệm thu (Task 14):

```bash
npx wrangler tail vat-sync-worker --search "local_limit"
```

**Giải thích:**
- Lệnh này **tails real-time logs** từ worker `vat-sync-worker` trên production/staging
- `--search "local_limit"` **lọc chỉ dòng chứa** từ khóa `local_limit` (tín hiệu bị giới hạn subrequest)
- Log này **đã được nhúng** trong `apps/sync-worker/src/runDeltaJob.ts` nhánh `failureKind === "local_limit"` (`console.warn("[delta] local_limit: ...")` — trần nền tảng Workers, KHÔNG phải 429 của GDT)
- Chạy lệnh trên, rồi kích hoạt delta-sync tháng 6 trong dashboard → **ghi lại count n và thời điểm**

### (c) Khung kết luận (để điền sau mỗi lần kiểm tra)

| Tiêu chí | Chi tiết |
|---|---|
| **Gói Workers thực tế** | **Workers Paid — chủ dự án xác nhận ĐÃ NÂNG CẤP ngày 2026-07-26** (lời xác nhận trực tiếp trong phiên làm việc; trước đó là Free). Điều này GIẢI được mâu thuẫn cũ: sự cố "Too many subrequests" n=61 ngày 2026-07-18 xảy ra khi tài khoản còn Free (trần 50/invocation) — khớp hoàn toàn với chẩn đoán B3. Từ nay trần là 1000/invocation; `DELTA_CHUNK_PAGES=40` càng dư an toàn. |
| **Bằng chứng lệnh + output** | **CHƯA KIỂM CHỨNG — điền ở bước nghiệm thu (Task 14).** Chạy lệnh `npx wrangler tail ...` ở trên trong lúc delta-sync tháng 6, ghi count n = [số lần "local_limit" xuất hiện] và timespan (từ...đến). Dán 3–5 dòng log mẫu. |
| **Điều chỉnh DELTA_CHUNK_PAGES nếu cần** | **CHƯA KIỂM CHỨNG — điền ở bước nghiệm thu (Task 14).** Nếu n > 0 (vẫn hit limit): giảm `DELTA_CHUNK_PAGES` từ [hiện tại] xuống [mới đề xuất] để giảm subrequest/invocation. Nếu n = 0: ghi "Không cần điều chỉnh — gói đã đủ subrequest / lỗi 429 không tái xuất hiện." |

### Ghi chú vận hành delta-sync

Hai điều cần biết khi vận hành chuỗi audit → kéo lô → kiểm lại (Task 6, `apps/sync-worker/src/runDeltaJob.ts`) trong lúc nghiệm thu/khai thác:

**(a) Caveat ROLLBACK — pause queue `vat-sync` TRƯỚC KHI hạ cấp `vat-sync-worker`.** Message `kind:"audit"`/`kind:"delta"` là hình dạng MỚI (Task 3/6), là **siêu tập cấu trúc** của `SyncJobMessage` (job header cũ — đủ `tenantId/taikhoanId/direction/dateFrom/dateTo/period`, xem chốt chặn "phanLoaiMessage — THỨ TỰ nhánh consumer" trong `apps/sync-worker/test/unit/runDeltaJob.test.ts`). Nếu hạ cấp `vat-sync-worker` về một bản KHÔNG hiểu `kind`, trong khi hàng đợi `vat-sync` còn message audit/delta đang bay: consumer cũ đọc chúng như **job đồng bộ header CẢ THÁNG** (do khớp đủ trường bắt buộc) thay vì đúng ngữ nghĩa lô/kiểm nhỏ — vừa lãng phí (kéo lại nguyên tháng) vừa để lại **run `lan_dong_bo` đang `running` treo vĩnh viễn** (không consumer nào của bản cũ biết chốt nó). **Quy trình bắt buộc:** pause queue `vat-sync` (Cloudflare dashboard hoặc `wrangler queues pause-delivery`) → xác nhận không còn message audit/delta in-flight (hoặc chấp nhận để chúng nằm chờ) → rollback worker → resume queue sau khi worker mới (hiểu `kind`) đã deploy.

**(b) Replay DLQ nối vào run đã chốt `failed` rồi tự lành thành `completed` — ĐÚNG, không phải bug.** Khi một message audit/delta rơi dead-letter (vượt `max_retries`/`bpAttempt` trần), `dlqConsumer.ts` chốt run `failed` NGAY (xem "I2" trong `.superpowers/sdd/task-6-report.md`) để không treo `running` mãi. Nếu sau đó người vận hành **replay** message đó từ DLQ (`wrangler queues consumer …` hoặc lệnh trong `docs/prompts` cho DLQ), message tiếp tục chạy trên đúng `lanDongBoId` cũ và có thể **kéo tiếp/hội tụ tới `completed`** — ghi đè trạng thái `failed` trước đó bằng `completed` khi vòng audit tiếp theo xác nhận đã đủ. Đây là hành vi **idempotent theo thiết kế** (upsert theo khóa tự nhiên + `chotDeltaRun` chỉ set trạng thái CUỐI, không khoá một chiều), KHÔNG phải dấu hiệu dữ liệu hỏng — người đọc sổ `lan_dong_bo` không nên hoảng khi thấy một run "đổi từ failed sang completed" sau một lượt replay DLQ có chủ đích.

---

## NGHIỆM THU 2026-07-26 (~16:30 VN) — THÁNG 6 MUA VÀO ĐÃ PHỤC HỒI ĐỦ

Bằng chứng đo trực tiếp trên Neon production (information_schema + đếm bảng):

- **Count tháng 6 purchase: 6802 → 7104** (vượt mốc nghiệm thu ≥6981). Theo nguồn: **sco 7023 — KHỚP CHÍNH XÁC total GDT của công cụ thứ ba (7023)**; normal 81.
- **Nguồn phục hồi:** run legacy full-month **FORCE** hoàn thành lúc `2026-07-25 23:35:46Z` (06:35 sáng 26/07 VN) với `so_hd_moi=285` — đúng 285 HĐ sco thiếu trong chẩn đoán — SAU chuỗi ~15 run failed (23:18Z→02:00Z, khớp mẫu 429/fail-toàn-run của kiến trúc cũ). Tức trục "force + upsert hợp" đã cứu dữ liệu, đúng như probe dự đoán.
- **Delta-sync mới (deploy 26/07):** người dùng bấm "Đồng bộ từ Thuế" kỳ 06/2026 lúc ~16:23 VN → **4 audit (2 chiều × 2 lượt) completed loai='audit' trong ~20 giây, moi=0** — hệ phát hiện "đủ" và KHÔNG kéo lại gì. Chứng minh mục tiêu "không lặp việc đã làm" hoạt động trên production.
- **Khung xác minh subrequest:** (b) `wrangler tail --search local_limit` cửa sổ ~4 phút trong lúc delta chạy: **n=0** (delta chỉ audit, không kéo — chưa có lô lớn nào để thử trần). (a) Gói Workers trên dashboard: **CHƯA KIỂM CHỨNG — chủ dự án xem Dashboard khi tiện**; bằng chứng gián tiếp mới nhất vẫn là chuỗi fail đêm 25/07 của đường legacy full-month (không phân biệt được 429 GDT vs trần subrequest từ DB). (c) `DELTA_CHUNK_PAGES` giữ 40 — chưa có lý do chỉnh.
- Phần đuôi triển khai: migration 0016 + vat-sync-worker `83448a32` + vat-api `ab66a35b` + vat-web `56b76a3e`.

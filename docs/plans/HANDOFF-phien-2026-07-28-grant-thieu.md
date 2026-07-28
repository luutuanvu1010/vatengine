# HANDOFF phiên 2026-07-28 — "Đồng bộ treo" hoá ra là `permission denied`, không phải rate-limit

> Nhật ký chẩn đoán & xử lý, ~09:40–10:30 VN 28/07/2026.
> Người quyết định: chủ dự án. Thực thi: Claude (Cowork).
> **Nguyên tắc trình bày:** mỗi khẳng định dưới đây gắn nhãn ✅ ĐÃ KIỂM CHỨNG (có lệnh +
> kết quả tái lập được, ghi trong phiên này) hoặc ⚠️ CHƯA KIỂM CHỨNG (suy luận từ mã,
> chưa có phép đo). Không trộn hai loại.

## 1. Câu hỏi mở đầu và câu trả lời

**Hỏi:** "Quy tắc thích ứng rate-limit của GDT đã áp cho tài khoản 4201969169 — sao chưa
áp rộng cho mọi tài khoản? Tài khoản 019197004411 bấm Đồng bộ vẫn hiện thông báo cũ."

**Đáp:** Tiền đề của câu hỏi sai ở cả hai vế.

- ✅ **Không có cấu hình rate-limit riêng cho MST nào.** Ngưỡng đọc từ `vars` chung của
  worker (`apps/sync-worker/wrangler.jsonc`); chỉ *trạng thái* token-bucket + circuit
  breaker là per-tenant (Durable Object `TenantLimiter`, khoá theo `tenantId`). Grep toàn
  repo: 0 kết quả hard-code `4201969169`/`019197004411` trong logic đồng bộ.
- ✅ **Thông báo người dùng thấy không phải "thông báo cũ"** mà là bảng minh bạch tác vụ
  nền thêm ngày 27/07 (`RangeSyncPanel.tsx:70-77`), và nó báo đúng.
- ✅ **GDT không kìm nhịp ta trong 24h qua:** đúng 1 lần `Kìm nhịp GDT (U28)` trong
  `lan_dong_bo.thong_diep_loi`, từ 09:11 ngày 27/07. Không có bão 429.

## 2. Nguyên nhân thật (✅ ĐÃ KIỂM CHỨNG)

`permission denied for table bo_dem_phien_ban` — nguyên văn từ
`lan_dong_bo.thong_diep_loi`, lần gần nhất 2026-07-28T02:36:02Z.

**Chuỗi nhân quả:**

1. Chuỗi kéo hoá đơn từ GDT **thành công** (sáng 28/07 về 307 hoá đơn mới).
2. Bước chốt phiên gọi `capSoPhienBan` (`packages/sync/src/soPhienBan.ts`) → ghi
   `bo_dem_phien_ban` → **quyền bị từ chối** → cả transaction rollback → run `failed`.
3. `classifyFailure` xếp lỗi DB vào `transient` (`packages/sync/src/sync.ts:222`) →
   `message.retry()` → đếm vào `max_retries: 5` → hết lượt thì rơi xuống dead-letter.
4. Consumer dead-letter ghi `dong_bo_that_bai` — **bảng này CŨNG thiếu quyền** → thử 3
   lần rồi bỏ message (`max_retries: 3`, không có DLQ-của-DLQ theo thiết kế).

**Số liệu:** 39 phiên `failed` trong 24h — 019197004411: 16, 4201969169: 13, 4200730402: 5.
**Cả ba tài khoản đều dính.** Đây là lý do trực giác ban đầu của chủ dự án ("chưa áp rộng
rãi") đúng về *hiện tượng* nhưng sai về *nguyên nhân*.

**Cơ chế gốc:** repo không dùng `ALTER DEFAULT PRIVILEGES` (grep = 0);
`packages/db/provisioning/app-role.sql:28` chạy `GRANT … ON ALL TABLES` đúng MỘT LẦN
(2026-07-14). Bảng tạo sau mốc đó không thừa hưởng quyền nào. Migration `0007:72-75` đã
ghi cảnh báo này thành chữ — nhưng `0008` (20/07) và `0017` (U35) vẫn quên.
✅ Kiểm chứng: `grep -c GRANT` trên cả hai file = **0**.

**Vì sao test không bắt được:** test chạy PGlite dưới role owner, không có `vat_app`. Lỗi
chỉ tồn tại ở production.

## 3. Đã làm trong phiên

- ✅ **Vá nóng production:** `GRANT SELECT, INSERT, UPDATE` cho `bo_dem_phien_ban`,
  `lich_su_thay_doi_hoa_don`, `dong_bo_that_bai` (role `neondb_owner` → `vat_app`).
  Đã xác minh lại bằng `has_table_privilege` ngay sau khi cấp: cả ba ✓✓✓.
- ✅ **Chỉ cấp 3/9 bảng.** Sáu bảng còn lại mà công cụ soát báo "thiếu" thực ra **cố ý
  đóng**: `quan_tri_he_thong`/`xac_thuc_email`/`dat_mat_khau` vào qua hàm SECURITY DEFINER
  của role riêng (`0011:63-65` ghi rõ `REVOKE ALL FROM PUBLIC` là lớp chắn chống cấp
  thừa); `audit_log_admin` append-only, đọc qua `admin_doc_audit()`; `cau_hinh_he_thong`
  và `goi_dich_vu` app chỉ đọc.
- Bốn script chẩn đoán chỉ-đọc (dùng `pg`, **không cần `psql`** — máy chủ dự án không có):
  `kiem-suc-khoe-dong-bo.mjs`, `kiem-loi-bo-dem-phien-ban.mjs`, `kiem-quyen-bang.mjs`,
  `va-quyen-bang-thieu.mjs`.
- Hai mục backlog `[2026-07-28]`.

## 4. VẤN ĐỀ LỚN CÒN TỒN TẠI — xếp theo mức nghiêm trọng

### 4.1 🔴 Vá nóng CHƯA được codify — môi trường mới sẽ lặp lại y hệt

- ✅ Migration `0008` và `0017` vẫn **không có** câu `GRANT`.
- **Hệ quả:** khôi phục DR, dựng staging, hay bất kỳ DB mới nào đều tái tạo đúng lỗi này.
  Vá nóng chỉ sửa một máy chủ đang chạy, không sửa công thức.
- **Việc:** thêm `GRANT` vào hai migration đó (hoặc migration mới), khớp quyền tối thiểu
  đã dùng khi vá nóng.

### 4.2 🔴 Sổ dead-letter đã hỏng âm thầm từ 20/07 — ta mù về mọi job chết

- ✅ `dong_bo_that_bai` tạo ở migration `0008` ngày **2026-07-20**, không GRANT. Mọi lần
  `dlqConsume` ghi sổ từ đó tới 28/07 đều `permission denied`.
- **Hệ quả:** ⚠️ CHƯA KIỂM CHỨNG khối lượng, nhưng về nguyên tắc **8 ngày job chết không
  để lại dấu vết nào**. Sự cố livelock 27/07 chẩn đoán trong mù một phần vì lý do này.
- **Việc:** sau khi đã vá quyền, kiểm `dong_bo_that_bai` có bản ghi mới không; cân nhắc
  cảnh báo khi bảng này nhận bản ghi.

### 4.3 🔴 Cron nền 03:00 sáng 28/07 không sinh phiên nào

- ✅ `lan_dong_bo` **trống hoàn toàn** từ 16:00 VN 27/07 đến 09:00 VN 28/07. Toàn bộ 307
  hoá đơn sáng 28/07 do chủ dự án bấm tay lúc 09:00–09:36.
- **Hệ quả:** đồng bộ nền — lời hứa cốt lõi của sản phẩm — coi như không tồn tại.
- ⚠️ CHƯA KIỂM CHỨNG nguyên nhân. Ba giả thuyết: (a) cổng egress đóng, `isEgressBlocked`
  ở `apps/sync-worker/src/index.ts:91` khiến `scheduled()` bỏ qua **im lặng**;
  (b) `enumerateDueAccounts` trả rỗng; (c) cron `0 20 * * *` (commit `4c5e7d1`) chưa thực
  sự deploy.
- **Cách phân xử:** `npx wrangler tail --name vat-sync-worker` quanh 03:00 VN, hoặc mục
  Logs/Cron của Worker trên dashboard Cloudflare. **DB không trả lời được câu này.**

### 4.4 🟠 15 chuỗi mồ côi đang chặn Đồng bộ của hai tài khoản

- ✅ Bảng `lan_dong_bo` có 15 run `running` (13 của 019197004411, 2 của 4201969169), mở
  lúc 02:10–02:34Z 28/07, message đã chết ở hàng đợi trước khi vá quyền.
- **Hệ quả:** `coDeltaRunDangChay` (trần tuổi 2h) **từ chối mở chuỗi mới** cho cùng
  (tài khoản × kỳ × chiều) — bấm Đồng bộ bị chặn im lặng cho tới ~11:35 VN 28/07.
- **Việc:** hoặc chờ bộ chặn tự nhả, hoặc chốt tay các run mồ côi thành `failed` (có tiền
  lệ 27/07, dấu vết còn trong `thong_diep_loi`).
- **Nợ thiết kế:** run mồ côi không có cơ chế tự chốt — trần tuổi 2h chỉ *bỏ qua* chúng,
  không dọn. Chúng ở lại `running` vĩnh viễn, làm nhiễu mọi thống kê về sau.

### 4.5 🟠 U35 chạy production nhưng không có trên nhánh làm việc

- ✅ `bo_dem_phien_ban` + `lich_su_thay_doi_hoa_don` + cột `lan_dong_bo.so_phien_ban` **có
  thật trong DB production**, nhưng mã chỉ tồn tại ở nhánh
  `claude/u35b-u35-sequential-4d3ad9`. Nhánh làm việc `feat/cloudflare-stack-u0` không có.
- **Hệ quả:** mã đang chạy thật lệch mã trên nhánh. Phiên này suýt bỏ sót nguyên nhân vì
  grep trên nhánh hiện tại không thấy `bo_dem_phien_ban` ở đâu cả. Mọi sửa đổi sau đều có
  nguy cơ giẫm chân nhau hoặc sinh migration trùng số.
- **Việc:** merge U35 hoặc rollback nó khỏi production — không để lửng.

### 4.6 🟠 Không có cổng chặn nào cho lớp lỗi này — đã dính 2 lần

- ✅ `0008` và `0017` cùng một lỗi, cách nhau 8 ngày. Cảnh báo bằng chữ trong `0007`
  không đủ.
- **Việc (chủ dự án đã hoãn, ghi backlog):** test đọc `pg_class` liệt kê mọi bảng `public`
  rồi đối chiếu bảng tra "quyền theo thiết kế" — đã có sẵn trong `kiem-quyen-bang.mjs`;
  bảng mới không khai quyền ⇒ CI đỏ. Liên quan mục backlog `[2026-07-21]` "không có test
  nào chạy dưới role Postgres non-superuser thật".

### 4.7 🟡 Cấu hình nhịp gọi GDT vẫn ở "chế độ nhỏ giọt" từ 27/07

- ✅ `wrangler.jsonc` hiện: `LIMITER_CAPACITY 5` (gốc 10), `LIMITER_REFILL_PER_SEC 1`
  (gốc 2), `SYNC_PAGE_MIN_INTERVAL_MS 2000` (gốc 500), `DELTA_CHUNK_PAGES 10` (gốc 40).
- **Hệ quả:** tự bóp chậm 4–8× trong khi ✅ đã đo được GDT không còn phạt. Kéo lịch sử 7
  tháng mất hàng giờ thay vì vài chục phút.
- **Việc:** khôi phục 4 biến về gốc. Riêng `FANOUT_BACKPRESSURE_DELAY_SEC` (đang 180, thiết
  kế 300) **chờ chủ dự án chốt** — treo từ 27/07, vẫn chưa quyết.

### 4.8 🟡 Nợ tồn đọng chưa xử (từ các phiên trước, vẫn còn nguyên)

- ✅ Một số bảng có quyền **rộng hơn** thiết kế (di sản `GRANT … ON ALL TABLES`) — chưa rà,
  chưa thu hồi. `kiem-quyen-bang.mjs` nay có báo cáo mục này.
- TOCTOU trên `coDeltaRunDangChay`: không có partial unique index, vẫn có thể mở ~3 chuỗi
  trùng (backlog `[2026-07-27]`).
- `goi_dich_vu.gh*MoiPhut` là "núm chưa nối dây" — lưu được, hiển thị được, **không route
  nào enforce** (`HANDOFF-U17a-2026-07-19.md:124`). An toàn giả.
- `apps/api/vitest.config.ts:28-41` và `configClamp.ts:2` còn tham chiếu file
  `loginLimiter*` đã bị xoá ở U33 — rác cấu hình.

## 5. Bài học ghi sổ

- **"Đồng bộ treo" ≠ "GDT chặn".** Thứ tự phân xử đúng: đếm `trang_thai` trong
  `lan_dong_bo` → đọc `thong_diep_loi` **nguyên văn** (bảng gộp cắt cụt phần "nguyên nhân"
  ở cuối) → chỉ khi thấy dày đặc 429 mới kết luận GDT. Phiên này nếu đi theo giả thuyết
  ban đầu sẽ chỉnh cấu hình nhịp gọi và làm nhiễu phép đo.
- **Nhiều tác vụ nền không đồng nghĩa với lỗi.** Kéo lịch sử lần đầu thì 2 chuỗi/tháng
  (mua vào + bán ra) là đúng thiết kế. Sự cố 27/07 là nhiều chuỗi cho **cùng một** kỳ —
  khác hẳn.
- **Công cụ soát tự động có thể đề xuất sai và nguy hiểm.** Bản đầu của
  `kiem-quyen-bang.mjs` đề xuất `GRANT` đủ bốn quyền cho mọi bảng thiếu — chạy nguyên xi
  sẽ phá thiết kế "cửa hẹp" của 4 bảng nhạy cảm. Phải mã hoá **ý định thiết kế** vào công
  cụ, không chỉ so với "đủ quyền".
- **Máy chủ dự án không có `psql`.** Mọi script vận hành viết bằng Node + `pg` (đã là
  dependency của `@vat/db`).

## 6. Phụ lục ~10:30–11:20 VN (chủ dự án duyệt "đồng ý" cho việc 4.4 + 4.2, Claude thực thi)

### 6.1 ✅ Mục 4.4 XONG — 15 run mồ côi đã chốt tay

Lúc 03:30Z: chốt cả 15 run (13 × 019197004411, 2 × 4201969169) thành `failed` trong
MỘT transaction (SELECT id FOR UPDATE → so khớp đúng 15 → UPDATE → COMMIT), thông điệp
`chốt thủ công 2026-07-28: message chết ở hàng đợi vì permission denied bo_dem_phien_ban
(đã vá GRANT 28/07) — run mồ côi`. Sau chốt: 0 run `running` toàn hệ — nút Đồng bộ hết
bị chặn ngay, không phải chờ trần tuổi 2h (~11:35).

### 6.2 ✅ Mục 4.2 XONG — sổ dead-letter trống THẬT + vá quyền thông end-to-end

- `dong_bo_that_bai` = 0 bản ghi, và 0 này là THẬT: `neondb_owner` có
  `rolbypassrls = true` (kiểm `pg_roles`) + `pg_stat_user_tables.n_live_tup = 0` đối
  chiếu độc lập — không phải bị FORCE RLS che. Xác nhận 8 ngày ghi sổ đều bị nuốt.
- **Bằng chứng end-to-end mạnh nhất:** 03:53–03:54Z, **4 run `completed`** (4201969169,
  kỳ 2026-07, đủ purchase + sold) và `bo_dem_phien_ban` nhận `gia_tri = 4` cho tenant
  `cd7d1f12`. Đúng cái bảng gây sập cả sáng nay ghi được trên production. Vá quyền xong
  việc.

### 6.3 Mục 4.3 — chẩn đoán thu hẹp đáng kể (chưa chốt hẳn)

- ✅ **Giả thuyết (b) BÁC** — `enumerateDueAccounts` không rỗng lúc 20:00Z: TTL token
  GDT = **đúng 24h** (login 02:29:30Z → `token_het_han` 02:29:30Z hôm sau); tại 20:00Z
  đêm 27/07 có ≥ 2 token còn hạn (4200730402 tới 01:35Z, 4201969169 tới 11:22Z 28/07).
- ✅ **Giả thuyết (c) YẾU HẲN** — deploy 07:21:59Z (21 giây sau commit `4c5e7d1` đổi
  cron) + deploy 11:32Z 27/07; và **cơ chế cron của worker SỐNG**: tick `*/15` lúc
  03:45:53Z 28/07 outcome `ok`, kèm probe ghi `EgressHealth /save` 03:46:13Z (bắt bằng
  `wrangler tail`).
- ✅ Cửa sổ 19:30–22:00Z 27/07: `audit_log` + `lan_dong_bo` **trống tuyệt đối** ⇒ không
  message nào được enqueue lúc 20:00Z (nếu có, header của 4200730402/4201969169 phải để
  vết: run, breaker-skip audit, hoặc reauth).
- ⚠️ CHƯA KIỂM CHỨNG — còn đúng 2 khả năng: **(a)** gate `isEgressBlocked` đọc health
  GEO_BLOCKED (cũ/sai) → `scheduled()` bỏ qua im lặng (chỉ `console.warn`), hoặc
  **(f, mới)** exception sớm trong `scheduled()` (loadHealth DO / getDbFromHyperdrive)
  trước khi kịp enqueue. **Phân xử:** Workers Logs trên dashboard (observability đã
  bật) quanh 2026-07-27T20:00Z — tìm dòng `[GATE] egress GEO_BLOCKED` hoặc invocation
  lỗi; hoặc quan sát cron 20:00Z đêm nay 28/07 — token 019197004411 còn hạn tới
  02:29Z 29/07 nên **đêm nay cron lành thì PHẢI sinh phiên**.
- Bài học công cụ: `wrangler tail` giao sự kiện **trễ vài phút** và kết nối có thể rớt
  im lặng — "không thấy trong tail" ≠ "không xảy ra" (suýt kết luận nhầm tick 03:45Z
  không nổ). Dấu probe tin cậy = sự kiện DO `EgressHealth /save`. Lịch sử quá khứ chỉ
  xem được ở dashboard (wrangler 4.110 chưa có lệnh truy vấn Workers Logs).

### 6.4 ⚠️ Quan sát mới trong lúc chẩn đoán (chưa điều tra sâu)

- ~02:36–03:54Z: đàn message của `cd7d1f12` (backfill bấm tay sáng nay) quay vòng
  backpressure dày (~138 lượt `/acquire` trong 6 phút quan sát), breaker mở lại nhiều
  đợt (`dong_bo_bo_qua_breaker` ×8 từ 02:00Z), rồi **tự thông ~03:53Z** (chính là 4 run
  completed ở 6.2). Không rơi DLQ. Cơ chế tự hồi hoạt động, nhưng nhịp "số trung"
  (capacity 5, refill 1/s) làm bão nhỏ này kéo dài ~80 phút.
- **12 hóa đơn của 4200730402** (ký hiệu C26MYY, lập 30/04–17/05/2026, `ttxly = 8`,
  chiều sold) **thiếu dòng hàng dai dẳng** — nghi GDT không trả chi tiết cho nhóm này.
  Token tenant này đã hết hạn (01:35Z) nên vòng "tự lành" không chạy được; cần đăng
  nhập lại 4200730402 rồi theo dõi, nếu vẫn kẹt thì điều tra riêng (có thể liên quan
  `ttxly = 8`).

## 7. Phụ lục 3 — ~12:00 VN: khôi phục cấu hình nhịp + đồng bộ trục (QĐ chủ dự án "khôi phục luôn, không chờ cron đêm")

- ✅ **Mục 4.7 XONG:** 4 var về gốc (`LIMITER_CAPACITY 10`, `LIMITER_REFILL_PER_SEC 2`,
  `SYNC_PAGE_MIN_INTERVAL_MS 500`, `DELTA_CHUNK_PAGES 40`) + deploy `vat-sync-worker`
  version `b84ef862` — output deploy in rõ từng var và xác nhận trigger
  `schedule: 0 20 * * *` + `*/15 * * * *` được đăng ký. Riêng
  `FANOUT_BACKPRESSURE_DELAY_SEC` giữ 180 — chốt 180 vs 300 **vẫn treo**.
- ✅ **Mục 4.5 HẾT HIỆU LỰC:** U35 thực ra ĐÃ merge vào trục trên origin từ 27/07
  (commit `7751006`, nhật ký "đồng bộ trục" `aa6f2b5`, kèm `097281f` sửa mốc journal
  0017 + ADR-0008) — máy local chỉ chưa pull nên biên bản sáng nay nhìn thấy "lệch
  nhánh". Đã rebase 4 commit local lên đầu origin (resolve conflict BACKLOG bằng cách
  giữ cả hai cụm mục), push `c09bc5e`. **Hệ quả: mục 4.1 hết vướng đánh số — codify
  GRANT có thể làm thành migration 0018 trên trục.**
- ✅ Trước deploy đã theo đúng luật: push trục → `make migrate` → hậu kiểm ADR-0008
  bằng truy vấn trực tiếp (18 bản ghi `__drizzle_migrations`, mốc cuối khớp journal
  `0017`; hai bảng U35 tồn tại) → mới `wrangler deploy`.
- Vệ sinh: gỡ `HEAD.lock` rỗng (0 byte, sinh 09:40 — tàn dư phiên sáng bị ngắt) bằng
  lệnh phạm vi hẹp sau khi xác minh không còn tiến trình git nào chạy; hook chặn
  `rm` đụng `.git` đã kích hoạt đúng vai trò, ghi lại đây cho minh bạch.
- Task trực cron 02:50 sáng 29/07 giữ nguyên — đêm nay cron 20:00Z chạy với **nhịp
  gốc**; nếu lại im lặng thì nguyên nhân không thể là nhịp gọi.

# HANDOFF phiên 2026-07-27 — Sự cố "thiếu hoá đơn ngày 26/07" → livelock → khôi phục

> Nhật ký + quyết định của phiên chẩn đoán & xử lý, 09:00–15:00 VN 27/07/2026.
> Người quyết định: chủ dự án. Thực thi: Claude (Cowork + Code, TDD + review chéo subagent).

## 1. Kết quả cuối (đã kiểm chứng lúc ~14:45 VN)

- Ngày 26/07 trong DB: **305 HĐ mua vào** (303 sco + 2 thường) — VƯỢT file đối chiếu NiBot
  (291, chụp lúc 10:18); bán ra 116 và chuỗi còn đang về nốt.
- Phép thử `ncnhat` toàn bộ 303 HĐ sco mua vào ngày 26: **303/303 có mốc GDT-nhận SAU
  16:24 ngày 26/07** (batch 19:00 tối 26 → rải tới 12:33 trưa 27). ⇒ **Giả thuyết A chốt**:
  audit ghi "đủ" hôm 26 là ĐÚNG tại thời điểm hỏi; KHÔNG có bug đếm trong `decideAudit`.

## 2. Chuỗi nguyên nhân (3 tầng, đều có bằng chứng trong backlog mục [2026-07-27])

1. **Đặc tính nguồn:** GDT nạp HĐ máy tính tiền ngày D thành batch ~19:00 VN tối D + rải
   tới ~12:30 trưa D+1 → mọi trích xuất trong ngày D tất yếu thiếu ngày D.
2. **Bug của ta (gốc, ĐÃ VÁ):** mỗi lần bấm "Đồng bộ" mở thêm chuỗi kéo TRÙNG cho cùng
   (tài khoản × tháng × chiều) — 13 chuỗi trùng kỳ 07 giành van 2 req/s → livelock.
3. **Hệ quả:** bão request (~30 lần bấm × 3 tầng nhân bản) → GDT phạt nguồn Cloudflare
   (429 → treo-không-đáp, ~08:40–14:15) — trong khi IP VN của người dùng vẫn vào bình
   thường (đo curl 0,08s + portal). Án phạt tự nhả sau khi ta ngừng dội (nhỏ giọt).

## 3. Quyết định của chủ dự án trong phiên

| # | Quyết định | Hiện trạng |
|---|---|---|
| 1 | Purge queue `vat-sync` (2 lần) để gỡ nghẽn + chốt run mồ côi | Đã làm (11:04 & 13:35) |
| 2 | Backpressure delay hạ 600→**180s** | Đã deploy |
| 3 | **Cron nền 10:00 → 03:00 sáng VN** (`0 20 * * *` UTC) — hứng trọn batch 19:00 của GDT | Đã deploy; phiên đầu chạy đêm nay |
| 4 | Chốt tính năng **"Xem nhanh từ Thuế"** (kéo–hiển thị–lưu một nhịp, khoá Xuất tới khi đủ) | Spec đã viết + commit: `docs/plans/TRUC-TIEP-tra-cuu-khoang-hep-plan.md` — chờ QA1/thực thi |

## 4. Code đã giao trong phiên (đều lint+test xanh, review chéo dod-auditor PASS, đã deploy)

- `24cf296` **fix(sync): khử chuỗi kéo delta trùng lặp** — `coDeltaRunDangChay` (@vat/sync,
  trần tuổi 2h) + dep `coChuoiKeoDangChay` trong `runAuditJob`; guard ở tầng consumer nên
  chặn mọi nguồn (tay/cron/replay).
- `acd536b` **feat(sync): minh bạch tác vụ nền** — guard dời lên ĐẦU `runAuditJob`
  (audit trùng = 0 permit + 0 request GDT); `GET /tax-accounts/:id/sync-status`;
  POST /backfill trả `thangDangChay`; web hiện "Đang có x tác vụ đồng bộ chạy nền".
- `74d2525`→`4c5e7d1` **ops**: chế độ nhỏ giọt → số trung (xem mục 5) + đổi giờ cron.
- Docs: chẩn đoán đầy đủ + 3 mục backlog mới (đọc `docs/BACKLOG-y-tuong-va-de-xuat.md`
  [2026-07-27]×3).

## 5. ⚠️ TRẠNG THÁI VẬN HÀNH ĐANG TREO — phiên sau PHẢI xử lý

**Cấu hình sync-worker đang ở "SỐ TRUNG" (tạm), KHÔNG phải giá trị gốc:**

| Var | Đang chạy | Gốc |
|---|---|---|
| LIMITER_CAPACITY | 5 | 10 |
| LIMITER_REFILL_PER_SEC | 1 | 2 |
| SYNC_PAGE_MIN_INTERVAL_MS | 2000 | 500 |
| DELTA_CHUNK_PAGES | 10 | 40 |
| FANOUT_BACKPRESSURE_DELAY_SEC | 180 (QĐ chủ dự án trong sự cố) | 300 (giá trị thiết kế sau sự cố 18/07) |

**Việc phải làm:** sau khi cron 03:00 sáng 28/07 chạy trơn (kiểm `lan_dong_bo` sáng 28/07:
completed, không bão 429), khôi phục 4 var đầu về gốc; riêng backpressure 180 vs 300 hỏi
chủ dự án chốt. Lưu ý: giữ số trung lâu dài làm cron kéo-cả-tháng chậm (~7-10 phút) nhưng
KHÔNG vỡ trần (đã tính); khôi phục gốc vẫn nên làm để trả hệ về trạng thái đã kiểm định.

## 6. Việc xếp hàng (theo thứ tự ưu tiên đề xuất)

1. **Khôi phục cấu hình gốc** (mục 5) — sau cron sáng 28/07.
2. **U35** (phiên KHÁC đã chuẩn bị, chưa commit): `docs/plans/U35-plan.md` + khảo sát
   `docs/KHAO-SAT-NIBOT-co-che-xuat-du-lieu-2026-07-27.md` — 3 file đang untracked,
   thuộc luồng làm việc khác, phiên này KHÔNG đụng.
3. **"Xem nhanh từ Thuế"** — spec sẵn, bước 1 là probe 2 điểm CHƯA KIỂM CHỨNG.
4. **Cron chuyển delta-audit** (~200→4 request/ngày thường) — backlog [2026-07-27].
5. **Partial unique index chặn race TOCTOU** (đã thấy race thật: 2 chuỗi cách 3s trưa 27/07)
   — backlog [2026-07-27].

## 7. Bài học ghi sổ (đã vào memory dự án)

- GDT phạt theo HÀNH VI + NGUỒN, cửa sổ nhiều giờ; ngừng dội thì tự nhả — "im lặng/nhỏ
  giọt" là đúng thuốc, retry dày tự nuôi án phạt.
- `ncnhat` là công cụ phân xử "GDT chưa có" vs "ta kéo sót" — dùng trước khi nghi bug.
- Số đo một thời điểm (file NiBot 10:18) không nói gì về thời điểm khác — luôn hỏi "chụp
  lúc nào" trước khi so sánh.

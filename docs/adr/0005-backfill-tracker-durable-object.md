# ADR-0005 — Theo dõi tiến độ backfill bằng Durable Object (U22 B4)

- **Trạng thái:** ✅ CHỐT 2026-07-16 (chủ dự án chọn PA-A qua phiên Cowork). Đơn vị: **U22 B4** (`docs/plans/U22-plan.md` §4C).
- **Bối cảnh phụ thuộc:** kế thừa ADR-0001 (§ "trạng thái phối hợp đặt ở Durable Object"). Dựng trên B3 `coveredMonths` (`packages/sync/src/coverage.ts`).

## Bối cảnh — vì sao cần chốt

U22 (backfill ngầm khi lọc kỳ quá khứ chưa đồng bộ) cần một nơi lưu **định nghĩa một lần backfill** — backfill này gồm những THÁNG nào — để `GET /backfill/:id` (B6) báo tiến độ "X/N tháng". `lan_dong_bo` biết "tháng nào đã đồng bộ thành công" (cổng B1 + B3) nhưng KHÔNG nhóm theo *yêu cầu backfill*. Cần primitive lưu nhóm đó. Plan để mở 2 phương án:

- **PA-A — Durable Object `BackfillTracker`** (1 DO / `backfillId`).
- **PA-B — bảng Postgres** (`backfill` + `backfill_thang`).

## Quyết định

**Chọn PA-A (Durable Object `BackfillTracker`).**

DO chỉ lưu **định nghĩa** backfill: `{ tenantId, taikhoanId, months[], directions[], createdAtMs }`. **Tiến độ từng tháng KHÔNG lưu ở DO** — B6 SUY tại thời điểm đọc bằng cách giao `months` với `coveredMonths` (B3, đọc `lan_dong_bo`). Hệ quả: **consumer/pipeline U5 KHÔNG bị đụng** (không cần báo "xong kỳ" về DO) — tôn trọng U22-plan §7.

Giao diện DO: `POST /init` (store-once idempotent, kèm cách ly tenant), `GET /def` (đọc có kiểm phạm vi tenant). Client `backfillTrackerClient(ns, backfillId)`. Class export ở entry `apps/api/src/index.ts`; binding `BACKFILL_TRACKER` + migration **v4** (`new_sqlite_classes`, thuần cộng dồn).

## Vì sao PA-A (không PA-B)

- **Hợp ADR-0001:** trạng thái phối hợp/ephemeral đặt ở DO (giống `TenantLimiter`, `LoginLimiter`), không phình schema nghiệp vụ Postgres.
- **Không thêm migration DB + không ghi chéo từ consumer nền:** PA-B buộc consumer nền cập nhật `backfill_thang` mỗi kỳ → đụng pipeline U5 (§7 cấm). PA-A + suy-từ-`lan_dong_bo` tránh hẳn.
- **Nhẹ nhờ B3:** vì "xong/chưa" suy được từ `lan_dong_bo`, tracker chỉ giữ danh sách tháng → trạng thái DO tối thiểu.

## Đánh đổi đã chấp nhận (consequences)

- **Trạng thái backfill KHÔNG nằm trong DB để truy vấn lịch sử/analytics.** Nếu sau này cần báo cáo lịch sử backfill xuyên tenant, phải bổ sung (khi đó cân nhắc lại PA-B hoặc ghi song song). Hiện U22 KHÔNG yêu cầu.
- **Cách ly tenant ở tầng DO là phòng thủ, không thay thế kiểm ở route.** `readDef`/`initDef` từ chối def của tenant khác (trả `null`/`conflict`, KHÔNG echo dữ liệu chéo tenant); nhưng B6 vẫn PHẢI truyền `tenantId` lấy từ JWT nội bộ đã xác minh (`c.get("tenantId")`), tuyệt đối không từ input client.
- **Fail-closed:** thiếu binding `BACKFILL_TRACKER` → client ném (producer B5 trả 503). Khác `LOGIN_LIMITER` (fail-open) — đúng vì đây là dữ liệu theo dõi, không phải cổng đăng nhập.

## Bằng chứng

- Logic thuần + cách ly: `apps/api/src/backfillTracker.ts` (`initDef` store-once + `conflict` chéo tenant; `readDef` phạm vi tenant), test `apps/api/test/unit/backfillTracker.test.ts` (6 ca, 100% phủ). DO wiring: `apps/api/src/backfillTrackerDO.ts`.
- Migration v4 thuần cộng dồn (KHÔNG `deleted_classes`, KHÔNG sửa v1/v2/v3 — tránh lặp sự cố xoá DO 2026-07-16, `.claude/rules/deploy.md`).

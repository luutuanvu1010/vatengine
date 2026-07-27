# U35 / U35b — Nhật ký tiến độ

> Ghi một dòng sau mỗi đơn vị đóng, theo `docs/plans/U35-prompt-dieu-phoi.md`.

- **U35b** — DONE — commit `593c0b9` (+ docs spec `4c8eeea`) — Thuế suất hiện % (numFmt custom
  165="0%", giữ giá trị gốc 0.08); Tiền thuế tự tính khi GDT thiếu (BigInt, chuẩn hóa một nơi
  `tsuatTienChuan`, dùng chung cho cột Tiền thuế lẫn Tổng tiền sau thuế); KCT/KKKNT phân biệt
  qua `ltsuat` → trống thay vì "0%" giả. `make lint` + `make test` (toàn repo, 12 workspace)
  xanh. `dod-auditor` PASS (tự chạy lại test độc lập, không chỉ tin lời khai). Không đổi
  `packages/domain` (giữ ràng buộc `tsuat.kieu==="num"` đã khóa bằng test có sẵn), không đổi
  `apps/web`. Backlog: `invoiceDoc.ts` (renderer XML/HTML riêng, U22) chưa hưởng sửa này — ghi
  ở `docs/BACKLOG-y-tuong-va-de-xuat.md`.
- **U35** — DONE — commit `7751006` — Lưu vết + cảnh báo thay đổi trạng thái hóa đơn.
  DB: bảng `lich_su_thay_doi_hoa_don` (nhật ký ttxly/tthai, RLS+FORCE, composite FK same-tenant
  qua `hoa_don`, unique chống trùng redelivery) + `bo_dem_phien_ban` (đếm nguyên tử); cột
  `lan_dong_bo.so_phien_ban`; trigger DB `hoa_don_ghi_lich_su_thay_doi` (AFTER UPDATE, phủ cả
  đường update trực tiếp lẫn `onConflictDoUpdate`); `withTenant` mở rộng nhận `lanDongBoId` tùy
  chọn (packages/db/src/tenantContext.ts). Sync: `sync()` cũ ĐẢO THỨ TỰ (mở phiên running trước
  upsert — cần cho cả trigger lẫn composite FK); `syncChunk`/`chotDeltaRun`/`ghiAuditDu` đấu dây
  đủ. API: `GET /invoices/changes` + `POST /invoices/changes/mark-read` (không chạm GDT). Web:
  badge/panel "Hóa đơn vừa thay đổi" (`InvoiceChangesBadge.tsx`) + primitive `Popover` mới.
  `make lint` + `make test` từng workspace xanh (packages/db 114, packages/sync 141,
  packages/query 99, apps/api 503, apps/web 316, apps/sync-worker 168 — riêng, không đụng);
  coverage packages/db từng đỏ (functions 78.94%<80%) vì 2 file schema mới dùng
  `.references(() => …)` (thunk lazy Drizzle không được v8 tính là "đã gọi") — sửa bằng
  `foreignKey()` tường minh trong extraConfig, lên 88.23% (ghi nhớ:
  `drizzle-references-v8-coverage`). `make test` TOÀN REPO đồng thời có flakiness đã biết ở
  `apps/sync-worker` (tranh chấp tài nguyên 12 workspace song song — đã cô lập bằng chứng, không
  phải regression, ghi ở BACKLOG). `dod-auditor` PASS (1 Minor: bảng `06-BINDING_MAP.md` mục 3c
  lệch cột — đã sửa); `security-reviewer` PASS (không phát hiện vi phạm). Backlog thêm: flakiness
  `make test` đồng thời.

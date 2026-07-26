// Package đồng bộ `@vat/sync` (U5) — dịch vụ upsert idempotent hóa đơn: dựng trên
// adapter `@vat/gdt-client` (U2) + schema `@vat/db` (U4). U6 (API) và U9 (nền) gọi lại.
export { mapInvoiceRowToHoaDon } from "./mapInvoice";
export {
  sync,
  // Nhận diện trần nền tảng Workers (subrequest) — tầng job dùng để KHÔNG tính lỗi
  // cục bộ vào circuit breaker GDT (sự cố 2026-07-18).
  laTranNenTangCucBo,
  type DetailCandidate,
  type InvoiceChange,
  type SyncOptions,
  type SyncResult,
} from "./sync";
// Pha 2 (dòng hàng): primitive persist idempotent + factory lấy detail qua adapter.
// Tách sẵn để đường 2 pha nền (queue) tái dùng khi mở rộng quy mô.
export { persistInvoiceLines, mapLineToDongHangHoa, adapterFetchDetail } from "./detailLines";
// U26 (backfill) — tập hóa đơn thiếu dòng hàng cho trigger backfill-lines.
export { listInvoicesMissingLines, type MissingLinesResult } from "./missingLines";
// Contract job đồng bộ nền + lịch kỳ (dùng chung producer/consumer — U9 + "Đồng bộ ngay").
export {
  type SyncJobMessage,
  type DetailSyncMessage,
  type AuditSyncMessage,
  type DeltaPullMessage,
  type VatSyncQueueMessage,
  type PeriodWindow,
  currentPeriodWindow,
  buildSyncMessages,
  buildDetailMessages,
  isDetailMessage,
  isAuditMessage,
  isDeltaMessage,
  buildAuditMessages,
  // U22 — backfill khoảng lọc quá khứ: tách khoảng thành cửa sổ tháng đầy đủ + dựng job.
  monthlyWindows,
  buildBackfillMessages,
} from "./syncJob";
// U22 B3 — suy phạm vi đã phủ / còn thiếu từ lan_dong_bo (nền cho producer backfill B5).
// U22 B6 — suy tiến độ backfill từng tháng + tổng (nền cho GET /backfill/:id).
export {
  coveredMonths,
  missingMonths,
  deriveBackfillStatus,
  monthlyBackfillStatus,
  type BackfillMonthStatus,
  type BackfillProgress,
} from "./coverage";
// Task 4 — quyết định vòng kiểm audit (delta-sync) + đếm DB theo nguồn (Task 6 dùng).
export {
  TRAN_VONG_DELTA,
  decideAudit,
  demHoaDonTheoNguon,
  type FamilyObservation,
  type AuditDecision,
} from "./audit";

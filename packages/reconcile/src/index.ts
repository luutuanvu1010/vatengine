// Package đối chiếu `@vat/reconcile` (U10) — phát hiện bất thường ON-READ trên hóa đơn ĐÃ
// đồng bộ (đọc DB, KHÔNG gọi GDT). Dựng trên `@vat/db` (U4) + `@vat/query` (U6, buildWhere).
// apps/api nối thành endpoint GET /reconcile.
export { reconcile, type ReconcileOptions } from "./reconcile";
export { findTaxMismatches } from "./taxIntegrity";
export { findSequenceGaps, type SequenceGapOptions } from "./sequenceGaps";
export { classifyStatus, findStatusAnomalies, type StatusClass } from "./statusAnomaly";
export { STATUS_CODE_MAP } from "./statusCodes";
export type {
  Finding,
  FindingKind,
  ReconcileReport,
  ReconcileSummary,
  SequenceGapFinding,
  StatusCodeMap,
  StatusFinding,
  TaxMismatchFinding,
} from "./types";

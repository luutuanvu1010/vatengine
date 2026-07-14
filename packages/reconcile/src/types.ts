// Kiểu cho module đối chiếu (U10). Findings tính ON-READ (không persist — không tạo
// nguồn sự thật thứ hai; mục 7/CLAUDE.md). Mọi phát hiện đều trong phạm vi một tenant.

/** Bảng mã trạng thái GDT (`tthai`/`ttxly`) → phân loại hủy / thay thế. Xem statusCodes.ts:
 * map production hiện RỖNG (mã CHƯA KIỂM CHỨNG — Nguyên tắc bằng chứng của Hiến pháp). */
export interface StatusCodeMap {
  huy: { tthai?: number[]; ttxly?: number[] };
  thayThe: { tthai?: number[]; ttxly?: number[] };
}

export type FindingKind = "lech_thue" | "thieu_so_dau_ra" | "huy" | "thay_the";

/** Lệch thuế: số học nội tại header không khớp (tgtcthue − ttcktmai + tgtthue ≠ tgtttbso). */
export interface TaxMismatchFinding {
  kind: "lech_thue";
  hoaDonId: string;
  shdon: string;
  tgtcthue: string | null;
  ttcktmai: string | null;
  tgtthue: string | null;
  tgtttbso: string | null;
  /** Hiệu tuyệt đối (chuỗi numeric — không ép float). */
  lech: string;
}

/** Thiếu số hóa đơn đầu ra: khoảng trống dãy `shdon` trong nhóm (nbmst, khhdon). Là
 * NGHI NGỜ (có thể do đồng bộ thiếu kỳ), không khẳng định chắc thiếu. */
export interface SequenceGapFinding {
  kind: "thieu_so_dau_ra";
  nbmst: string;
  khhdon: string;
  shdonThieu: number;
}

/** Hóa đơn hủy / bị thay thế theo bảng mã trạng thái. */
export interface StatusFinding {
  kind: "huy" | "thay_the";
  hoaDonId: string;
  shdon: string;
  tthai: number | null;
  ttxly: number | null;
}

export type Finding = TaxMismatchFinding | SequenceGapFinding | StatusFinding;

export interface ReconcileSummary {
  lechThue: number;
  thieuSoDauRa: number;
  huy: number;
  thayThe: number;
}

export interface ReconcileReport {
  findings: Finding[];
  summary: ReconcileSummary;
}

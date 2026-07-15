// Contract job đồng bộ nền + lịch kỳ — NGUỒN SỰ THẬT DUY NHẤT dùng chung giữa:
//  - producer: cron `scheduled()` (vat-sync-worker) VÀ endpoint "Đồng bộ ngay" (vat-api),
//  - consumer: `queue()` (vat-sync-worker).
// Đặt ở @vat/sync để KHÔNG nhân đôi định nghĩa message/period giữa hai app (Hiến pháp §8).
import type { InvoiceDirection } from "@vat/gdt-client";

// Payload MỘT job: một tenant × một tài khoản thuế × một chiều × một kỳ. `tenantId`
// TƯỜNG MINH — job nền không có request context (multi-tenant.md).
export interface SyncJobMessage {
  tenantId: string;
  taikhoanId: string;
  direction: InvoiceDirection;
  /** Khoảng ngày lập, dd/mm/yyyy (khớp adapter GDT). */
  dateFrom: string;
  dateTo: string;
  /** Kỳ "YYYY-MM" (giờ VN) — truy vết + idempotent theo kỳ. */
  period: string;
}

export interface PeriodWindow {
  /** "YYYY-MM" theo giờ VN. */
  period: string;
  /** Ngày đầu/cuối tháng, dd/mm/yyyy. */
  dateFrom: string;
  dateTo: string;
}

// Giờ VN = UTC+7. Dịch mốc UTC sang "giờ tường" VN rồi đọc bằng getUTC* để tính đúng
// biên tháng theo lịch VN (portal thuế dùng ngày theo giờ VN).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Kỳ đồng bộ mặc định = tháng hiện tại theo giờ VN, tại `nowMs` (epoch ms). */
export function currentPeriodWindow(nowMs: number): PeriodWindow {
  const vn = new Date(nowMs + VN_OFFSET_MS);
  const year = vn.getUTCFullYear();
  const month = vn.getUTCMonth(); // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const mm = String(month + 1).padStart(2, "0");
  return {
    period: `${year}-${mm}`,
    dateFrom: `01/${mm}/${year}`,
    dateTo: `${String(lastDay).padStart(2, "0")}/${mm}/${year}`,
  };
}

/** Dựng một message / (tài khoản × chiều). tenant_id đi tường minh trong payload. */
export function buildSyncMessages(
  accounts: { tenantId: string; taikhoanId: string }[],
  window: PeriodWindow,
  directions: InvoiceDirection[],
): SyncJobMessage[] {
  return accounts.flatMap((a) =>
    directions.map((direction) => ({
      tenantId: a.tenantId,
      taikhoanId: a.taikhoanId,
      direction,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      period: window.period,
    })),
  );
}

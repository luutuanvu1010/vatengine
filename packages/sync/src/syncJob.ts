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
  /**
   * H-B.4 — số lần ĐẨY LÙI (backpressure) liên tiếp đã reenqueue message này. KHÔNG có
   * ở message do producer tạo (coi = 0); chỉ consumer đặt khi reenqueue. Dùng để CHẶN
   * vòng lặp vô hạn: vượt trần → chuyển sang retry thật (max_retries → dead-letter),
   * có điểm dừng + được giám sát thay vì lặp mãi khi rate_limited/breaker kéo dài.
   */
  bpAttempt?: number;
}

/**
 * U26 — Payload MỘT message pha 2 (dòng hàng): một hóa đơn / message, đi CÙNG queue
 * `vat-sync` với job header. Phân biệt bằng `kind:"detail"`; message header cũ KHÔNG
 * có `kind` (đang bay trong queue + producer đã deploy) → consumer phải hiểu là header
 * (tương thích lùi, kiểm bằng `isDetailMessage`). `tenantId` TƯỜNG MINH (multi-tenant.md).
 * `ref` = 4 trường định danh detail đã kiểm chứng (2026-07-13, KHÔNG tdlap) + nguồn
 * normal|sco để chọn đúng endpoint — khớp `InvoiceDetailRef` của @vat/gdt-client.
 */
export interface DetailSyncMessage {
  kind: "detail";
  tenantId: string;
  taikhoanId: string;
  /** `hoa_don.id` đích — persistInvoiceLines xóa-chèn theo (hoadon_id, tenant_id). */
  hoaDonId: string;
  ref: {
    nbmst: string;
    khhdon: string;
    khmshdon: string;
    shdon: string;
    source: "normal" | "sco";
  };
  /** Đẩy lùi (backpressure) — cùng ngữ nghĩa SyncJobMessage.bpAttempt. */
  bpAttempt?: number;
}

/** Mọi hình dạng message hợp lệ trên queue vat-sync (header U5/U22 + detail U26). */
export type VatSyncQueueMessage = SyncJobMessage | DetailSyncMessage;

/** Phân nhánh consumer: chỉ tin `kind === "detail"`; mọi thứ khác coi là header. */
export function isDetailMessage(body: unknown): body is DetailSyncMessage {
  return (
    typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "detail"
  );
}

/**
 * U26 — dựng message pha 2 từ danh sách ứng viên (DetailCandidate của sync() hoặc tập
 * thiếu-dòng-hàng của backfill-lines). Dùng CHUNG cho mọi producer (sync-worker sau
 * job header; vat-api trigger backfill) để một nguồn sự thật về hình dạng message.
 */
export function buildDetailMessages(
  account: { tenantId: string; taikhoanId: string },
  candidates: Array<{ hoaDonId: string; ref: DetailSyncMessage["ref"] }>,
): DetailSyncMessage[] {
  return candidates.map((c) => ({
    kind: "detail",
    tenantId: account.tenantId,
    taikhoanId: account.taikhoanId,
    hoaDonId: c.hoaDonId,
    ref: c.ref,
  }));
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

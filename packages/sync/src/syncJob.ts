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

/** Kiểm tra trạng thái đồng bộ một khoảng ngày × chiều (Task 3, U6-U7). */
export interface AuditSyncMessage {
  kind: "audit";
  tenantId: string;
  taikhoanId: string;
  direction: InvoiceDirection;
  dateFrom: string;
  dateTo: string;
  period: string; // "YYYY-MM"
  /** 0 = kiểm đầu; ≥1 = kiểm lại sau vòng kéo thứ `vong`. */
  vong: number;
  /** Run đang mở (chỉ vong ≥ 1). */
  lanDongBoId?: string;
  /** Tổng count DB ở lần kiểm trước (xét bão hòa). */
  prevCount?: number;
  /** Đẩy lùi (backpressure) — cùng ngữ nghĩa SyncJobMessage.bpAttempt. */
  bpAttempt?: number;
}

/** Kéo chi tiết từ một họ hóa đơn (normal|sco) trong một vòng đồng bộ (Task 3, U6-U9). */
export interface DeltaPullMessage {
  kind: "delta";
  tenantId: string;
  taikhoanId: string;
  direction: InvoiceDirection;
  dateFrom: string;
  dateTo: string;
  period: string; // "YYYY-MM"
  lanDongBoId: string;
  /** Họ đang kéo (normal|sco). */
  family: "normal" | "sco";
  /** Họ chờ kéo sau họ này. */
  conLai: ("normal" | "sco")[];
  /** Con trỏ GDT; undefined = đầu họ. */
  state?: string;
  /** Vòng hiện tại (1-based). */
  vong: number;
  /** Count DB lúc audit mở vòng này (chuyển tiếp cho re-audit). */
  prevCount: number;
  /** Đẩy lùi (backpressure) — cùng ngữ nghĩa SyncJobMessage.bpAttempt. */
  bpAttempt?: number;
}

/** Mọi hình dạng message hợp lệ trên queue vat-sync (header U5/U22 + detail U26 + audit/delta U3-U9). */
export type VatSyncQueueMessage =
  | SyncJobMessage
  | DetailSyncMessage
  | AuditSyncMessage
  | DeltaPullMessage;

/** Phân nhánh consumer: chỉ tin `kind === "detail"`; mọi thứ khác coi là header. */
export function isDetailMessage(body: unknown): body is DetailSyncMessage {
  return (
    typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "detail"
  );
}

/** Phân nhánh: chỉ tin `kind === "audit"`. */
export function isAuditMessage(body: unknown): body is AuditSyncMessage {
  return typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "audit";
}

/** Phân nhánh: chỉ tin `kind === "delta"`. */
export function isDeltaMessage(body: unknown): body is DeltaPullMessage {
  return typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "delta";
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

/** Kỳ THÁNG LIỀN TRƯỚC theo giờ VN, tại `nowMs` (epoch ms) — cron audit để hóa đơn
 * người bán đẩy trễ (về sau khi kỳ tháng đó đã "đóng") vẫn được vá lại tự động
 * (đóng lỗ hổng A1, docs/CHAN-DOAN-thieu-hoa-don-thang.md). Cuộn năm khi tháng
 * hiện tại là tháng 1 (01/2027 → kỳ liền trước 12/2026). */
export function previousPeriodWindow(nowMs: number): PeriodWindow {
  const vn = new Date(nowMs + VN_OFFSET_MS);
  const year = vn.getUTCFullYear();
  let prevYear = year;
  let prevMonth0 = vn.getUTCMonth() - 1; // 0-based
  if (prevMonth0 < 0) {
    prevMonth0 = 11;
    prevYear -= 1;
  }
  return monthWindow(prevYear, prevMonth0);
}

/** Cửa sổ THÁNG ĐẦY ĐỦ (01→cuối tháng) cho `(year, month0)` — month0 0-based, giờ VN.
 * Mirror công thức biên tháng của `currentPeriodWindow` (ngày cuối qua `Date.UTC(y,
 * m+1, 0)`), giữ ĐỘC LẬP để KHÔNG sửa `currentPeriodWindow` (U22-plan §7: cron +
 * "Đồng bộ ngay" phụ thuộc hành vi nó — không tái cấu trúc ngoài phạm vi). */
function monthWindow(year: number, month0: number): PeriodWindow {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const mm = String(month0 + 1).padStart(2, "0");
  return {
    period: `${year}-${mm}`,
    dateFrom: `01/${mm}/${year}`,
    dateTo: `${String(lastDay).padStart(2, "0")}/${mm}/${year}`,
  };
}

/** Parse ngày lọc `YYYY-MM-DD` (lịch VN) fail-loud: sai định dạng / ngày phi thực tế
 * (2026-02-30) đều ném thay vì cuộn âm thầm sang tháng khác. Trả `{y, m0}` + mốc thứ
 * tự `ord` (UTC ms) để so sánh khoảng. Tinh thần khớp `filters.ts:dayBoundaryUtc`. */
function parseIsoYmd(iso: string): { y: number; m0: number; ord: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Ngày lọc phải định dạng YYYY-MM-DD: ${iso}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(y, mo - 1, day));
  // `Date.UTC` CUỘN ngày tràn (2026-02-30 → 2026-03-02) → đối chiếu Y-M-D để fail-loud.
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== mo || d.getUTCDate() !== day) {
    throw new Error(`Ngày lọc không có thật (tràn số ngày của tháng): ${iso}`);
  }
  return { y, m0: mo - 1, ord: d.getTime() };
}

/**
 * Tách khoảng lọc `[dateFromIso, dateToIso]` (mỗi cái `YYYY-MM-DD`, lịch VN) thành danh
 * sách cửa sổ THÁNG ĐẦY ĐỦ theo thứ tự tăng dần, MỖI THÁNG MỘT phần tử (U22 AC1).
 *
 * Vì sao tháng đầy đủ (KHÔNG cắt theo ngày lọc của người dùng)? `lan_dong_bo` + đồng bộ
 * idempotent (U5) làm việc theo ĐƠN VỊ THÁNG (`currentPeriodWindow` luôn 01→cuối tháng).
 * Backfill theo tháng đầy đủ để "đã phủ" khớp granularity đó (cổng B1) — lần lọc sau
 * trong cùng tháng KHÔNG kích hoạt backfill lại; upsert vẫn idempotent nên phủ dư ngày
 * ngoài khoảng lọc là an toàn. `dateFrom`/`dateTo` là dd/mm/yyyy (khớp adapter GDT).
 *
 * Fail-loud (không đoán): sai định dạng / ngày phi thực tế / khoảng đảo ngược đều ném.
 */
export function monthlyWindows(dateFromIso: string, dateToIso: string): PeriodWindow[] {
  const from = parseIsoYmd(dateFromIso);
  const to = parseIsoYmd(dateToIso);
  if (from.ord > to.ord) {
    throw new Error(`Khoảng lọc không hợp lệ: tuNgay (${dateFromIso}) sau denNgay (${dateToIso})`);
  }
  const windows: PeriodWindow[] = [];
  let y = from.y;
  let m0 = from.m0;
  // Lặp bao gồm cả tháng của `from` lẫn `to`; carry năm khi qua tháng 12.
  while (y < to.y || (y === to.y && m0 <= to.m0)) {
    windows.push(monthWindow(y, m0));
    m0 += 1;
    if (m0 > 11) {
      m0 = 0;
      y += 1;
    }
  }
  return windows;
}

/** Dựng message backfill cho MỘT tài khoản qua NHIỀU cửa sổ tháng × nhiều chiều — tổng
 * quát hoá `buildSyncMessages` cho backfill (U22 §4A). tenant_id/taikhoan_id đi tường
 * minh trong mọi payload (multi-tenant.md); message trùng dạng `SyncJobMessage` nên
 * consumer nền (U9) xử lý được ngay, KHÔNG đổi consumer. */
export function buildBackfillMessages(
  account: { tenantId: string; taikhoanId: string },
  windows: PeriodWindow[],
  directions: InvoiceDirection[],
): SyncJobMessage[] {
  return windows.flatMap((w) => buildSyncMessages([account], w, directions));
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

/** Dựng message audit cho MỘT tài khoản qua NHIỀU cửa sổ tháng × nhiều chiều (Task 3, U6-U7).
 * Một message / (tháng × chiều), vong=0 (kiểm đầu), không gắn vòng kéo (lanDongBoId). */
export function buildAuditMessages(
  account: { tenantId: string; taikhoanId: string },
  windows: PeriodWindow[],
  directions: InvoiceDirection[],
): AuditSyncMessage[] {
  return windows.flatMap((w) =>
    directions.map((direction) => ({
      kind: "audit" as const,
      tenantId: account.tenantId,
      taikhoanId: account.taikhoanId,
      direction,
      dateFrom: w.dateFrom,
      dateTo: w.dateTo,
      period: w.period,
      vong: 0,
    })),
  );
}

import { taiKhoanThue, withTenant } from "@vat/db";
// U9 — Lịch đồng bộ nền: cửa sổ kỳ hiện tại (theo giờ VN) + liệt kê tài khoản đến
// hạn + dựng message job. Chính sách "đến hạn" của U9 = CỬA SỔ TRƯỢT mặc định (kỳ
// tháng hiện tại), KHÔNG bảng lịch riêng (quyết định U9). Chỉ chọn tài khoản có
// token CÒN HẠN — job nền KHÔNG tự đăng nhập, KHÔNG captcha (quyết định A, Hiến pháp).
import type { InvoiceDirection } from "@vat/gdt-client";
import { and, eq, gt } from "drizzle-orm";
import type { AnyDb, SyncJobMessage } from "./types";

// Giờ VN = UTC+7. Dịch mốc UTC sang "giờ tường" VN rồi đọc bằng getUTC* để tính
// đúng biên tháng theo lịch VN (portal thuế dùng ngày theo giờ VN).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface PeriodWindow {
  /** "YYYY-MM" theo giờ VN. */
  period: string;
  /** Ngày đầu/cuối tháng, định dạng dd/mm/yyyy (khớp adapter GDT). */
  dateFrom: string;
  dateTo: string;
}

/** Kỳ đồng bộ mặc định = tháng hiện tại theo giờ VN, tại thời điểm `nowMs` (epoch ms). */
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

/** Chuyển dd/mm/yyyy → Date (UTC). Ném rõ ràng nếu sai định dạng (không đoán). */
export function parseDdmmyyyy(s: string): Date {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const d = m
    ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
    : new Date(Number.NaN);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Khoảng ngày không đúng định dạng dd/mm/yyyy: ${s}`);
  }
  return d;
}

export interface DueAccount {
  tenantId: string;
  taikhoanId: string;
}

/**
 * Liệt kê tài khoản đến hạn đồng bộ: token CÒN HẠN tại `nowMs` (quyết định A).
 *
 * Đọc theo TỪNG tenant qua `withTenant` (RLS lọc `app.tenant_id`) + lọc tường minh
 * `tenant_id` — mọi truy cập dữ liệu tài khoản luôn tenant-scoped (multi-tenant.md).
 * Danh sách tenant (`listTenantIds`) là thao tác CONTROL-PLANE (đăng ký tenant),
 * tiêm vào để giữ enumerate thuần data-plane tenant-scoped + test được.
 */
export async function enumerateDueAccounts(
  db: AnyDb,
  nowMs: number,
  listTenantIds: () => Promise<string[]>,
): Promise<DueAccount[]> {
  const tenantIds = await listTenantIds();
  const cutoff = new Date(nowMs);
  const due: DueAccount[] = [];
  for (const tenantId of tenantIds) {
    const accts = await withTenant(db, tenantId, async (tx) =>
      tx
        .select({ id: taiKhoanThue.id })
        .from(taiKhoanThue)
        .where(and(eq(taiKhoanThue.tenantId, tenantId), gt(taiKhoanThue.tokenHetHan, cutoff))),
    );
    for (const a of accts) due.push({ tenantId, taikhoanId: a.id });
  }
  return due;
}

/** Dựng một message / (tài khoản × chiều). tenant_id đi tường minh trong payload. */
export function buildMessages(
  due: DueAccount[],
  window: PeriodWindow,
  directions: InvoiceDirection[],
): SyncJobMessage[] {
  const msgs: SyncJobMessage[] = [];
  for (const a of due) {
    for (const direction of directions) {
      msgs.push({
        tenantId: a.tenantId,
        taikhoanId: a.taikhoanId,
        direction,
        dateFrom: window.dateFrom,
        dateTo: window.dateTo,
        period: window.period,
      });
    }
  }
  return msgs;
}

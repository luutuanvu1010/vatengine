import { taiKhoanThue, withTenant } from "@vat/db";
// U9 — Lịch đồng bộ nền: liệt kê tài khoản đến hạn (token CÒN HẠN) + tiện ích ngày.
// Kỳ/cửa sổ + dựng message = @vat/sync (nguồn dùng chung producer/consumer — cron
// scheduled() + endpoint "Đồng bộ ngay"). Chỉ chọn tài khoản token còn hạn — job nền
// KHÔNG tự đăng nhập, KHÔNG captcha (quyết định A, Hiến pháp).
import { and, eq, gt } from "drizzle-orm";
import type { AnyDb } from "./types";

// Kỳ đồng bộ + dựng message job: re-export từ @vat/sync (NGUỒN SỰ THẬT DUY NHẤT) để
// mọi import sẵn có qua `./schedule` + test giữ nguyên.
export {
  currentPeriodWindow,
  // Task 9 — kỳ THÁNG LIỀN TRƯỚC (cron audit đóng lỗ hổng A1, docs/CHAN-DOAN).
  previousPeriodWindow,
  buildSyncMessages as buildMessages,
  type PeriodWindow,
} from "@vat/sync";

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

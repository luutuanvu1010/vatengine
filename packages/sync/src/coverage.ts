// U22 B3 — Suy PHẠM VI ĐÃ PHỦ của backfill từ `lan_dong_bo` (docs/plans/U22-plan.md
// §4B, AC2). NGUỒN CHÂN LÝ "tháng nào đã đồng bộ" là `lan_dong_bo` (cổng B1 đã chứng
// minh: tháng RỖNG THẬT vẫn để lại 1 phiên 'completed' → phân biệt "đã phủ (kể cả
// rỗng)" với "chưa từng" mà KHÔNG cần bảng/patch mới). Chỉ ĐỌC — không gọi GDT.
//
// Quyết định (B3): "đã phủ" = có ≥1 phiên trạng thái THÀNH CÔNG TRỌN VẸN (`completed`)
// cho đúng (tenant, tài khoản, chiều, tháng). CHỦ Ý KHÔNG tính `hoan_thanh_mot_phan`/
// `running`/`failed`/`can_dang_nhap_lai` là đã phủ: đồng bộ lại là idempotent (U5) và
// an toàn, nên thà backfill lại phần dở còn hơn bỏ sót — ưu tiên đủ dữ liệu.
import { TRANG_THAI_LAN_DONG_BO, lanDongBo } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import { and, eq, gte, lt } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PeriodWindow } from "./syncJob";

// Generic trên `PgDatabase` (mẫu @vat/query.listInvoices): PGlite trong test, pg/
// Hyperdrive khi chạy; `PgTransaction` (từ withTenant) cũng thỏa vì kế thừa.
type Db<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgDatabase<TQuery, TFull, TSchema>;

/** Kỳ "YYYY-MM" của một mốc `tu_ngay` đã lưu. `lan_dong_bo.tu_ngay` được ghi bằng
 * `Date.UTC(y, m-1, 1)` (ngày 1, 00:00 UTC — xem sync.ts parseDdmmyyyy) nên đọc trực
 * tiếp getUTC* trả đúng tháng theo lịch VN mà không cần dịch múi giờ. */
function periodOf(tuNgay: Date): string {
  return `${tuNgay.getUTCFullYear()}-${String(tuNgay.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mốc đầu tháng (UTC) của kỳ "YYYY-MM". */
function monthStartUtc(period: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`period phải định dạng YYYY-MM: ${period}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

/** Mốc đầu tháng KẾ TIẾP (UTC) của kỳ "YYYY-MM" — biên trên (loại trừ) để bound truy vấn. */
function nextMonthStartUtc(period: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`period phải định dạng YYYY-MM: ${period}`);
  // Date.UTC(y, M, 1) với M = số tháng 1-based = ngày 1 tháng kế (cuộn năm khi M=12).
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
}

/**
 * Tập kỳ "YYYY-MM" ĐÃ PHỦ (completed) trong `windows`, cho đúng (tenant, tài khoản,
 * chiều). Lọc TƯỜNG MINH `tenant_id` (multi-tenant.md, lớp 1) — gọi trong `withTenant`
 * để RLS chốt lớp 2. Một truy vấn: bound theo `[đầu tháng nhỏ nhất, đầu tháng-kế lớn
 * nhất)` rồi suy kỳ từ `tu_ngay` và giao với tập kỳ được hỏi. Trả tập con của
 * `windows.map(period)`.
 */
export async function coveredMonths<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  taikhoanId: string,
  chieu: InvoiceDirection,
  windows: PeriodWindow[],
): Promise<Set<string>> {
  if (windows.length === 0) return new Set();
  const wanted = new Set(windows.map((w) => w.period));
  // Biên truy vấn theo tu_ngay: [nhỏ nhất đầu-tháng, lớn nhất đầu-tháng-kế). Không giả
  // định windows đã sắp xếp → lấy min/max tường minh.
  let lo: Date | null = null;
  let hi: Date | null = null;
  for (const w of windows) {
    const s = monthStartUtc(w.period);
    const e = nextMonthStartUtc(w.period);
    if (lo === null || s.getTime() < lo.getTime()) lo = s;
    if (hi === null || e.getTime() > hi.getTime()) hi = e;
  }
  if (lo === null || hi === null) return new Set(); // windows rỗng đã chặn ở trên; chốt kiểu

  const rows = await db
    .select({ tuNgay: lanDongBo.tuNgay })
    .from(lanDongBo)
    .where(
      and(
        eq(lanDongBo.tenantId, tenantId),
        eq(lanDongBo.taikhoanId, taikhoanId),
        eq(lanDongBo.chieu, chieu),
        eq(lanDongBo.trangThai, TRANG_THAI_LAN_DONG_BO.HOAN_THANH),
        gte(lanDongBo.tuNgay, lo),
        lt(lanDongBo.tuNgay, hi),
      ),
    );

  const covered = new Set<string>();
  for (const r of rows) {
    const p = periodOf(r.tuNgay);
    if (wanted.has(p)) covered.add(p);
  }
  return covered;
}

/**
 * Danh sách cửa sổ tháng CÒN THIẾU = `windows` trừ các tháng đã phủ (cho một chiều).
 * Giữ nguyên thứ tự đầu vào. Đây chính là tập cần enqueue backfill (B5).
 */
export async function missingMonths<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  taikhoanId: string,
  chieu: InvoiceDirection,
  windows: PeriodWindow[],
): Promise<PeriodWindow[]> {
  const covered = await coveredMonths(db, tenantId, taikhoanId, chieu, windows);
  return windows.filter((w) => !covered.has(w.period));
}

// Bộ lọc + phân trang cho tra cứu hóa đơn (U6). Validate bằng Zod (ngăn xếp ADR-0001).
// `buildWhere` LUÔN kèm ràng buộc `tenant_id` tường minh (lớp 1 — multi-tenant.md);
// RLS `withTenant` là lớp 2. Khoảng `tdlap` fail-loud khi ngày phi thực tế (không đoán).
import { hoaDon } from "@vat/db";
import { type SQL, and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

export const INVOICE_DIRECTIONS = ["purchase", "sold"] as const;
export const INVOICE_SOURCES = ["normal", "sco"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải định dạng YYYY-MM-DD");

// Zod chỉ kiểm ĐỊNH DẠNG. Bộ lọc; key lạ (limit/offset) bị bỏ qua (không strict) để
// route parse chung một object query cho cả filter lẫn page.
export const invoiceFilterSchema = z.object({
  chieu: z.enum(INVOICE_DIRECTIONS).optional(),
  nguon: z.enum(INVOICE_SOURCES).optional(),
  tuNgay: isoDate.optional(),
  denNgay: isoDate.optional(),
  ttxly: z.coerce.number().int().optional(),
  tthai: z.coerce.number().int().optional(),
  nbmst: z.string().min(1).optional(),
  nmmst: z.string().min(1).optional(),
});
export type InvoiceFilter = z.infer<typeof invoiceFilterSchema>;

// Phân trang: chặn `limit` ở trần 200 để không kéo tập lớn (giới hạn Workers).
export const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Page = z.infer<typeof pageSchema>;

/** `YYYY-MM-DD` → thời khắc UTC đầu/cuối ngày. Ngày phi thực tế → ném (fail-loud):
 * lọc theo ngày sai âm thầm còn tệ hơn báo lỗi. */
function dayBoundaryUtc(isoYmd: string, end: boolean): Date {
  const d = new Date(`${isoYmd}${end ? "T23:59:59.999Z" : "T00:00:00.000Z"}`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Ngày lọc không hợp lệ (không có thật): ${isoYmd}`);
  }
  // `new Date` CUỘN âm thầm ngày tràn số ngày của tháng (2026-02-30 → 2026-03-02,
  // 29/02 năm không nhuận → 01/03) thay vì NaN → đối chiếu lại Y-M-D để fail-loud.
  const [y, m, day] = isoYmd.split("-").map(Number);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) {
    throw new Error(`Ngày lọc không có thật (tràn số ngày của tháng): ${isoYmd}`);
  }
  return d;
}

/** Dựng điều kiện WHERE Drizzle từ bộ lọc, LUÔN gắn `tenant_id` tường minh. */
export function buildWhere(tenantId: string, filter: InvoiceFilter): SQL {
  const conds: SQL[] = [eq(hoaDon.tenantId, tenantId)];
  if (filter.chieu) conds.push(eq(hoaDon.chieu, filter.chieu));
  if (filter.nguon) conds.push(eq(hoaDon.nguon, filter.nguon));
  if (filter.nbmst) conds.push(eq(hoaDon.nbmst, filter.nbmst));
  if (filter.nmmst) conds.push(eq(hoaDon.nmmst, filter.nmmst));
  if (filter.ttxly !== undefined) conds.push(eq(hoaDon.ttxly, filter.ttxly));
  if (filter.tthai !== undefined) conds.push(eq(hoaDon.tthai, filter.tthai));
  if (filter.tuNgay) conds.push(gte(hoaDon.tdlap, dayBoundaryUtc(filter.tuNgay, false)));
  if (filter.denNgay) conds.push(lte(hoaDon.tdlap, dayBoundaryUtc(filter.denNgay, true)));
  const where = and(...conds);
  // Luôn có ít nhất điều kiện tenant → không kỳ vọng undefined; chốt kiểu an toàn.
  if (!where) throw new Error("buildWhere: điều kiện rỗng (không kỳ vọng)");
  return where;
}

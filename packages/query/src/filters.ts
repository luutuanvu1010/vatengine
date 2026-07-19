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

// Portal/GDT dùng giờ VN (UTC+7, không DST). `tdlap` lưu là KHOẢNH KHẮC UTC của ngày VN:
// hoá đơn VN ngày D được lưu `(D-1)T17:00:00Z` (bằng chứng prod 2026-07-20: VN 18/07 →
// 17/07T17:00Z). Vì vậy biên lọc PHẢI dựng theo giờ VN — nếu dựng bằng UTC (`Z`) thì cửa
// sổ dịch 7h, dư ngày cuối + thiếu ngày đầu (chọn [1,2] trả nhầm [2,3]).
const VN_TZ_OFFSET = "+07:00";

/** `YYYY-MM-DD` (ngày theo giờ VN) → thời khắc UTC đầu/cuối ngày ĐÓ Ở GIỜ VN. Ngày phi
 * thực tế → ném (fail-loud): lọc theo ngày sai âm thầm còn tệ hơn báo lỗi. */
export function dayBoundaryVn(isoYmd: string, end: boolean): Date {
  // Kiểm ngày CÓ THẬT bằng probe UTC — `new Date` CUỘN âm thầm ngày tràn-tháng
  // (2026-02-30 → 03-02; 29/02 năm không nhuận → 01/03) thay vì NaN → đối chiếu Y-M-D.
  const [y, m, day] = isoYmd.split("-").map(Number);
  const probe = new Date(`${isoYmd}T00:00:00.000Z`);
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() + 1 !== m ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Ngày lọc không có thật (định dạng đúng nhưng ngày phi thực tế): ${isoYmd}`);
  }
  // Biên theo GIỜ VN: đầu ngày 00:00 VN, cuối ngày 23:59:59.999 VN → offset +07:00 cho
  // ra đúng khoảnh khắc UTC để so với `tdlap` (cũng là khoảnh khắc UTC của ngày VN).
  return new Date(`${isoYmd}${end ? "T23:59:59.999" : "T00:00:00.000"}${VN_TZ_OFFSET}`);
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
  if (filter.tuNgay) conds.push(gte(hoaDon.tdlap, dayBoundaryVn(filter.tuNgay, false)));
  if (filter.denNgay) conds.push(lte(hoaDon.tdlap, dayBoundaryVn(filter.denNgay, true)));
  const where = and(...conds);
  // Luôn có ít nhất điều kiện tenant → không kỳ vọng undefined; chốt kiểu an toàn.
  if (!where) throw new Error("buildWhere: điều kiện rỗng (không kỳ vọng)");
  return where;
}

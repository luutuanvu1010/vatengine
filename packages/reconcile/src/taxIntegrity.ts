// U10 — đối chiếu SỐ HỌC NỘI TẠI header (lệch thuế). Định danh (đã duyệt ở plan U10):
//   tgtcthue − ttcktmai + tgtthue = tgtttbso
// Phép tính chạy TRONG SQL trên cột `numeric` (Postgres cộng chính xác) — KHÔNG ép float
// (mục 7.1). Chỉ xét hóa đơn có ĐỦ ba trường tiền lõi (thiếu → không đủ căn cứ, KHÔNG cờ
// để tránh false-positive). `ttcktmai` null coi như 0 (không chiết khấu).
//
// Ghi chú bằng chứng: quan hệ tổng theo định dạng hóa đơn TT78 (chiết khấu trừ ở tổng)
// khớp các lô đã quan sát khi ttcktmai vắng; cạnh biên nhiều thuế suất/làm tròn để xác
// nhận thêm khi có dữ liệu thật (plan U10, mục "Điểm mơ hồ còn lại"). Dung sai cấu hình
// được để hấp thụ chênh lệch làm tròn hợp lệ.
import { hoaDon } from "@vat/db";
import { type InvoiceFilter, buildWhere } from "@vat/query";
import { and, isNotNull, sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { TaxMismatchFinding } from "./types";

export async function findTaxMismatches<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  filter: InvoiceFilter,
  tolerance: string | number = "0",
): Promise<TaxMismatchFinding[]> {
  // |(chưa thuế − chiết khấu + thuế) − tổng thanh toán|, tính bằng numeric.
  const lech = sql<string>`abs((${hoaDon.tgtcthue} - coalesce(${hoaDon.ttcktmai}, 0) + ${hoaDon.tgtthue}) - ${hoaDon.tgtttbso})`;

  const rows = await db
    .select({
      id: hoaDon.id,
      shdon: hoaDon.shdon,
      tgtcthue: hoaDon.tgtcthue,
      ttcktmai: hoaDon.ttcktmai,
      tgtthue: hoaDon.tgtthue,
      tgtttbso: hoaDon.tgtttbso,
      lech,
    })
    .from(hoaDon)
    .where(
      and(
        buildWhere(tenantId, filter),
        isNotNull(hoaDon.tgtcthue),
        isNotNull(hoaDon.tgtthue),
        isNotNull(hoaDon.tgtttbso),
        sql`${lech} > ${String(tolerance)}::numeric`,
      ),
    );

  return rows.map((r) => ({
    kind: "lech_thue" as const,
    hoaDonId: r.id,
    shdon: r.shdon,
    tgtcthue: r.tgtcthue,
    ttcktmai: r.ttcktmai,
    tgtthue: r.tgtthue,
    tgtttbso: r.tgtttbso,
    lech: r.lech,
  }));
}

// U10 — phát hiện hóa đơn HỦY / THAY THẾ theo bảng mã trạng thái. `classifyStatus` là
// THUẦN (đơn vị test bằng map tiêm); `findStatusAnomalies` truy vấn (generic trên
// PgDatabase, mẫu @vat/query) — LUÔN lọc tenant_id (buildWhere) + chạy trong withTenant.
// Cơ chế tách rời khỏi GIÁ TRỊ mã: map production RỖNG cho tới khi probe (statusCodes.ts).
import { hoaDon } from "@vat/db";
import { type InvoiceFilter, buildWhere } from "@vat/query";
import { type SQL, and, inArray, or } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { StatusCodeMap, StatusFinding } from "./types";

export type StatusClass = "huy" | "thay_the" | "binh_thuong";

function inSet(codes: number[] | undefined, v: number | null): boolean {
  return v != null && (codes?.includes(v) ?? false);
}

/** Phân loại một hóa đơn theo bảng mã. Hủy được ưu tiên khi mã trùng hai tập. */
export function classifyStatus(
  row: { tthai: number | null; ttxly: number | null },
  map: StatusCodeMap,
): StatusClass {
  if (inSet(map.huy.tthai, row.tthai) || inSet(map.huy.ttxly, row.ttxly)) return "huy";
  if (inSet(map.thayThe.tthai, row.tthai) || inSet(map.thayThe.ttxly, row.ttxly)) {
    return "thay_the";
  }
  return "binh_thuong";
}

export async function findStatusAnomalies<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  filter: InvoiceFilter,
  map: StatusCodeMap,
): Promise<StatusFinding[]> {
  const allTthai = [...(map.huy.tthai ?? []), ...(map.thayThe.tthai ?? [])];
  const allTtxly = [...(map.huy.ttxly ?? []), ...(map.thayThe.ttxly ?? [])];
  // Map RỖNG (production chưa kiểm chứng) → không truy vấn, không cờ gì.
  if (allTthai.length === 0 && allTtxly.length === 0) return [];

  const codeConds: SQL[] = [];
  if (allTthai.length) codeConds.push(inArray(hoaDon.tthai, allTthai));
  if (allTtxly.length) codeConds.push(inArray(hoaDon.ttxly, allTtxly));
  const codeWhere = or(...codeConds);

  const rows = await db
    .select({
      id: hoaDon.id,
      shdon: hoaDon.shdon,
      tthai: hoaDon.tthai,
      ttxly: hoaDon.ttxly,
    })
    .from(hoaDon)
    .where(and(buildWhere(tenantId, filter), codeWhere));

  const out: StatusFinding[] = [];
  for (const r of rows) {
    const cls = classifyStatus(r, map);
    if (cls === "binh_thuong") continue;
    out.push({ kind: cls, hoaDonId: r.id, shdon: r.shdon, tthai: r.tthai, ttxly: r.ttxly });
  }
  return out;
}

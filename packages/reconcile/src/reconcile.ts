// U10 — điều phối module đối chiếu: gộp 3 kiểm tra ON-READ (lệch thuế + thiếu số đầu ra +
// hủy/thay thế) trên hóa đơn ĐÃ đồng bộ, trong phạm vi một tenant. KHÔNG gọi GDT, KHÔNG
// ghi bảng (không nguồn sự thật thứ hai). Generic trên PgDatabase (mẫu @vat/query); route
// bọc trong withTenant để RLS chốt tenant (lớp 2) — buildWhere lọc tenant_id (lớp 1).
import type { InvoiceFilter } from "@vat/query";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { findSequenceGaps } from "./sequenceGaps";
import { findStatusAnomalies } from "./statusAnomaly";
import { STATUS_CODE_MAP } from "./statusCodes";
import { findTaxMismatches } from "./taxIntegrity";
import type { Finding, ReconcileReport, StatusCodeMap } from "./types";

export interface ReconcileOptions {
  /** Dung sai lệch thuế (chuỗi numeric) — mặc định "0" (khớp tuyệt đối). */
  tolerance?: string | number;
  /** Bảng mã hủy/thay thế — mặc định map production (statusCodes.ts: `thayThe.tthai=[4]`
   * đã kiểm chứng; `huy` và mọi `ttxly` giữ RỖNG vì chưa có bằng chứng). */
  statusCodeMap?: StatusCodeMap;
  maxGapsPerGroup?: number;
}

export async function reconcile<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: PgDatabase<TQuery, TFull, TSchema>,
  tenantId: string,
  filter: InvoiceFilter,
  opts: ReconcileOptions = {},
): Promise<ReconcileReport> {
  const tolerance = opts.tolerance ?? "0";
  const statusCodeMap = opts.statusCodeMap ?? STATUS_CODE_MAP;

  // Tuần tự (KHÔNG Promise.all): một transaction/kết nối pg-PGlite chỉ chạy một truy vấn
  // tại một thời điểm; song song trên cùng tx là không an toàn.
  const tax = await findTaxMismatches(db, tenantId, filter, tolerance);
  const gaps = await findSequenceGaps(db, tenantId, filter, {
    maxGapsPerGroup: opts.maxGapsPerGroup,
  });
  const status = await findStatusAnomalies(db, tenantId, filter, statusCodeMap);

  const findings: Finding[] = [...tax, ...gaps, ...status];
  return {
    findings,
    summary: {
      lechThue: tax.length,
      thieuSoDauRa: gaps.length,
      huy: status.filter((s) => s.kind === "huy").length,
      thayThe: status.filter((s) => s.kind === "thay_the").length,
    },
  };
}

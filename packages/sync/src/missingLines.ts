// U26 (backfill) — tập hóa đơn ĐANG THIẾU dòng hàng của một tài khoản, để trigger
// backfill-lines enqueue message pha 2 (dùng lại y hệt consumer pha 2 — BACKLOG
// [2026-07-16] Hướng A). `hoa_don` không có taikhoan_id nên cầu nối tài khoản↔hóa
// đơn là MST bên-mình theo chiều: purchase → nmmst (mình là người mua), sold → nbmst
// (mình là người bán). Lọc tenant_id TƯỜNG MINH (multi-tenant.md) + chạy trong
// withTenant (RLS lớp 2) — caller chịu trách nhiệm bọc transaction.
import { dongHangHoa, hoaDon } from "@vat/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { DetailCandidate } from "./sync";

type Tx<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgTransaction<TQuery, TFull, TSchema>;

export interface MissingLinesResult {
  /** Ứng viên pha 2 (tối đa `limit`), mới nhất trước — khớp buildDetailMessages. */
  candidates: DetailCandidate[];
  /** TỔNG số hóa đơn đang thiếu (không bị cắt bởi limit) — để trả `conLai`. */
  tongThieu: number;
}

export async function listInvoicesMissingLines<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  tx: Tx<TQuery, TFull, TSchema>,
  tenantId: string,
  opts: { ownMst: string; limit: number },
): Promise<MissingLinesResult> {
  // "Thiếu dòng hàng" = LEFT JOIN dong_hang_hoa không khớp dòng nào (id IS NULL).
  // Join có điều kiện tenant ở CẢ hai vế — phòng thủ theo chiều sâu cạnh RLS.
  const dieuKienThieu = and(
    eq(hoaDon.tenantId, tenantId),
    isNull(dongHangHoa.id),
    or(
      and(eq(hoaDon.chieu, "purchase"), eq(hoaDon.nmmst, opts.ownMst)),
      and(eq(hoaDon.chieu, "sold"), eq(hoaDon.nbmst, opts.ownMst)),
    ),
  );
  const joinThieu = and(eq(dongHangHoa.hoaDonId, hoaDon.id), eq(dongHangHoa.tenantId, tenantId));

  const demRows = await tx
    .select({ tong: sql<number>`count(*)::int` })
    .from(hoaDon)
    .leftJoin(dongHangHoa, joinThieu)
    .where(dieuKienThieu);
  const tongThieu = demRows[0]?.tong ?? 0;

  const rows = await tx
    .select({
      id: hoaDon.id,
      nbmst: hoaDon.nbmst,
      khhdon: hoaDon.khhdon,
      khmshdon: hoaDon.khmshdon,
      shdon: hoaDon.shdon,
      nguon: hoaDon.nguon,
    })
    .from(hoaDon)
    .leftJoin(dongHangHoa, joinThieu)
    .where(dieuKienThieu)
    .orderBy(desc(hoaDon.tdlap), desc(hoaDon.id))
    .limit(opts.limit);

  return {
    tongThieu,
    candidates: rows.map((r) => ({
      hoaDonId: r.id,
      ref: {
        nbmst: r.nbmst,
        khhdon: r.khhdon,
        khmshdon: r.khmshdon,
        shdon: r.shdon,
        source: r.nguon === "sco" ? ("sco" as const) : ("normal" as const),
      },
    })),
  };
}

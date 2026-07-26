// Task 4 (delta-sync) — quyết định vòng kiểm audit (`decideAudit`, thuần) + đếm DB theo
// nguồn (`demHoaDonTheoNguon`, đọc `hoa_don`). Task 6 dùng cả hai để chạy vòng lặp
// "kéo tiếp / dừng" khi đối chiếu count DB với `total` GDT trả về cho mỗi họ
// (normal/sco).
import { hoaDon } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import { and, count, eq, gte, lt } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// Db generic: cùng khuôn coverage.ts (mẫu @vat/query.listInvoices). PGlite trong test,
// pg/Hyperdrive khi chạy; `PgTransaction` (từ withTenant) cũng thỏa vì kế thừa.
type Db<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgDatabase<TQuery, TFull, TSchema>;

/** Trần số vòng kéo bổ sung (ngoài vòng chính) trước khi CHỊU DỪNG dù còn hụt — chống
 * kéo vô hạn khi `total` GDT dao động (±~4%, quan sát thực tế) không hội tụ về 0. */
export const TRAN_VONG_DELTA = 3;

/** Quan sát MỘT họ endpoint (normal/sco) tại một vòng audit: `total` GDT báo (null =
 * họ không áp dụng — vd sco 404 — hoặc GDT không trả total) đối chiếu `dbCount` hiện có. */
export interface FamilyObservation {
  family: "normal" | "sco";
  total: number | null;
  dbCount: number;
}

/** Quyết định của một vòng audit:
 * - "du": mọi họ áp dụng đã đủ (dbCount ≥ total) → không cần kéo gì thêm.
 * - "keo": còn (các) họ hụt, còn vòng để thử → kéo tiếp đúng các họ đó.
 * - "dung": chịu dừng dù còn hụt (chạm trần vòng, hoặc bão hòa — kéo thêm vô ích) —
 *   `hutConLai` là tổng số hóa đơn ước tính còn thiếu, để tầng gọi quyết định force. */
export type AuditDecision =
  | { kind: "du" }
  | { kind: "keo"; families: ("normal" | "sco")[] }
  | { kind: "dung"; hutConLai: number };

/**
 * Quyết định audit thuần (không I/O) — Task 6 gọi lại mỗi vòng của vòng lặp delta-sync.
 *
 * `vong`: số thứ tự vòng ĐÃ kéo trước đó (0 = lần đối chiếu đầu, chưa kéo delta nào).
 * `prevCount`: tổng dbCount của vòng NGAY TRƯỚC (chỉ có ý nghĩa khi `vong >= 1`) — dùng
 * để phát hiện BÃO HÒA: đã kéo ít nhất 1 vòng mà tổng count không tăng nghĩa là kéo
 * thêm không đưa thêm hóa đơn nào về (total GDT tự nó không ổn định ±4%, kéo mãi vô ích).
 *
 * Ghi chú tường minh: đếm theo TENANT (`hoa_don` không có `taikhoan_id`) — một tenant có
 * nhiều tài khoản thuế cùng MST chia sẻ chung hóa đơn nên `dbCount` có thể ≥ `total` của
 * MỘT tài khoản riêng lẻ. Thiên về phía "coi là đủ" là AN TOÀN ở đây: không kéo thừa;
 * force (kéo lại thủ công) vẫn là lối thoát nếu người dùng nghi thiếu.
 */
export function decideAudit(
  obs: FamilyObservation[],
  vong: number,
  prevCount?: number,
): AuditDecision {
  const thieu = obs.filter((o) => o.total !== null && o.dbCount < o.total);
  if (thieu.length === 0) return { kind: "du" };

  const hutConLai = thieu.reduce((s, o) => s + ((o.total as number) - o.dbCount), 0);
  const currentCount = obs.reduce((s, o) => s + o.dbCount, 0);

  if (vong >= TRAN_VONG_DELTA) return { kind: "dung", hutConLai };

  // Bão hòa: đã kéo ≥1 vòng mà tổng count không tăng so vòng trước — kéo nữa vô ích.
  if (vong >= 1 && prevCount !== undefined && currentCount <= prevCount) {
    return { kind: "dung", hutConLai };
  }

  return { kind: "keo", families: thieu.map((o) => o.family) };
}

/** Biên tháng THEO GIỜ VN quy về UTC — PHẢI khớp `dayBoundaryVn` của
 * `packages/query/src/filters.ts` (đường đọc đã kiểm chứng đúng giờ VN, xem chứng cứ
 * prod 2026-07-20 tại đó): UTC = mốc VN (00:00 đầu tháng / đầu tháng kế) trừ 7h, tương
 * đương dựng chuỗi ISO có hậu tố "+07:00". Đã ĐỐI CHIẾU trước khi viết hàm này
 * (task-4-report.md) — công thức khớp, không lệch. */
function vnMonthRangeUtc(period: string): { lo: Date; hi: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`period phải định dạng YYYY-MM: ${period}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  // Đầu tháng / đầu tháng kế theo giờ VN → khoảnh khắc UTC tương ứng, cùng công thức
  // với dayBoundaryVn (offset "+07:00" cho một mốc giờ VN).
  const lo = new Date(`${y}-${String(mo).padStart(2, "0")}-01T00:00:00.000+07:00`);
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const hi = new Date(`${nextY}-${String(nextMo).padStart(2, "0")}-01T00:00:00.000+07:00`);
  return { lo, hi };
}

/**
 * Đếm `hoa_don` trong DB theo (tenant, chiều, kỳ tháng VN), tách theo NGUỒN
 * (normal/sco) — đối chiếu với `total` GDT của `FamilyObservation` trong `decideAudit`.
 * Lọc `tenant_id` TƯỜNG MINH (multi-tenant.md, lớp 1) — gọi trong `withTenant` để RLS
 * chốt lớp 2.
 */
export async function demHoaDonTheoNguon<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  chieu: InvoiceDirection,
  period: string,
): Promise<{ normal: number; sco: number }> {
  const { lo, hi } = vnMonthRangeUtc(period);
  const rows = await db
    .select({ nguon: hoaDon.nguon, n: count() })
    .from(hoaDon)
    .where(
      and(
        eq(hoaDon.tenantId, tenantId),
        eq(hoaDon.chieu, chieu),
        gte(hoaDon.tdlap, lo),
        lt(hoaDon.tdlap, hi),
      ),
    )
    .groupBy(hoaDon.nguon);

  const out = { normal: 0, sco: 0 };
  for (const r of rows) {
    if (r.nguon === "normal") out.normal = Number(r.n);
    if (r.nguon === "sco") out.sco = Number(r.n);
  }
  return out;
}

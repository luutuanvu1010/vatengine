// ĐV3 — Persist dòng hàng của một hóa đơn (Pha 2 của đồng bộ) + factory lấy detail
// qua adapter. Tách khỏi sync.ts để tái dùng cho đường 2 pha nền (queue) về sau.
//
// Idempotent (Quyết định C, docs/GIAI-PHAP-thieu-truong-va-mtt.md): XÓA hết dòng theo
// `hoadon_id` rồi CHÈN lại từ mapDetailLines — luôn khớp nguồn, không cần khóa tự nhiên
// dòng. Lọc `tenant_id` TƯỜNG MINH (ngoài RLS) theo multi-tenant.md. Thuế suất giữ KÉP
// (ltsuat chuỗi + tsuat số), tiền dòng lưu chuỗi cho cột numeric (tránh sai số float).
// KHÔNG log giá trị dòng hàng (security.md).
import { dongHangHoa, hoaDon } from "@vat/db";
import {
  type InvoiceDetailRef,
  type InvoiceLine,
  type RetryOptions,
  getInvoiceDetail,
  mapDetailLines,
} from "@vat/gdt-client";
import type { GdtTransport } from "@vat/gdt-client";
import { and, eq } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

type NewDongHangHoa = typeof dongHangHoa.$inferInsert;

type Tx<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgTransaction<TQuery, TFull, TSchema>;

/** null/undefined → null; còn lại → chuỗi cho cột `numeric`/`text` (giữ nguyên biểu diễn). */
function strOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}

/** Ánh xạ một `InvoiceLine` (adapter U3) → giá trị chèn `dong_hang_hoa`, gắn tenant + hóa đơn. */
export function mapLineToDongHangHoa(
  line: InvoiceLine,
  tenantId: string,
  hoaDonId: string,
): NewDongHangHoa {
  return {
    hoaDonId,
    tenantId,
    stt: line.stt ?? null,
    ten: line.ten ?? null,
    dvtinh: line.dvtinh ?? null,
    sluong: strOrNull(line.sluong),
    dgia: strOrNull(line.dgia),
    thtien: strOrNull(line.thtien),
    ltsuat: strOrNull(line.ltsuat), // chuỗi hiển thị "8%"/"KCT"…
    tsuat: strOrNull(line.tsuat), // số thập phân 0.08
    tsuatTien: strOrNull(line.tthue), // tiền thuế dòng ≡ tthue của adapter
    rawJson: line.raw,
  };
}

/**
 * Lưu dòng hàng của MỘT hóa đơn theo cách idempotent: xóa hết dòng cũ theo
 * `hoadon_id` rồi chèn lại. PHẢI chạy trong transaction đã đặt ngữ cảnh tenant
 * (withTenant) để nguyên tử với upsert header + RLS chốt tenant.
 */
export async function persistInvoiceLines<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  tx: Tx<TQuery, TFull, TSchema>,
  tenantId: string,
  hoaDonId: string,
  lines: InvoiceLine[],
): Promise<void> {
  // U26 hardening (phòng thủ chiều sâu — multi-tenant.md): FK dong_hang_hoa.hoadon_id
  // KHÔNG kiểm tenant khớp, nên phải xác minh hóa đơn THUỘC tenant trước khi ghi —
  // chặn message/producer lỗi ghi dòng tenant A trỏ vào hóa đơn tenant B. Mọi producer
  // hiện tại đã resolve id tenant-scoped; kiểm tra này bắt lỗi cấu hình tương lai.
  const owned = await tx
    .select({ id: hoaDon.id })
    .from(hoaDon)
    .where(and(eq(hoaDon.id, hoaDonId), eq(hoaDon.tenantId, tenantId)));
  if (owned.length === 0) {
    throw new Error(`persistInvoiceLines: hoa_don ${hoaDonId} không thuộc tenant hiện tại.`);
  }
  // Xóa TƯỜNG MINH theo cả hoadon_id lẫn tenant_id (multi-tenant.md — không chỉ dựa RLS).
  await tx
    .delete(dongHangHoa)
    .where(and(eq(dongHangHoa.hoaDonId, hoaDonId), eq(dongHangHoa.tenantId, tenantId)));
  if (lines.length === 0) return;
  await tx
    .insert(dongHangHoa)
    .values(lines.map((l) => mapLineToDongHangHoa(l, tenantId, hoaDonId)));
}

/**
 * Factory `fetchDetail` mặc định (production): lấy chi tiết một hóa đơn qua adapter
 * (`getInvoiceDetail` + `mapDetailLines`) trên transport egress đã cấu hình. 401 →
 * ném GdtError SESSION_EXPIRED (adapter đảm bảo); lỗi tạm 5xx/timeout đã được adapter
 * retry backoff. KHÔNG tự đăng nhập, KHÔNG log token/giá trị hóa đơn (security.md).
 */
export function adapterFetchDetail(
  transport: GdtTransport,
  token: string,
  retry?: RetryOptions,
): (ref: InvoiceDetailRef) => Promise<InvoiceLine[]> {
  return (ref) => getInvoiceDetail(transport, token, ref, retry).then(mapDetailLines);
}

// U37a lát 3 — kho hồ sơ gốc: quy ước khóa R2 + các thao tác DB tenant-scoped trên
// `tep_hoa_don_goc`. Mọi hàm nhận `tx` đã vào `withTenant` (RLS là lớp phòng thủ thứ
// hai; lọc `tenant_id` tường minh vẫn là lớp thứ nhất — .claude/rules/multi-tenant.md).
import { tepHoaDonGoc } from "@vat/db";
import { and, eq } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

type AnyTx = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

/** Tiền tố kho hồ sơ gốc trong bucket NỘI BỘ `vat-raw` (KHÔNG phải bucket công khai). */
const TIEN_TO = "hoadon-goc";

/**
 * Khóa R2 của hai tệp thuộc riêng một hóa đơn. Gắn `tenantId` vào đường dẫn để không
 * thể ghi đè chéo tenant, và để soi/dọn theo tenant được.
 */
export function khoaHoSoGoc(tenantId: string, hoaDonId: string): { xml: string; html: string } {
  return {
    xml: `${TIEN_TO}/${tenantId}/${hoaDonId}.xml`,
    html: `${TIEN_TO}/${tenantId}/${hoaDonId}.html`,
  };
}

/**
 * Khóa của ba tệp tĩnh DÙNG CHUNG — cố ý nằm NGOÀI thư mục tenant: chúng giống hệt
 * nhau ở mọi hóa đơn của mọi tenant (jQuery + 2 ảnh nền của GDT) và không mang dữ liệu
 * của ai. Đặt trong thư mục tenant sẽ nhân bản ~275 KB cho mỗi hóa đơn, tức đúng thứ
 * việc khử trùng lặp muốn tránh (U37 §4.7: 10,5 GB → 1,4 GB).
 */
export const KHOA_TAI_NGUYEN_CHUNG: Record<string, string> = {
  "details.js": `${TIEN_TO}/_chung/details.js`,
  "viewinvoice-bg.jpg": `${TIEN_TO}/_chung/viewinvoice-bg.jpg`,
  "sign-check.jpg": `${TIEN_TO}/_chung/sign-check.jpg`,
};

/**
 * Hóa đơn này đã được xử lý chưa? TRẢ TRUE CẢ KHI trạng thái là `khong_co_ho_so_goc` —
 * đó cũng là câu trả lời cuối cùng của GDT, hỏi lại chỉ tốn request vô ích cho những
 * hóa đơn VĨNH VIỄN không có bản gốc.
 */
export async function daCoHoSoGoc(tx: AnyTx, tenantId: string, hoaDonId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: tepHoaDonGoc.id })
    .from(tepHoaDonGoc)
    .where(and(eq(tepHoaDonGoc.tenantId, tenantId), eq(tepHoaDonGoc.hoaDonId, hoaDonId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Ghi nhận đã tải thành công. Upsert theo `(tenant_id, hoa_don_id)` — Queue có thể
 * redeliver cùng message, chạy lại phải cập nhật chứ không vỡ unique.
 */
export async function luuTepHoaDonGoc(
  tx: AnyTx,
  tenantId: string,
  hoaDonId: string,
  kichThuoc: { soByteXml: number; soByteHtml: number },
): Promise<void> {
  const khoa = khoaHoSoGoc(tenantId, hoaDonId);
  const gia_tri = {
    tenantId,
    hoaDonId,
    khoaXml: khoa.xml,
    khoaHtml: khoa.html,
    kichThuocXml: kichThuoc.soByteXml,
    kichThuocHtml: kichThuoc.soByteHtml,
    trangThai: "da_tai",
    maLoi: null,
    taiLuc: new Date(),
  };
  await tx
    .insert(tepHoaDonGoc)
    .values(gia_tri)
    .onConflictDoUpdate({
      target: [tepHoaDonGoc.tenantId, tepHoaDonGoc.hoaDonId],
      set: gia_tri,
    });
}

/**
 * Ghi nhận GDT KHÔNG có hồ sơ gốc cho hóa đơn này. KHÔNG có tệp nào để trỏ tới, nên
 * mọi cột khóa/kích thước để `null` — đúng QĐ-3 "trường rỗng thì để trống, không bịa".
 */
export async function ghiNhanKhongCoHoSoGoc(
  tx: AnyTx,
  tenantId: string,
  hoaDonId: string,
  maLoi: string,
): Promise<void> {
  const gia_tri = {
    tenantId,
    hoaDonId,
    khoaXml: null,
    khoaHtml: null,
    kichThuocXml: null,
    kichThuocHtml: null,
    trangThai: "khong_co_ho_so_goc",
    maLoi,
    taiLuc: null,
  };
  await tx
    .insert(tepHoaDonGoc)
    .values(gia_tri)
    .onConflictDoUpdate({
      target: [tepHoaDonGoc.tenantId, tepHoaDonGoc.hoaDonId],
      set: gia_tri,
    });
}

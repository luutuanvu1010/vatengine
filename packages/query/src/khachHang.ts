// U37b — danh sách KHÁCH HÀNG của tenant, để chọn khi tải hóa đơn gốc.
//
// Nguồn: chính hóa đơn BÁN RA đã đồng bộ (KHÔNG gọi GDT). Mọi truy vấn lọc `tenant_id`
// tường minh (lớp 1) và chạy trong `withTenant` ở tầng gọi (RLS lớp 2).
//
// Vì sao chỉ lấy khách có ĐỦ MST + tên: luật U37b là "MST hoặc tên trống ⇒ chặn nút"
// (§8 mục 10). Thứ không chọn được thì không nên hiện ra danh sách — hiện rồi chặn là
// bẫy người dùng. Đo production 2026-07-29 (§4.8): 83% hóa đơn bán ra không có MST người
// mua (khách lẻ dùng CCCD), và vài MST cá nhân trên máy tính tiền được GDT trả tên `null`.
//
// Vì sao gộp theo MST chứ không theo tên: MST là định danh, tên chỉ để tìm. Đo thật cho
// thấy 165/169 MST chỉ có một cách viết tên, nhưng vẫn có MST viết hai kiểu — gộp theo
// tên sẽ tách một khách thành hai mục.
import { hoaDon } from "@vat/db";
import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

type AnyTx = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

/** Trần mặc định. Đo thật: tenant lớn nhất có 167 khách ⇒ 2.000 là thừa sức, và vẫn
 * chặn được ca bệnh lý (dữ liệu bẩn sinh hàng chục nghìn MST rác) làm vỡ trình duyệt. */
const GIOI_HAN_MAC_DINH = 2000;

export interface KhachHang {
  /** MST người mua — ĐỊNH DANH, thứ ràng vào bộ lọc khi người dùng chọn. */
  nmmst: string;
  /** Tên người mua của hóa đơn MỚI NHẤT — chỉ dùng để hiển thị và tìm kiếm. */
  nmten: string;
  /** Số hóa đơn bán ra cho khách này — giúp người dùng nhận ra khách quen. */
  soHoaDon: number;
}

export interface KhachHangResult {
  items: KhachHang[];
  /** true ⇒ danh sách đã bị cắt ở `gioiHan`. KHÔNG cắt im lặng (Hiến pháp: không giả
   * định vô căn cứ; tầng trên phải nói cho người dùng biết là còn nữa). */
  biCatBot: boolean;
}

export interface ListKhachHangOptions {
  gioiHan?: number;
}

/**
 * Liệt kê khách hàng (bên mua) từ hóa đơn bán ra của tenant, gộp theo MST.
 * Sắp theo TÊN để người dùng dò mắt được — danh sách này để chọn, không phải để xếp hạng.
 */
export async function listKhachHang(
  tx: AnyTx,
  tenantId: string,
  opts: ListKhachHangOptions = {},
): Promise<KhachHangResult> {
  const gioiHan = opts.gioiHan ?? GIOI_HAN_MAC_DINH;

  // Lấy dư MỘT hàng để biết có bị cắt hay không, thay vì chạy thêm một câu COUNT.
  const rows = await tx
    .select({
      nmmst: hoaDon.nmmst,
      // Tên của hóa đơn mới nhất trong nhóm: một MST có thể được viết vài kiểu tên,
      // lấy bản gần nhất là sát thực tế hiện tại của khách nhất.
      nmten: sql<string>`(array_agg(${hoaDon.nmten} ORDER BY ${desc(hoaDon.tdlap)}))[1]`,
      soHoaDon: sql<number>`count(*)::int`,
    })
    .from(hoaDon)
    .where(
      and(
        eq(hoaDon.tenantId, tenantId),
        eq(hoaDon.chieu, "sold"),
        isNotNull(hoaDon.nmmst),
        ne(hoaDon.nmmst, ""),
        isNotNull(hoaDon.nmten),
        ne(hoaDon.nmten, ""),
      ),
    )
    .groupBy(hoaDon.nmmst)
    .orderBy(asc(sql`(array_agg(${hoaDon.nmten} ORDER BY ${desc(hoaDon.tdlap)}))[1]`))
    .limit(gioiHan + 1);

  const biCatBot = rows.length > gioiHan;
  const items = (biCatBot ? rows.slice(0, gioiHan) : rows).map((r) => ({
    nmmst: r.nmmst as string,
    nmten: r.nmten,
    soHoaDon: r.soHoaDon,
  }));

  return { items, biCatBot };
}

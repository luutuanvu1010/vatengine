// NGUỒN SỰ THẬT DUY NHẤT của 3 phép tóm tắt dòng hàng (U29, tách từ listInvoices U23).
// Dùng chung bởi `listInvoices` (bảng danh sách, U6) và `iterateInvoices` (kết xuất, U7)
// để file xuất và bảng danh sách KHÔNG THỂ lệch số. Chép logic này ra nơi thứ hai là tạo
// nguồn sự thật thứ hai — đúng thứ Hiến pháp cấm.
//
// ⚠️ ĐIỀU KIỆN DÙNG: câu truy vấn ngoài phải `FROM hoa_don` và KHÔNG alias bảng.
// ⚠️ BẪY DRIZZLE: `${hoaDon.id}` trong sub-select render thành `"id"` TRẦN (không gắn
//    bảng) → tự khớp `d.id` của bảng trong sub-select, cho kết quả SAI ÂM THẦM. Vì vậy
//    tham chiếu bảng ngoài phải viết tường minh chuỗi `hoa_don.id`. Có test canh:
//    packages/export/test/integration/rows.test.ts "hai hóa đơn KHÔNG nhận nhầm...".
//
// Lọc `tenant_id` TƯỜNG MINH trong từng sub-select, cạnh RLS (multi-tenant.md).
import { dongHangHoa } from "@vat/db";
import { sql } from "drizzle-orm";

/** Tóm tắt dòng hàng của MỘT hóa đơn, dạng 3 sub-select scalar tương quan. */
export function lineSummarySelect(tenantId: string) {
  return {
    /** Tên hàng hóa dòng ĐẦU (stt nhỏ nhất); null khi hóa đơn chưa có dòng hàng. */
    tenHangDau: sql<string | null>`(select d.ten from ${dongHangHoa} d
      where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId}
      order by d.stt asc nulls last, d.id asc limit 1)`,
    soDongHang: sql<number>`(select count(*)::int from ${dongHangHoa} d
      where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId})`,
    /** Tổng `sluong` — numeric giữ CHUỖI (không ép float), giữ nguyên phần thập phân
     * (hóa đơn xăng dầu có số lượng lẻ tới 3 chữ số). null khi chưa có dòng hàng. */
    tongSoLuong: sql<string | null>`(select sum(d.sluong) from ${dongHangHoa} d
      where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId})`,
  };
}

/** Ba trường tóm tắt mà `lineSummarySelect` bổ sung vào một hàng hóa đơn. */
export interface LineSummary {
  tenHangDau: string | null;
  soDongHang: number;
  tongSoLuong: string | null;
}

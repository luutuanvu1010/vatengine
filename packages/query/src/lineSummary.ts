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
    /** TẤT CẢ mặt hàng của hóa đơn, theo thứ tự stt — mỗi mặt hàng kèm ĐÚNG số lượng và
     * đơn vị của chính nó (quyết định chủ dự án 2026-07-20).
     *
     * ⚠️ VÌ SAO LÀ MỘT CẤU TRÚC, KHÔNG PHẢI HAI MẢNG SONG SONG: trước đây tên đi bằng
     * `tenHangDau` còn số lượng đi bằng `tongSoLuong` (một con số TỔNG). Bảng hiện
     * "Xăng E10" cạnh 62.925 trong khi 62.925 là tổng của HAI mặt hàng ⇒ người đọc hiểu
     * sai rằng riêng xăng E10 có 62.925 lít. Gộp vào một hàng dữ liệu thì tên và số
     * lượng KHÔNG THỂ lệch nhau nữa — sai lệch bị chặn bởi cấu trúc, không phải kỷ luật.
     *
     * `json_agg` giữ nguyên `sluong` dạng CHUỖI (numeric không ép float). Dòng thiếu
     * `sluong` vẫn xuất hiện với `sluong: null` — không im lặng bỏ mặt hàng.
     * `coalesce(..., '[]')` để hóa đơn chưa có dòng hàng trả MẢNG RỖNG chứ không null. */
    hangHoa: sql<Array<{ ten: string | null; sluong: string | null; dvtinh: string | null }>>`
      coalesce((select json_agg(json_build_object('ten', d.ten, 'sluong', d.sluong::text, 'dvtinh', d.dvtinh)
        order by d.stt asc nulls last, d.id asc)
        from ${dongHangHoa} d
        where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId}), '[]'::json)`,
    soDongHang: sql<number>`(select count(*)::int from ${dongHangHoa} d
      where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId})`,
    /** Tổng `sluong` — numeric giữ CHUỖI (không ép float), giữ nguyên phần thập phân
     * (hóa đơn xăng dầu có số lượng lẻ tới 3 chữ số). null khi chưa có dòng hàng. */
    tongSoLuong: sql<string | null>`(select sum(d.sluong) from ${dongHangHoa} d
      where d.hoadon_id = hoa_don.id and d.tenant_id = ${tenantId})`,
  };
}

/** Một mặt hàng trên hóa đơn, dùng cho tóm tắt danh sách. Tên đi kèm ĐÚNG số lượng và
 * đơn vị của chính nó — xem lý do ở `hangHoa` trong lineSummarySelect. */
export interface HangHoaTomTat {
  ten: string | null;
  /** numeric → CHUỖI (không ép float); null khi dòng hàng không khai số lượng. */
  sluong: string | null;
  dvtinh: string | null;
}

/** Các trường tóm tắt mà `lineSummarySelect` bổ sung vào một hàng hóa đơn. */
export interface LineSummary {
  tenHangDau: string | null;
  /** Mọi mặt hàng kèm số lượng + đơn vị CỦA CHÍNH NÓ, theo thứ tự stt. Rỗng khi chưa
   * đồng bộ dòng hàng. Đi thành một cấu trúc để tên và số lượng không thể lệch nhau. */
  hangHoa: HangHoaTomTat[];
  soDongHang: number;
  tongSoLuong: string | null;
}

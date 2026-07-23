// Catalog cột cho FILE XUẤT PHẲNG (mỗi mặt hàng một dòng) — NGUỒN SỰ THẬT DUY NHẤT cho:
//   • thứ tự + nhãn + tập mặc định (server @vat/export dẫn xuất render-columns),
//   • bảng chọn ẩn/hiện cột ở client (apps/web đọc metadata này).
// Khai MỘT LẦN ở đây; sửa thứ tự/nhãn/mặc định chỉ ở chỗ này (một nơi, cả server + web hưởng).
//
// Khác `INVOICE_FIELDS` (chỉ trường cấp HÓA ĐƠN): catalog phẳng GỘP trường hóa đơn + trường
// DÒNG HÀNG (ten/sluong/dgia…) + 2 cột TÍNH (sttFile, tongSauThue) — nên đứng riêng.
// Thứ tự dưới đây = thứ tự cột trong file; lọc theo `macDinhHien` → 16 cột "kê khai đầy đủ".

/** Nhóm để bảng chọn cột gom lại (client). */
export type FlatExportNhom = "stt" | "hd" | "nguoi" | "dong" | "trangthai" | "hdTien";

/** Kiểu định dạng ô (encoder dùng): tien = phân tách nghìn + căn phải; ngay = chuỗi ngày;
 * num/ma = số căn phải (General); text = chữ căn trái. */
export type FlatExportKieu = "text" | "ngay" | "tien" | "num" | "ma";

export interface FlatExportCol {
  /** Khóa cột — khớp trường trên LineDetailRow (server) + gửi trong `cols` khi xuất. */
  key: string;
  /** Nhãn VN duy nhất (tiêu đề cột trong file). */
  nhan: string;
  nhom: FlatExportNhom;
  kieu: FlatExportKieu;
  /** Có nằm trong bộ MẶC ĐỊNH hiện không (16 cột kê khai đầy đủ). */
  macDinhHien: boolean;
}

// Thứ tự LOGIC đầy đủ (29 cột). 16 cột `macDinhHien:true` = bộ kê khai/đối chiếu; cột ẩn khi
// bật hiện chen đúng vị trí này. Nhãn tiền "(cả HĐ)" giữ nguyên để không cộng nhầm (một HĐ
// nhiều mặt hàng lặp dòng). ttxly/tthai xuất MÃ số (giữ quyết định U6).
export const FLAT_EXPORT_COLUMNS: readonly FlatExportCol[] = [
  { key: "sttFile", nhan: "STT", nhom: "stt", kieu: "num", macDinhHien: true },
  { key: "tdlap", nhan: "Ngày lập", nhom: "hd", kieu: "ngay", macDinhHien: true },
  { key: "ncnhat", nhan: "Ngày cập nhật", nhom: "hd", kieu: "ngay", macDinhHien: false },
  { key: "khmshdon", nhan: "Ký hiệu mẫu số", nhom: "hd", kieu: "text", macDinhHien: false },
  { key: "khhdon", nhan: "Ký hiệu HĐ", nhom: "hd", kieu: "text", macDinhHien: true },
  { key: "shdon", nhan: "Số HĐ", nhom: "hd", kieu: "text", macDinhHien: true },
  { key: "chieu", nhan: "Chiều", nhom: "hd", kieu: "text", macDinhHien: true },
  { key: "nguon", nhan: "Nguồn", nhom: "hd", kieu: "text", macDinhHien: false },
  { key: "nbten", nhan: "Người bán", nhom: "nguoi", kieu: "text", macDinhHien: true },
  { key: "nbmst", nhan: "MST người bán", nhom: "nguoi", kieu: "text", macDinhHien: true },
  { key: "nmten", nhan: "Người mua", nhom: "nguoi", kieu: "text", macDinhHien: true },
  { key: "nmmst", nhan: "MST người mua", nhom: "nguoi", kieu: "text", macDinhHien: true },
  { key: "sttDong", nhan: "STT dòng (HĐ)", nhom: "dong", kieu: "num", macDinhHien: false },
  { key: "ten", nhan: "Hàng hóa/dịch vụ", nhom: "dong", kieu: "text", macDinhHien: true },
  { key: "dvtinh", nhan: "ĐVT", nhom: "dong", kieu: "text", macDinhHien: false },
  { key: "sluong", nhan: "Số lượng", nhom: "dong", kieu: "num", macDinhHien: true },
  { key: "dgia", nhan: "Đơn giá", nhom: "dong", kieu: "tien", macDinhHien: true },
  { key: "thtien", nhan: "Thành tiền (trước thuế)", nhom: "dong", kieu: "tien", macDinhHien: true },
  { key: "ltsuat", nhan: "Mã thuế suất", nhom: "dong", kieu: "text", macDinhHien: false },
  { key: "tsuat", nhan: "Thuế suất", nhom: "dong", kieu: "num", macDinhHien: true },
  { key: "tsuatTien", nhan: "Tiền thuế", nhom: "dong", kieu: "tien", macDinhHien: true },
  {
    key: "tongSauThue",
    nhan: "Tổng tiền (sau thuế)",
    nhom: "dong",
    kieu: "tien",
    macDinhHien: true,
  },
  { key: "dvtte", nhan: "Tiền tệ", nhom: "hd", kieu: "text", macDinhHien: false },
  {
    key: "ttxly",
    nhan: "Trạng thái xử lý (mã)",
    nhom: "trangthai",
    kieu: "ma",
    macDinhHien: false,
  },
  { key: "tthai", nhan: "Trạng thái HĐ (mã)", nhom: "trangthai", kieu: "ma", macDinhHien: false },
  {
    key: "tgtcthue",
    nhan: "Tiền chưa thuế (cả HĐ)",
    nhom: "hdTien",
    kieu: "tien",
    macDinhHien: false,
  },
  { key: "ttcktmai", nhan: "Chiết khấu (cả HĐ)", nhom: "hdTien", kieu: "tien", macDinhHien: false },
  { key: "tgtthue", nhan: "Tiền thuế (cả HĐ)", nhom: "hdTien", kieu: "tien", macDinhHien: false },
  {
    key: "tgtttbso",
    nhan: "Tổng thanh toán (cả HĐ)",
    nhom: "hdTien",
    kieu: "tien",
    macDinhHien: false,
  },
];

/** Key hợp lệ (allowlist khi nhận `cols` từ client — chống input rác). */
export const FLAT_EXPORT_KEYS: ReadonlySet<string> = new Set(FLAT_EXPORT_COLUMNS.map((c) => c.key));

/** Bộ cột mặc định (16) — dùng khi client không gửi `cols`. */
export const FLAT_EXPORT_DEFAULT_KEYS: readonly string[] = FLAT_EXPORT_COLUMNS.filter(
  (c) => c.macDinhHien,
).map((c) => c.key);

/** Chuẩn hóa `cols` từ client → danh sách cột hợp lệ theo THỨ TỰ CATALOG. Rỗng/thiếu/không có
 * key hợp lệ nào → tập mặc định. Bỏ key lạ (an toàn). Không phụ thuộc thứ tự client gửi. */
export function chonCotXuat(cols?: readonly string[] | null): FlatExportCol[] {
  const chon = cols?.filter((k) => FLAT_EXPORT_KEYS.has(k));
  const co = chon && chon.length > 0 ? new Set(chon) : null;
  return FLAT_EXPORT_COLUMNS.filter((c) => (co ? co.has(c.key) : c.macDinhHien));
}

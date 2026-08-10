// Một nguồn cho dạng MST và phép chuẩn hóa — dùng chung cho cổng đăng ký và cổng đổi
// MST của admin, để hai cửa không trôi khỏi nhau.
//
// Dạng NHẬN VÀO (người dùng gõ): 10 số = doanh nghiệp/tổ chức; 10 số + "-" + 3 số =
// đơn vị phụ thuộc viết theo TT 105/2020/TT-BTC Điều 5 (vd 0305097236-005); 13 số liền =
// cùng mã đó bỏ gạch; 12 số = số định danh cá nhân (CCCD) dùng thay MST cho cá nhân &
// hộ kinh doanh theo TT 86/2024/TT-BTC (từ 01/07/2025).
export const MST_RE = /^\d{10}(-\d{3})?$|^\d{12}$|^\d{13}$/;

/**
 * Dạng LƯU TRỮ: toàn hệ thống vatengine dùng chuỗi thuần chữ số (username tài khoản thuế
 * tự gán = `tenants.mst`, so trùng UNIQUE, đối chiếu `nbmst` hóa đơn) — nên dạng có gạch
 * của đơn vị phụ thuộc được chuẩn hóa về 13 số liền trước khi ghi. Nhờ đó
 * "0305097236-005" và "0305097236005" là MỘT mã, không thành hai tenant trùng nhau.
 */
export function chuanHoaMst(mst: string): string {
  const m = mst.trim();
  return /^\d{10}-\d{3}$/.test(m) ? m.replace("-", "") : m;
}

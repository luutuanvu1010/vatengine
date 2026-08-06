// Dựng liên kết Zalo/WhatsApp từ số điện thoại VN — HÀM THUẦN (test được). Chuẩn hóa:
// bỏ mọi ký tự không phải chữ số; WhatsApp cần E.164 (số 0 đầu → mã quốc gia 84).

/** Chỉ giữ chữ số. */
function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** E.164 tiêu chuẩn: chữ số thuần + chuẩn hóa mã quốc gia.
 * Một quy tắc, một nguồn — nếu luật E.164 đổi, sửa ở đây thì cả WhatsApp và tel: cùng tuân thủ. */
function toE164Digits(phone: string): string {
  let d = digitsOnly(phone);
  if (d.startsWith("0")) d = `84${d.slice(1)}`;
  return d;
}

/** Zalo dùng số nội địa như người dùng nhập (đã bỏ khoảng trắng/ký tự thừa). */
export function zaloUrl(phone: string): string {
  return `https://zalo.me/${digitsOnly(phone)}`;
}

/** WhatsApp cần E.164 không dấu cộng: 0xxxxxxxxx → 84xxxxxxxxx. */
export function whatsappUrl(phone: string): string {
  return `https://wa.me/${toE164Digits(phone)}`;
}

/** `tel:` dạng E.164 — bấm gọi được cả khi máy đang ở mạng nước ngoài. Chuẩn hóa giống
 * `whatsappUrl`: 0xxxxxxxxx → 84xxxxxxxxx. */
export function telUrl(phone: string): string {
  return `tel:+${toE164Digits(phone)}`;
}

/** Số ĐỂ ĐỌC trên màn hình. Tách nhóm bằng hàm chứ không gõ tay chuỗi đã tách sẵn — chuỗi gõ
 * tay sẽ lệch khỏi số thật vào ngày số đổi, mà không test nào bắt được.
 * Đúng 10 chữ số → 4-3-3 (`0989 929 373`). Độ dài khác → trả nguyên dãy, không đoán. */
export function hienThiSoDienThoai(phone: string): string {
  const d = digitsOnly(phone);
  if (d.length !== 10) return d;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

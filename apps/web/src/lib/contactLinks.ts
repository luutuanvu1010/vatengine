// Dựng liên kết Zalo/WhatsApp từ số điện thoại VN — HÀM THUẦN (test được). Chuẩn hóa:
// bỏ mọi ký tự không phải chữ số; WhatsApp cần E.164 (số 0 đầu → mã quốc gia 84).

/** Chỉ giữ chữ số. */
function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Zalo dùng số nội địa như người dùng nhập (đã bỏ khoảng trắng/ký tự thừa). */
export function zaloUrl(phone: string): string {
  return `https://zalo.me/${digitsOnly(phone)}`;
}

/** WhatsApp cần E.164 không dấu cộng: 0xxxxxxxxx → 84xxxxxxxxx. */
export function whatsappUrl(phone: string): string {
  let d = digitsOnly(phone);
  if (d.startsWith("0")) d = `84${d.slice(1)}`;
  return `https://wa.me/${d}`;
}

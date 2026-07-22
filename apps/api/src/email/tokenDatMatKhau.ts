// Lát cắt 3 (QĐ-14) — Token đặt mật khẩu. Cùng khuôn mẫu token xác thực email (Lát cắt 1),
// khác đúng hai điểm: hạn 72 giờ, và đích là trang `/dat-mat-khau`.

/**
 * 72 giờ — DÀI HƠN token xác thực email (24h), có chủ ý.
 *
 * Hai lá thư ở hai thời điểm khác hẳn nhau về mức chú ý của khách. Thư xác thực tới NGAY
 * SAU khi họ vừa bấm "Đăng ký" — họ đang ngồi trước máy, chờ nó. Thư đặt mật khẩu tới khi
 * chủ dự án duyệt, có thể vài giờ hoặc vài ngày sau, và khách không biết trước lúc nào.
 * Bắt họ phản ứng trong 24h cho một lá thư họ không chờ là cách chắc chắn để tạo ra một
 * hàng người phải xin gửi lại.
 *
 * 72h cũng đúng bằng hạn của mật khẩu tạm mà nó thay thế (U18) — không nới lỏng gì so với
 * trạng thái trước, chỉ đổi thứ được gửi đi.
 */
export const HAN_GIO_DAT_MAT_KHAU = 72;

export function hanTokenDatMatKhau(bayGio: Date = new Date()): Date {
  return new Date(bayGio.getTime() + HAN_GIO_DAT_MAT_KHAU * 3600_000);
}

/**
 * Trỏ tới TRANG SPA, không trỏ thẳng vào API — cùng lý do đã ghi ở `lienKetXacThuc`.
 *
 * Ở đường này còn một lớp an toàn nữa mà đường xác thực không có: trang `/dat-mat-khau`
 * KHÔNG tự gọi API khi tải. Token chỉ bị tiêu khi khách gõ mật khẩu và bấm gửi. Nên kể cả
 * một máy quét biết chạy JavaScript cũng không tiêu được nó.
 */
export function lienKetDatMatKhau(urlNen: string, token: string): string {
  return `${urlNen.replace(/\/+$/, "")}/dat-mat-khau?token=${encodeURIComponent(token)}`;
}

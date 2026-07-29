// U37c — dựng nội dung chia sẻ một liên kết tải hóa đơn. HÀM THUẦN, test được.
//
// Tách khỏi component vì đây là chỗ dễ sai lặng lẽ: quên mã hóa thì dấu `&` trong tên
// doanh nghiệp cắt mất phần thân thư, và người dùng chỉ phát hiện khi khách đã nhận thư cụt.

export interface ThongTinChiaSe {
  url: string;
  /** Tên khách hàng nhận hóa đơn. Có thể trống — gói cũ chưa lưu tên. */
  nmten?: string | null;
  tuNgay?: string;
  denNgay?: string;
}

/** Tiêu đề dùng chung cho thư và khay chia sẻ của hệ điều hành. */
export function tieuDeChiaSe(t: ThongTinChiaSe): string {
  return t.nmten ? `Hóa đơn điện tử gửi ${t.nmten}` : "Hóa đơn điện tử";
}

/** Thân thư. Nói rõ thời hiệu để người nhận không để quá hạn rồi quay lại hỏi. */
export function noiDungChiaSe(t: ThongTinChiaSe): string {
  const ky = t.tuNgay && t.denNgay ? ` kỳ ${t.tuNgay} đến ${t.denNgay}` : "";
  return [
    `Kính gửi ${t.nmten ?? "Quý khách"},`,
    "",
    `Đường dẫn tải hóa đơn điện tử${ky}:`,
    t.url,
    "",
    "Đường dẫn có hiệu lực khoảng 1 tuần. Trân trọng.",
  ].join("\n");
}

/**
 * Liên kết `mailto:` mở sẵn thư soạn thảo.
 *
 * KHÔNG điền người nhận: hóa đơn không mang email người mua (đã kiểm schema `hoa_don`),
 * nên đoán địa chỉ là gửi nhầm. Người dùng tự điền — họ mới biết gửi cho ai.
 */
export function mailtoChiaSe(t: ThongTinChiaSe): string {
  const q = new URLSearchParams({ subject: tieuDeChiaSe(t), body: noiDungChiaSe(t) });
  // `URLSearchParams` mã hóa khoảng trắng thành `+`, nhưng `mailto:` đọc `+` là dấu cộng
  // literal ⇒ thân thư dính đầy dấu cộng. Phải đổi về `%20`.
  return `mailto:?${q.toString().replace(/\+/g, "%20")}`;
}

/** Trình duyệt có khay chia sẻ của hệ điều hành hay không (di động thường có, máy tính hiếm). */
export function coKhayChiaSe(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

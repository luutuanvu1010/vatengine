// Sinh mã VietQR (chuẩn EMVCo/NAPAS) phía client — HÀM THUẦN, offline, không phụ thuộc
// runtime ngân hàng. Đã kiểm chứng KHỚP thư viện tham chiếu `vietnam-qr-pay` cho
// Techcombank/4796099999 ở mọi mức (docs/plans/U16-plan.md §Kiểm chứng, 2026-07-15).
// Trường: 00 định dạng · 01 tĩnh(11)/động(12) · 38 thông tin thụ hưởng (GUID
// A000000727, bankBin, số TK, dịch vụ QRIBFTTA) · 53 tiền tệ 704(VND) · 54 số tiền ·
// 58 VN · 62.08 nội dung CK · 63 CRC16-CCITT.

/** Một khối TLV EMVCo: id(2) + độ dài(2) + giá trị. Giá trị ≤ 99 ký tự. */
function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`Trường VietQR ${id} vượt 99 ký tự`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, không reflect/xorout) — 4 hex hoa. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface VietQrInput {
  /** Mã ngân hàng NAPAS (BIN), vd Techcombank "970407". */
  bankBin: string;
  accountNumber: string;
  /**
   * Số tiền (đồng, số nguyên dương). Ưu tiên CHUỖI chữ số để giữ chính xác cho input
   * người dùng (quy tắc tiền: KHÔNG ép float). Bỏ trống/0/không hợp lệ/> 13 chữ số →
   * QR tĩnh (người chuyển tự nhập).
   */
  amount?: string | number | null;
  /** Nội dung chuyển khoản (không dấu, ≤ 99 ký tự). */
  addInfo?: string;
}

/**
 * Chuẩn hóa số tiền về CHUỖI chữ số bằng thao tác chuỗi (không Number/parseFloat cho
 * đầu vào chuỗi — quy tắc tiền). Trả "" nếu rỗng/không hợp lệ/≤ 0/> 13 chữ số (giới hạn
 * trường 54 theo NAPAS). Số âm hoặc không hữu hạn → "".
 */
export function normalizeAmount(amount?: string | number | null): string {
  if (amount == null) return "";
  let raw: string;
  if (typeof amount === "number") {
    if (!Number.isFinite(amount) || amount <= 0) return "";
    raw = String(Math.trunc(amount));
  } else {
    raw = amount;
  }
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 1 && digits.length <= 13 ? digits : "";
}

/** Dựng chuỗi VietQR hoàn chỉnh (đã kèm CRC) để đưa vào bộ tạo mã QR. */
export function buildVietQrPayload({
  bankBin,
  accountNumber,
  amount,
  addInfo,
}: VietQrInput): string {
  const beneficiary = tlv("00", bankBin) + tlv("01", accountNumber);
  const account = tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");
  const amt = normalizeAmount(amount);
  const body =
    tlv("00", "01") +
    tlv("01", amt ? "12" : "11") +
    tlv("38", account) +
    tlv("53", "704") +
    (amt ? tlv("54", amt) : "") +
    tlv("58", "VN") +
    (addInfo ? tlv("62", tlv("08", addInfo)) : "");
  const withTag = `${body}6304`;
  return withTag + crc16(withTag);
}

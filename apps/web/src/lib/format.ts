// Định dạng hiển thị — tiền & ngày. RÀNG BUỘC CỨNG (07-DESIGN_TOKENS §1, BINDING_MAP
// §4.2): tiền là CHUỖI numeric có thể >2^53 → phân nhóm bằng thao tác chuỗi/BigInt,
// TUYỆT ĐỐI không Number()/parseFloat (mất chính xác = lỗi nghiêm trọng). Ngày là thời
// khắc UTC → đổi sang giờ VN (UTC+7), không lệch ngày.

/** Chèn dấu chấm phân nhóm nghìn cho một chuỗi CHỮ SỐ (không dấu, không thập phân). */
function groupThousands(digits: string): string {
  // Chèn từ phải sang, mỗi 3 chữ số. Thao tác chuỗi thuần — không ép số.
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits.charAt(i);
  }
  return out;
}

/**
 * Tiền đầy đủ: "1230000000" → "1.230.000.000". Phần thập phân bỏ số 0 đuôi, dùng dấu
 * phẩy: "1234.50" → "1.234,5". `null`/rỗng → "" (không giá trị giả).
 */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const neg = value.startsWith("-");
  const unsigned = neg ? value.slice(1) : value;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw || "0";
  const grouped = groupThousands(intPart);
  const frac = fracPartRaw.replace(/0+$/, "");
  const body = frac ? `${grouped},${frac}` : grouped;
  return neg ? `-${body}` : body;
}

/** Bỏ số 0 đuôi của phần thập phân 2 chữ số (BigInt scaling). "10"→"1", "00"→"". */
function trimFrac(frac: string): string {
  return frac.replace(/0+$/, "");
}

/**
 * Tiền rút gọn để quét nhanh (Dashboard): "389100000" → "389,1 tr"; "2080000000" →
 * "2,08 tỷ". Dùng BigInt (không float). Cắt cụt về 2 chữ số thập phân — KHÔNG làm quá
 * giá trị; giá trị đầy đủ luôn xem được ở bảng. Dưới 1 triệu → hiển thị đầy đủ.
 */
export function formatMoneyShort(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const neg = value.startsWith("-");
  const unsigned = neg ? value.slice(1) : value;
  const intDigits = unsigned.split(".")[0]?.replace(/^0+(?=\d)/, "") ?? "0";
  if (!/^\d+$/.test(intDigits)) return "";
  const v = BigInt(intDigits);
  const sign = neg ? "-" : "";

  const unit = (exp: number, suffix: string): string => {
    const u = 10n ** BigInt(exp);
    const scaled = (v * 100n) / u; // whole*100 + 2 chữ số thập phân (cắt cụt)
    const whole = scaled / 100n;
    const frac = trimFrac((scaled % 100n).toString().padStart(2, "0"));
    const wholeStr = groupThousands(whole.toString());
    return `${sign}${frac ? `${wholeStr},${frac}` : wholeStr} ${suffix}`;
  };

  if (v >= 1_000_000_000n) return unit(9, "tỷ");
  if (v >= 1_000_000n) return unit(6, "tr");
  return formatMoney(value);
}

/** Đệm 2 chữ số. */
function p2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Thời khắc UTC → chuỗi ngày giờ VN (UTC+7). "2026-04-02T17:00:00Z" → "03/04/2026"
 * (không lệch ngày). `withTime` → thêm "HH:mm". null/không hợp lệ → "".
 */
export function formatDateVN(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Cộng 7 giờ rồi đọc theo UTC → lịch VN (tránh phụ thuộc múi giờ máy chạy).
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const date = `${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
  if (!withTime) return date;
  return `${date} ${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())}`;
}

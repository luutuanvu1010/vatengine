// Nhãn trạng thái ttxly/tthai — U15 SỞ HỮU bảng nhãn này (columns.ts:2-3, U15-plan §4B).
// NGUYÊN TẮC BẰNG CHỨNG: chỉ gán nhãn cho mã ĐÃ KIỂM CHỨNG. Đồng bộ kỷ luật với
// @vat/reconcile statusCodes.ts (map production RỖNG có chủ đích). Mã chưa probe →
// "số (chưa rõ)", KHÔNG đoán nhãn. Khi có probe thật (đơn vị đối chiếu), điền cả 2 nơi.

export interface StatusLabel {
  text: string;
  /** true CHỈ khi mã đã kiểm chứng bằng bằng chứng tái lập được. */
  verified: boolean;
}

// Mã tthai đã quan sát từ dữ liệu GDT thật (ADR-0001 dòng 45): chỉ `1` = trạng thái gốc.
const TTHAI_VERIFIED: Record<number, string> = {
  1: "Gốc",
};

// ttxly: CHƯA có mã nào kiểm chứng → không nhãn nào verified.
const TTXLY_VERIFIED: Record<number, string> = {};

function mapCode(code: number | null | undefined, table: Record<number, string>): StatusLabel {
  if (code === null || code === undefined) return { text: "—", verified: false };
  const label = table[code];
  if (label !== undefined) return { text: label, verified: true };
  return { text: `${code} (chưa rõ)`, verified: false };
}

/** Nhãn trạng thái hóa đơn (`tthai`). */
export function labelTthai(code: number | null | undefined): StatusLabel {
  return mapCode(code, TTHAI_VERIFIED);
}

/** Nhãn trạng thái xử lý (`ttxly`). */
export function labelTtxly(code: number | null | undefined): StatusLabel {
  return mapCode(code, TTXLY_VERIFIED);
}

/** Enum chiều — cố định (BINDING_MAP §4.2). */
export function labelChieu(chieu: string): string {
  if (chieu === "purchase") return "Mua vào";
  if (chieu === "sold") return "Bán ra";
  return chieu;
}

/** Enum nguồn — cố định (BINDING_MAP §4.2). */
export function labelNguon(nguon: string): string {
  if (nguon === "normal") return "HĐĐT thường";
  if (nguon === "sco") return "Máy tính tiền";
  return nguon;
}

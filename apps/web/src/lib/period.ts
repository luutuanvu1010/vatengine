// Quy các nút kỳ nhanh (Tháng/Quý/Năm) ra khoảng `tuNgay`/`denNgay` (YYYY-MM-DD) theo
// LỊCH VN (UTC+7) — khớp bộ lọc chuẩn backend (filters.ts). Hàm thuần, nhận ngày tham
// chiếu để test xác định (không Date.now bên trong).

export interface DateRange {
  tuNgay: string;
  denNgay: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Lấy năm/tháng/ngày theo lịch VN từ một thời khắc UTC. */
function vnParts(d: Date): { y: number; m: number } {
  const v = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1 };
}

/** Số ngày cuối tháng (m: 1-based). Date.UTC(y, m, 0) = ngày cuối tháng m. */
function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function monthRange(ref: Date): DateRange {
  const { y, m } = vnParts(ref);
  return { tuNgay: ymd(y, m, 1), denNgay: ymd(y, m, lastDay(y, m)) };
}

export function quarterRange(ref: Date): DateRange {
  const { y, m } = vnParts(ref);
  const startM = Math.floor((m - 1) / 3) * 3 + 1;
  const endM = startM + 2;
  return { tuNgay: ymd(y, startM, 1), denNgay: ymd(y, endM, lastDay(y, endM)) };
}

export function yearRange(ref: Date): DateRange {
  const { y } = vnParts(ref);
  return { tuNgay: ymd(y, 1, 1), denNgay: ymd(y, 12, 31) };
}

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

// ------------------------- Kỳ TƯỜNG MINH (U-K3) ------------------------- //
// Người dùng chọn kỳ CỤ THỂ (kể cả quá khứ), không chỉ "kỳ chứa hôm nay". Đây là hiện thực
// DUY NHẤT; các hàm nhận `ref` bên dưới chỉ suy ra (y, m) rồi gọi lại — không nhân đôi.
// Kỳ phi lý (tháng 0/13, quý 5) ném thay vì cuộn âm thầm: lọc sai kỳ mà không báo còn tệ
// hơn báo lỗi (cùng kỷ luật fail-loud với `dayBoundaryVn` phía server).

export function monthRangeOf(y: number, m: number): DateRange {
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Tháng không hợp lệ: ${m} (phải 1–12)`);
  }
  return { tuNgay: ymd(y, m, 1), denNgay: ymd(y, m, lastDay(y, m)) };
}

export function quarterRangeOf(y: number, q: number): DateRange {
  if (!Number.isInteger(q) || q < 1 || q > 4) {
    throw new Error(`Quý không hợp lệ: ${q} (phải 1–4)`);
  }
  const startM = (q - 1) * 3 + 1;
  const endM = startM + 2;
  return { tuNgay: ymd(y, startM, 1), denNgay: ymd(y, endM, lastDay(y, endM)) };
}

export function yearRangeOf(y: number): DateRange {
  return { tuNgay: ymd(y, 1, 1), denNgay: ymd(y, 12, 31) };
}

/** Quý (1–4) chứa tháng m (1–12). */
export function quarterOfMonth(m: number): number {
  return Math.floor((m - 1) / 3) + 1;
}

// ------------------------- Kỳ chứa một thời khắc ------------------------- //

export function monthRange(ref: Date): DateRange {
  const { y, m } = vnParts(ref);
  return monthRangeOf(y, m);
}

export function quarterRange(ref: Date): DateRange {
  const { y, m } = vnParts(ref);
  return quarterRangeOf(y, quarterOfMonth(m));
}

export function yearRange(ref: Date): DateRange {
  const { y } = vnParts(ref);
  return yearRangeOf(y);
}

/** Năm/tháng theo lịch VN của một thời khắc — dùng để đặt giá trị mặc định cho bộ chọn kỳ. */
export function vnYearMonth(ref: Date): { y: number; m: number } {
  return vnParts(ref);
}

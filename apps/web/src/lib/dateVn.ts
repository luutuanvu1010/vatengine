// Đổi chiều ISO (YYYY-MM-DD — hợp đồng API/filters.ts) ↔ dd/mm/yyyy (hiển thị chuẩn VN).
// Sự cố 2026-07-30: input type="date" gốc hiển thị theo LOCALE HỆ ĐIỀU HÀNH — máy này
// 01/07/2026, máy khác 07/01/2026 — không trang web nào ép đồng nhất được; nên hiển thị
// tự quy về dd/mm/yyyy ở đây. Hai hàm THUẦN trên chuỗi, KHÔNG qua `new Date(chuỗi)`
// (parse chuỗi của Date cũng lệch theo engine/locale — đúng cái bẫy đang sửa).

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Ngày có thật trên lịch? (30/02, tháng 13… → false; xử lý cả năm nhuận) */
function laNgayThuc(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const cuoiThang = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= cuoiThang;
}

/** "2026-07-01" → "01/07/2026". Không phải ISO hợp lệ → "" (không đoán). */
export function isoToDmy(iso: string | undefined): string {
  const m = iso ? ISO_RE.exec(iso) : null;
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Lưới lịch tháng cho bộ chọn ngày: mảng tuần, mỗi tuần 7 ô Thứ Hai → Chủ Nhật (quy ước
 * lịch VN), ô ngoài tháng là null. Số học lịch qua Date.UTC — không parse chuỗi, không locale.
 */
export function luoiThang(y: number, m: number): (number | null)[][] {
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Tháng không hợp lệ: ${m} (phải 1–12)`);
  }
  const soNgay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay: 0=CN..6=T7 → quy về 0=T2..6=CN
  const thuNgayDau = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const o: (number | null)[] = [
    ...Array.from({ length: thuNgayDau }, () => null),
    ...Array.from({ length: soNgay }, (_, i) => i + 1),
  ];
  while (o.length % 7 !== 0) o.push(null);
  const tuan: (number | null)[][] = [];
  for (let i = 0; i < o.length; i += 7) tuan.push(o.slice(i, i + 7));
  return tuan;
}

/** "01/07/2026" (chấp nhận d/m/yyyy) → "2026-07-01". Sai định dạng/ngày phi thực tế → null. */
export function dmyToIso(dmy: string): string | null {
  const m = DMY_RE.exec(dmy.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const th = Number(m[2]);
  const y = Number(m[3]);
  if (!laNgayThuc(y, th, d)) return null;
  return `${y}-${pad(th)}-${pad(d)}`;
}

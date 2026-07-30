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

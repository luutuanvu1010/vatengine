// Trạng thái hóa đơn (`tthai`) — NGUỒN SỰ THẬT DUY NHẤT cho nhãn và cho quy tắc "hóa đơn
// nào được cộng vào tổng TIỀN". Web (`statusLabels.ts`, chip), file kết xuất (`@vat/export`)
// và tầng tổng hợp (`@vat/query`) đều dẫn xuất từ đây — cấm khai lại logic ở nơi thứ hai
// (`ui.md`, "Nhãn một nguồn").
//
// NGUỒN BẰNG CHỨNG: docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md
// Mã 1–5 ĐÃ KIỂM CHỨNG trên 33.929 hóa đơn thật của 3 tenant, ghép cặp gốc↔mới qua
// `shdgoc` trong `raw_json`: 2↔4 (17 cặp), 3↔5 (3 cặp), đối xứng kín, 0 ngoại lệ (§3.1).
//
// GIỚI HẠN — KHÔNG được suy đoán thêm (§5.1, §4, §8.2):
//   - Mã "HỦY" pháp lý CHƯA từng xuất hiện ⇒ không thêm mã nào vào bảng nhãn/danh sách loại.
//   - Ý nghĩa `ttxly` CHƯA kiểm chứng ⇒ không có bảng nhãn `ttxly` ở đây.
//   - Nhãn tiếng Việt suy từ cấu trúc dữ liệu, chưa đối chiếu văn bản pháp quy (§5.4).

/** Nhãn `tthai` ĐÃ KIỂM CHỨNG (20 cặp hóa đơn thật, 0 ngoại lệ). */
export const TTHAI_NHAN: Readonly<Record<number, string>> = {
  1: "Gốc",
  2: "Thay thế",
  3: "Điều chỉnh",
  4: "Bị thay thế",
  5: "Bị điều chỉnh",
};

/** Tên gọi cho từng mã đã kiểm chứng — để tầng truy vấn/giao diện không rải số 2/3/5 trần
 * khắp nơi (mỗi chỗ như vậy là một nguồn sự thật nữa về ý nghĩa mã). Giá trị bị khóa vào
 * `TTHAI_NHAN`/`TTHAI_LOAI_KHOI_TONG` bằng test, không thể lệch nhau âm thầm. */
export const TTHAI = {
  GOC: 1,
  THAY_THE: 2,
  DIEU_CHINH: 3,
  BI_THAY_THE: 4,
  BI_DIEU_CHINH: 5,
} as const;

/** Tập mã ĐÃ KIỂM CHỨNG — dẫn xuất từ bảng nhãn, không khai tay lần hai.
 * Mã ngoài tập này là "chưa xác định" (QĐ-6): vẫn cộng vào tổng, nhưng phải cảnh báo. */
export const TTHAI_DA_KIEM_CHUNG: readonly number[] = Object.keys(TTHAI_NHAN)
  .map(Number)
  .sort((a, b) => a - b);

/** Mã `tthai` bị LOẠI khỏi mọi phép cộng TIỀN.
 *
 * CHỈ mã 4 (QĐ-4): hóa đơn bị thay thế đã mất hiệu lực, bản thay thế gánh toàn bộ giá trị.
 * Mã 5 (bị điều chỉnh) PHẢI GIỮ — bản gốc vẫn còn hiệu lực, hóa đơn điều chỉnh chỉ ghi
 * phần tăng/giảm; loại nhầm sẽ làm sai sổ theo chiều ngược lại (biên bản §7). */
export const TTHAI_LOAI_KHOI_TONG: readonly number[] = [4];

/** Chuỗi nhãn trạng thái — MỘT NGUỒN cho cả web lẫn file xuất.
 * `null`/`undefined` → chuỗi rỗng (06-BINDING_MAP: "null → trống").
 * Mã ngoài tập đã kiểm chứng → `"<mã> (chưa rõ)"`, KHÔNG đoán nhãn. */
export function nhanTthai(code: number | null | undefined): string {
  if (code == null) return "";
  return TTHAI_NHAN[code] ?? `${code} (chưa rõ)`;
}

/** Mã đã có bằng chứng chưa — quyết định `verified` (và màu chip) ở tầng trình bày. */
export function daKiemChungTthai(code: number | null | undefined): boolean {
  return code != null && code in TTHAI_NHAN;
}

/** Hóa đơn có được cộng TIỀN vào tổng không.
 * `null` và mã lạ → `true`: không tự ý loại thứ chưa hiểu (QĐ-6). */
export function tinhVaoTong(tthai: number | null | undefined): boolean {
  return tthai == null || !TTHAI_LOAI_KHOI_TONG.includes(tthai);
}

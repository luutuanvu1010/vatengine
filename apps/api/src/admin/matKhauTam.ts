// U18 §6 — Sinh mật khẩu TẠM cho tài khoản khách sau khi super-admin duyệt / reset.
//
// Chủ dự án chốt 6 CHỮ SỐ (2026-07-15) để khách dễ đọc qua điện thoại. Đó là 10^6 = một
// triệu khả năng — nhỏ. Thiết kế chấp nhận điều này và bù bằng BA ràng buộc, cả ba đều
// bắt buộc, thiếu một là hỏng cả lập luận (U18-plan §103):
//   1. HẾT HẠN 72h — `hanMatKhauTam` ở dưới; login kiểm `mat_khau_tam_het_han`.
//   2. BUỘC ĐỔI ở lần đăng nhập đầu — cờ `phai_doi_mat_khau`, gỡ ở POST /auth/doi-mat-khau.
//   3. RATE-LIMIT login — tái dùng LOGIN_LIMITER (DO khoá per-account, H-A.5b) đã có sẵn;
//      không dựng limiter thứ hai.
//
// QĐ-1 (2026-07-21): mật khẩu này KHÔNG gửi qua email (hạ tầng email thuộc U24). Nó được
// trả về đúng MỘT LẦN trong phản hồi của thao tác duyệt/reset, qua HTTPS, sau
// requireSuperAdmin. Không log, không ghi giá trị vào audit.

export const MAT_KHAU_TAM_SO_CHU_SO = 6;
export const MAT_KHAU_TAM_HAN_GIO = 72;

const KHOANG = 10 ** MAT_KHAU_TAM_SO_CHU_SO; // 1_000_000
// Ngưỡng loại bỏ để KHỬ LỆCH MODULO: 2^32 không chia hết cho 10^6, nên `uint32 % 10^6`
// trần trụi làm các giá trị đầu dải xuất hiện nhỉnh hơn. Cắt phần dư ở đuôi rồi lấy mẫu
// lại thì phân phối đều tuyệt đối. Xác suất phải lấy lại < 0,02% nên vòng lặp thực tế
// chạy đúng một lượt.
const TRAN = Math.floor(0x1_0000_0000 / KHOANG) * KHOANG;

/**
 * Sinh mật khẩu tạm 6 chữ số từ nguồn ngẫu nhiên MẬT MÃ.
 *
 * `crypto.getRandomValues`, KHÔNG `Math.random`: Math.random dùng PRNG không mật mã, đoán
 * được giá trị kế tiếp từ vài mẫu quan sát. Với chỉ 6 chữ số entropy, dùng nhầm nguồn là
 * mất nốt phần an toàn ít ỏi còn lại.
 *
 * `padStart` giữ số 0 dẫn đầu — thiếu nó, giá trị như 42 thành mật khẩu "42" (2 ký tự) vừa
 * sai đặc tả vừa co không gian tìm kiếm lại nhỏ hơn nữa.
 */
export function sinhMatKhauTam(): string {
  const buf = new Uint32Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0] as number;
  } while (v >= TRAN);
  return String(v % KHOANG).padStart(MAT_KHAU_TAM_SO_CHU_SO, "0");
}

/** Mốc hết hạn của mật khẩu tạm. Quá hạn thì login TỪ CHỐI dù gõ đúng — khách phải xin
 * super-admin cấp lại (POST /admin/tenants/:id/reset-mat-khau). */
export function hanMatKhauTam(bayGio: Date = new Date()): Date {
  return new Date(bayGio.getTime() + MAT_KHAU_TAM_HAN_GIO * 3600_000);
}

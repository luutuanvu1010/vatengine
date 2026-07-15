// Cấu hình đóng góp — tài khoản nhận ủng hộ. Thông tin công khai (chủ dự án tự nguyện
// đăng để nhận đóng góp; KHÔNG phải bí mật hệ thống). BIN Techcombank "970407" xác nhận
// từ api.vietqr.io/v2/banks (2026-07-15).
export const BANK_NAME = "Techcombank";
export const BANK_BIN = "970407";
export const ACCOUNT_NUMBER = "4796099999";
export const ACCOUNT_NAME = "LƯU TUẤN VŨ";

/** Nội dung chuyển khoản mặc định (không dấu để tương thích mọi app ngân hàng). */
export const DONATION_ADD_INFO = "Ung ho VATEngine";

/** Mức gợi ý (đồng). Nút "Số khác" cho phép nhập tùy ý. */
export const DONATION_TIERS = [10000, 50000, 100000, 500000] as const;

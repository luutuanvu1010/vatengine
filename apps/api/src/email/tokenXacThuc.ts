// U34c — Token xác thực email: hạn và cách dựng liên kết.
//
// Phần sinh/băm token đã chuyển sang `email/token.ts` ở Lát cắt 3 — chúng generic, và
// đường đặt mật khẩu không nên phải import từ một module mang tên "xác thực".

/** 24 giờ. Đủ dài cho người bận, đủ ngắn để một hộp thư bị chiếm sau đó không dùng lại được. */
export const HAN_GIO = 24;

export function hanToken(bayGio: Date = new Date()): Date {
  return new Date(bayGio.getTime() + HAN_GIO * 3600_000);
}

/**
 * Liên kết trong thư trỏ tới TRANG của SPA, không trỏ thẳng vào API.
 *
 * ⚠️ Đây là cùng bài học với QĐ-12, ở một chỗ khác. Nếu liên kết là `GET /api/xac-thuc?
 * token=…` thì máy quét thư, phần mềm diệt virus và bộ lọc doanh nghiệp sẽ TỰ ĐỘNG FETCH
 * nó — token bị tiêu trước khi khách kịp bấm, và khách nhận thông báo "liên kết đã được
 * dùng" cho một lá thư họ vừa mở lần đầu.
 *
 * Trỏ vào trang SPA thì việc tải trước là vô hại (chỉ là một trang tĩnh); token chỉ bị
 * tiêu khi JavaScript trên trang đó gửi `POST`, mà máy quét thì không chạy JavaScript.
 */
export function lienKetXacThuc(urlNen: string, token: string): string {
  return `${urlNen.replace(/\/+$/, "")}/xac-thuc-email?token=${encodeURIComponent(token)}`;
}

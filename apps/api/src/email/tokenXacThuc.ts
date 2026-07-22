// U34c — Token xác thực email. Sinh, băm, và dựng liên kết.
//
// ── VÌ SAO BĂM BẰNG SHA-256 CHỨ KHÔNG PHẢI PBKDF2 ────────────────────────────────────
// `password.ts` dùng PBKDF2 100.000 vòng vì mật khẩu do NGƯỜI đặt: entropy thấp, đoán được,
// nên phải làm mỗi lần thử đắt lên. Token ở đây là 32 byte NGẪU NHIÊN từ `getRandomValues`
// — 256 bit entropy, không có từ điển nào dò nổi. Băm chậm ở đây chỉ làm chậm chính ta mà
// không thêm một chút an toàn nào. SHA-256 là đúng công cụ.
//
// Vẫn PHẢI băm (không lưu token thô): rò cơ sở dữ liệu không được biến thành rò quyền —
// token này chuyển được trạng thái tenant.

/** 32 byte = 256 bit. Dư sức, và vẫn đủ ngắn để nằm gọn trong một URL. */
const SO_BYTE = 32;

/** 24 giờ. Đủ dài cho người bận, đủ ngắn để một hộp thư bị chiếm sau đó không dùng lại được. */
export const HAN_GIO = 24;

/** Sinh token thô. CHỈ giá trị này đi vào thư; cơ sở dữ liệu chỉ giữ bản băm. */
export function sinhToken(): string {
  const b = new Uint8Array(SO_BYTE);
  crypto.getRandomValues(b);
  // base64url: an toàn trong URL, không cần mã hoá thêm — tránh cả lớp lỗi "token hỏng vì
  // ký tự `+` bị đổi thành khoảng trắng khi qua query string".
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function bamToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

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

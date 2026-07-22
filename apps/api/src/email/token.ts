// Sinh và băm token dùng-một-lần. GENERIC — dùng chung cho mọi đường thư có token
// (xác thực email 24h ở Lát cắt 1, đặt mật khẩu 72h ở Lát cắt 3).
//
// ── VÌ SAO BĂM BẰNG SHA-256 CHỨ KHÔNG PHẢI PBKDF2 ────────────────────────────────────
// `password.ts` dùng PBKDF2 100.000 vòng vì mật khẩu do NGƯỜI đặt: entropy thấp, đoán
// được, nên phải làm mỗi lần thử đắt lên. Token ở đây là 32 byte NGẪU NHIÊN từ
// `getRandomValues` — 256 bit entropy, không có từ điển nào dò nổi. Băm chậm ở đây chỉ
// làm chậm chính ta mà không thêm một chút an toàn nào. SHA-256 là đúng công cụ.
//
// Vẫn PHẢI băm (không lưu token thô): rò cơ sở dữ liệu không được biến thành rò quyền —
// các token này chuyển được trạng thái tenant và đặt được mật khẩu.

/** 32 byte = 256 bit. Dư sức, và vẫn đủ ngắn để nằm gọn trong một URL. */
const SO_BYTE = 32;

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

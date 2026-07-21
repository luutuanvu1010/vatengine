// U18 — Miền token SUPER-ADMIN. Tách khỏi miền token khách (auth.ts) ở TẦNG MẬT MÃ.
//
// Ba lớp, theo thứ tự sức mạnh giảm dần:
//   1. SECRET RIÊNG (`ADMIN_JWT_SECRET` ≠ `JWT_SECRET`) — lớp chính. Token khách không
//      verify được ở đây vì kẻ giữ nó không có khoá ký của miền admin, và ngược lại.
//   2. `kiemTraCauHinhAdmin` — từ chối phục vụ (503) nếu hai secret trùng nhau hoặc thiếu.
//      Lớp 1 chỉ vững khi tiền đề "hai secret khác nhau" đúng; đây là chỗ ép tiền đề đó
//      thay vì cầu mong người vận hành không copy-paste nhầm lúc `wrangler secret put`.
//   3. `aud: "admin"` — lớp cuối, chỉ còn ý nghĩa nếu cả hai lớp trên đã hỏng.
//
// Vì sao KHÔNG thêm `vai_tro='super_admin'` vào token khách cho gọn: xem quanTriHeThong.ts
// — super-admin đứng ngoài trục tenant nên không biểu diễn được bằng một hàng nguoi_dung,
// và gộp hai miền lại thì một bug ở đường khách thành lỗ rò quyền quản trị toàn hệ thống.
import { sign } from "hono/jwt";

/** Vòng đời token admin (giây). NGẮN hơn token khách (8h) có chủ ý: token này đi kèm
 * quyền đọc/ghi xuyên-tenant nên cửa sổ rủi ro khi rò phải hẹp hơn. */
export const ADMIN_TOKEN_TTL_SEC = 2 * 60 * 60;

/** Claim `aud` phân biệt miền. Token khách KHÔNG có claim này (auth.ts signToken). */
export const ADMIN_AUD = "admin";

/** Cookie phiên Cổng Admin. TÊN KHÁC cookie khách (`vat_session`) — hai phiên tồn tại
 * song song trên cùng trình duyệt mà không đè nhau, và "đăng xuất admin" không đá văng
 * phiên khách. U19 dựng `apps/admin` trên subdomain riêng nên hai cookie cũng khác host. */
export const ADMIN_SESSION_COOKIE = "vat_admin_session";

export type CauHinhAdmin =
  | { ok: true; secret: string }
  | { ok: false; lyDo: "thieu_secret" | "trung_secret_khach" };

/**
 * Cổng cấu hình fail-closed cho toàn bộ miền admin (R3).
 *
 * Gọi ở ĐẦU `requireSuperAdmin`, không phải lúc khởi động: Workers không có "lúc khởi
 * động" đáng tin cậy để ném lỗi ra ngoài, và một isolate lạnh phục vụ request đầu tiên
 * cũng phải bị chặn như mọi request khác.
 *
 * Chuỗi rỗng bị coi là CHƯA ĐẶT, không phải "đã đặt bằng chuỗi rỗng" — một secret rỗng ký
 * được token mà ai cũng làm giả được.
 */
export function kiemTraCauHinhAdmin(env: {
  JWT_SECRET?: string;
  ADMIN_JWT_SECRET?: string;
}): CauHinhAdmin {
  const secret = env.ADMIN_JWT_SECRET;
  if (!secret) return { ok: false, lyDo: "thieu_secret" };
  // Trùng secret khách ⇒ hai miền gộp làm một ⇒ lớp phòng thủ chính biến mất. TỪ CHỐI
  // phục vụ thay vì chạy tiếp và chỉ còn `aud` gánh: một lớp duy nhất không đủ cho đơn vị
  // nhạy cảm nhất dự án.
  if (secret === env.JWT_SECRET) return { ok: false, lyDo: "trung_secret_khach" };
  return { ok: true, secret };
}

/**
 * Phát token admin sau khi `POST /admin/auth/login` xác thực email + mật khẩu.
 *
 * Claim tối thiểu — `sub` (id super-admin), `aud`, `exp`. CỐ Ý không mang `tenant_id` hay
 * `role`: token này không thuộc tenant nào, và việc thiếu `tenant_id` chính là thứ khiến
 * nó rớt ở `requireTenant` (auth.ts kiểm `isUuid(payload.tenant_id)`) nếu có ai đó chĩa
 * nó vào route khách.
 */
export async function signAdminToken(
  sub: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return sign({ sub, aud: ADMIN_AUD, exp: nowSec + ADMIN_TOKEN_TTL_SEC }, secret, "HS256");
}

// U34b (ADR-0007 §1.5) — Kiểm tên miền người nhận có nhận được thư không, TRƯỚC khi gọi SES.
//
// ── VÌ SAO ĐÂY LÀ CHỐT QUAN TRỌNG NHẤT CỦA U34b ──────────────────────────────────────
// AWS đình chỉ tài khoản SES khi tỉ lệ bounce vượt ~5%. Cổng đăng ký của ta là CÔNG KHAI,
// nên bất kỳ ai cũng nộp được hàng loạt địa chỉ ở tên miền không tồn tại. Bounce dồn lên,
// AWS khoá tài khoản, và khi đó email đặt mật khẩu của KHÁCH THẬT cũng không gửi được —
// khôi phục thì phải giải trình với AWS. Chặn ở đây là rẻ nhất và sớm nhất.
//
// Dùng DNS-over-HTTPS của Cloudflare: Worker không mở được UDP để hỏi DNS theo cách thường,
// và `1.1.1.1` thì cùng nhà, không thêm phụ thuộc nào.

const DOH_URL = "https://cloudflare-dns.com/dns-query";
/** Hiến pháp: mọi lời gọi mạng ra ngoài phải có timeout. Lời gọi này nằm trên đường trả
 * lời của khách đang chờ ở form đăng ký, nên để ngắn. */
export const TIMEOUT_MS = 3_000;

const LOAI_MX = 15;
const LOAI_A = 1;
/** NXDOMAIN — tên miền KHÔNG TỒN TẠI. Khác hẳn "tồn tại nhưng không có MX". */
const STATUS_NXDOMAIN = 3;

export type KetQuaKiemMien =
  | { nhanDuoc: true; vi: "co_mx" | "co_a_ngam_dinh" | "khong_kiem_duoc" }
  | { nhanDuoc: false; vi: "khong_ton_tai" | "tu_choi_nhan_thu" | "khong_co_ban_ghi" };

interface BanGhiDns {
  type: number;
  data: string;
}

async function hoiDns(
  mien: string,
  loai: "MX" | "A",
  fetchFn: typeof fetch,
): Promise<{ Status: number; Answer?: BanGhiDns[] }> {
  const res = await fetchFn(`${DOH_URL}?name=${encodeURIComponent(mien)}&type=${loai}`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DoH ${res.status}`);
  return (await res.json()) as { Status: number; Answer?: BanGhiDns[] };
}

/** Tách tên miền khỏi địa chỉ. Dùng `lastIndexOf` vì phần tên có thể chứa `@` khi được
 * trích dẫn. Trả `null` nếu không tách được. */
export function layMien(email: string): string | null {
  const i = email.lastIndexOf("@");
  if (i <= 0 || i === email.length - 1) return null;
  return email
    .slice(i + 1)
    .trim()
    .toLowerCase();
}

/**
 * Hỏi xem tên miền có nhận thư không.
 *
 * ⚠️ FAIL-OPEN khi KHÔNG HỎI ĐƯỢC — ngược chiều Turnstile, và ngược có chủ ý.
 * Đây là chốt BẢO VỆ UY TÍN GỬI THƯ, không phải cổng bảo mật. Nếu DoH hỏng mà ta fail-closed
 * thì không ai đăng ký được nữa — thiệt hại chắc chắn và tức thì, để đổi lấy việc tránh một
 * thiệt hại chỉ có thể xảy ra. Một lá thư bounce không giết được tài khoản; chặn toàn bộ
 * đăng ký thì giết được cả sản phẩm.
 */
export async function mienNhanDuocThu(
  mien: string,
  fetchFn: typeof fetch = fetch,
): Promise<KetQuaKiemMien> {
  try {
    const mx = await hoiDns(mien, "MX", fetchFn);

    // Tên miền không tồn tại — chắc chắn bounce, chặn thẳng.
    if (mx.Status === STATUS_NXDOMAIN) return { nhanDuoc: false, vi: "khong_ton_tai" };

    const banGhiMx = (mx.Answer ?? []).filter((r) => r.type === LOAI_MX);

    // "Null MX" (RFC 7505): một bản ghi MX DUY NHẤT với độ ưu tiên 0 và đích là `.` nghĩa
    // là chủ tên miền TUYÊN BỐ RÕ miền này không nhận thư. Gửi vào đó chắc chắn bounce.
    const nullMx =
      banGhiMx.length === 1 && /^0\s+\.?$/.test((banGhiMx[0] as BanGhiDns).data.trim());
    if (nullMx) return { nhanDuoc: false, vi: "tu_choi_nhan_thu" };

    if (banGhiMx.length > 0) return { nhanDuoc: true, vi: "co_mx" };

    // ⚠️ CÁI BẪY: "không có MX" KHÔNG có nghĩa là "không nhận thư".
    // RFC 5321 §5.1 — khi thiếu MX, máy chủ gửi phải rơi về bản ghi A/AAAA (gọi là
    // "implicit MX"). Rất nhiều tên miền nhỏ ở Việt Nam chạy đúng kiểu này. Chặn chỉ dựa
    // trên MX sẽ từ chối những khách hàng HOÀN TOÀN HỢP LỆ — mà lỗi đó lại im lặng: họ chỉ
    // thấy "email không hợp lệ" và bỏ đi.
    const a = await hoiDns(mien, "A", fetchFn);
    if (a.Status === STATUS_NXDOMAIN) return { nhanDuoc: false, vi: "khong_ton_tai" };
    if ((a.Answer ?? []).some((r) => r.type === LOAI_A)) {
      return { nhanDuoc: true, vi: "co_a_ngam_dinh" };
    }
    return { nhanDuoc: false, vi: "khong_co_ban_ghi" };
  } catch {
    console.warn(`[email] không hỏi được DNS cho "${mien}" — cho qua (fail-open)`);
    return { nhanDuoc: true, vi: "khong_kiem_duoc" };
  }
}

/** Tiện ích: kiểm thẳng từ địa chỉ email. Địa chỉ không tách được miền ⇒ từ chối. */
export async function diaChiNhanDuocThu(
  email: string,
  fetchFn: typeof fetch = fetch,
): Promise<KetQuaKiemMien> {
  const mien = layMien(email);
  if (mien === null) return { nhanDuoc: false, vi: "khong_co_ban_ghi" };
  return mienNhanDuocThu(mien, fetchFn);
}

// U33 — Xác minh Cloudflare Turnstile ở PHÍA MÁY CHỦ.
//
// Widget ở trình duyệt chỉ SINH ra token; nó không chứng minh được gì cho tới khi máy chủ
// hỏi lại Cloudflare. Bỏ bước này thì kẻ tấn công gọi thẳng API bằng curl và captcha chỉ
// còn là trang trí. Tài liệu Cloudflare nói thẳng: token có thể bị giả, có hạn, và dùng
// một lần.
//
// BỐI CẢNH QUAN TRỌNG (QĐ-11, 2026-07-21): U33 gỡ `SignupLimiter` và `LoginLimiter`, giao
// việc chặn nhịp cho WAF của Cloudflare. Sau đó module này là **lớp bảo vệ DUY NHẤT còn
// lại ở tầng ứng dụng** cho cổng ghi công khai. Mọi lựa chọn ở đây vì thế đều nghiêng về
// fail-closed.
//
// Hợp đồng lấy từ tài liệu Cloudflare (tra 2026-07-21), không phải trí nhớ:
//   POST https://challenges.cloudflare.com/turnstile/v0/siteverify
//   secret (bắt buộc) · response (bắt buộc) · remoteip (tuỳ chọn) · idempotency_key (tuỳ chọn)
//   → { success, "error-codes": [], challenge_ts, hostname }
//   Token DÙNG MỘT LẦN, hiệu lực 300 giây, tối đa 2048 ký tự.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Tên trường mà widget tự chèn vào form. Route đọc đúng tên này từ body. */
export const TURNSTILE_FIELD = "cf-turnstile-response";

export type LyDoTurnstile =
  /** Client không gửi token — form bị bỏ qua widget, hoặc gọi thẳng API. */
  | "thieu_captcha"
  /** Token sai/giả. */
  | "captcha_sai"
  /** Token đã dùng hoặc quá 300 giây. Ca THƯỜNG GẶP, không phải lỗi người dùng. */
  | "het_han"
  /** Secret của máy chủ sai ⇒ lỗi vận hành, route phải trả 503 chứ không 400. */
  | "cau_hinh_sai"
  /** Không hỏi được Cloudflare (mạng/5xx). Fail-closed. */
  | "khong_kiem_duoc";

export type KetQuaTurnstile = { ok: true } | { ok: false; ly_do: LyDoTurnstile };

/** Cổng cấu hình. FAIL-CLOSED: thiếu secret ⇒ route trả 503, KHÔNG cho qua.
 *
 * Ngược với `SignupLimiter` cũ (fail-open khi thiếu binding) — và đó là chủ ý. Khi
 * limiter còn tồn tại, nó chỉ là một trong nhiều lớp nên fail-open chấp nhận được. Giờ
 * Turnstile là lớp duy nhất; fail-open nghĩa là một lần cấu hình sai sẽ âm thầm mở toang
 * cổng ghi công khai mà không ai biết. */
export function kiemTraCauHinhTurnstile(env: {
  TURNSTILE_SECRET_KEY?: string;
}): { ok: true; secret: string } | { ok: false } {
  const secret = env.TURNSTILE_SECRET_KEY;
  return secret ? { ok: true, secret } : { ok: false };
}

interface SiteverifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

/** Ánh xạ mã lỗi Cloudflare → lý do của ta. Phân biệt ba nhóm vì UI phải nói ba câu khác
 * nhau: người dùng thử lại / người dùng làm sai / máy chủ hỏng. */
function suyLyDo(codes: string[]): LyDoTurnstile {
  if (codes.includes("timeout-or-duplicate")) return "het_han";
  if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
    return "cau_hinh_sai";
  }
  if (codes.includes("internal-error")) return "khong_kiem_duoc";
  // Gồm `invalid-input-response`, `missing-input-response`, `bad-request`, và bất kỳ mã
  // MỚI nào Cloudflare thêm sau này — mặc định là từ chối, không phải cho qua.
  return "captcha_sai";
}

/**
 * Hỏi Cloudflare xem token có thật không.
 *
 * `remoteip` chỉ gửi khi biết — tham số rỗng làm nhiễu chẩn đoán về sau và không giúp gì.
 */
export async function xacMinhTurnstile(
  secret: string,
  token: string,
  remoteip?: string,
): Promise<KetQuaTurnstile> {
  // Chặn tại chỗ: không có token thì không cần tốn một round-trip ra Cloudflare.
  if (!token) return { ok: false, ly_do: "thieu_captcha" };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as SiteverifyResponse;
    if (data.success === true) return { ok: true };
    return { ok: false, ly_do: suyLyDo(data["error-codes"] ?? []) };
  } catch {
    // Mạng hỏng, 5xx, hoặc body không phải JSON. FAIL-CLOSED — thà chặn nhầm một người
    // dùng thật còn hơn mở cổng ghi công khai vì Cloudflare tạm không trả lời.
    return { ok: false, ly_do: "khong_kiem_duoc" };
  }
}

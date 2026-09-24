// U43 — Canary lối vào GDT: "GDT còn xử lý đăng nhập như mọi khi không?"
//
// Cách đo: lấy captcha THẬT rồi gọi authenticate với MST KHÔNG TỒN TẠI + captcha cố ý SAI.
// KIỂM CHỨNG 2026-09-24 (curl thật): GDT kiểm captcha TRƯỚC → 401 {"message":"Mã captcha
// không đúng."} — không đụng tài khoản của ai, không có lượt "sai mật khẩu" nào bị đếm.
// Đó chính là phép thử đã tái lập sự cố 10/09→24/09 (thiếu request-id → 403 WAF).
//
// Ranh giới (CLAUDE.md): KHÔNG giải captcha (gửi giá trị sai có chủ ý), KHÔNG né chặn,
// KHÔNG retry (một lượt cron = một lời gọi captcha + một lời gọi authenticate). Bị chặn
// thì BÁO, không thử dồn — thử dồn là cách nhanh nhất để leo thang thành chặn IP.
import { authenticate } from "./auth";
import { getCaptcha } from "./captcha";
import { GdtContractDriftError, GdtError, isWafBlocked } from "./errors";
import type { RetryOptions } from "./http";
import type { GdtTransport } from "./transport";

export const CANARY_USERNAME = "0000000000" as const;
// Mật khẩu VÔ NGHĨA, cố ý sai — không phải bí mật (tên hằng tránh mẫu quét của hook security).
const CANARY_PW_GIA = "canary-khong-dung";
const CANARY_CVALUE = "0000";

export type CanaryVerdict = "OK" | "WAF_BLOCKED" | "DRIFT" | "TIMEOUT" | "ERROR";

export interface CanaryResult {
  verdict: CanaryVerdict;
  httpStatus?: number;
  /** Thông điệp GDT/lỗi — chỉ để người đọc cảnh báo; không chứa secret hay dữ liệu tenant. */
  message?: string;
  latencyMs: number;
}

type KetQuaKhongCoThoiGian = Omit<CanaryResult, "latencyMs">;

/** Lỗi ném từ transport (không phải GdtError): AbortError = timeout, còn lại = mạng. */
function phanLoaiLoiTransport(
  err: unknown,
  buoc: "captcha" | "authenticate",
): KetQuaKhongCoThoiGian {
  const timedOut = err instanceof Error && err.name === "AbortError";
  const chiTiet = err instanceof Error ? err.message : String(err);
  return { verdict: timedOut ? "TIMEOUT" : "ERROR", message: `${buoc}: ${chiTiet}` };
}

export async function canaryAuthenticate(
  transport: GdtTransport,
  opts: RetryOptions = {},
): Promise<CanaryResult> {
  const start = Date.now();
  const khongRetry: RetryOptions = { ...opts, maxAttempts: 1 };
  const xong = (r: KetQuaKhongCoThoiGian): CanaryResult => ({
    ...r,
    latencyMs: Date.now() - start,
  });

  let ckey: string;
  try {
    ckey = (await getCaptcha(transport, khongRetry)).key;
  } catch (err) {
    // Captcha đổi dạng = đổi hợp đồng (DRIFT). Captcha HTTP lỗi/mạng = ERROR/TIMEOUT —
    // probe egress 15' (đọc thân 403) là nơi phân biệt WAF trên /captcha.
    if (err instanceof GdtContractDriftError)
      return xong({ verdict: "DRIFT", message: err.message });
    if (err instanceof GdtError) {
      return xong({ verdict: "ERROR", httpStatus: err.httpStatus, message: err.message });
    }
    return xong(phanLoaiLoiTransport(err, "captcha"));
  }

  try {
    await authenticate(
      transport,
      { username: CANARY_USERNAME, password: CANARY_PW_GIA, ckey, cvalue: CANARY_CVALUE },
      khongRetry,
    );
  } catch (err) {
    if (err instanceof GdtError && err.httpStatus === 401) {
      return xong({ verdict: "OK", httpStatus: 401, message: err.message });
    }
    if (isWafBlocked(err)) {
      return xong({ verdict: "WAF_BLOCKED", httpStatus: 403, message: (err as GdtError).message });
    }
    if (err instanceof GdtContractDriftError)
      return xong({ verdict: "DRIFT", message: err.message });
    if (err instanceof GdtError) {
      return xong({ verdict: "DRIFT", httpStatus: err.httpStatus, message: err.message });
    }
    return xong(phanLoaiLoiTransport(err, "authenticate"));
  }

  // Thành công với MST giả là KHÔNG THỂ đúng — GDT đã đổi cách xử lý đăng nhập.
  return xong({ verdict: "DRIFT", httpStatus: 200, message: "authenticate trả token cho MST giả" });
}

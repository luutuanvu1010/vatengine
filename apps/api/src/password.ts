// Băm/so khớp mật khẩu người dùng NỘI BỘ SaaS (U8) bằng PBKDF2 qua WebCrypto
// (`crypto.subtle`) — tương thích workerd (KHÔNG dùng Node `bcrypt`). Đây là mật khẩu
// người dùng SaaS, KHÁC mật khẩu tài khoản thuế (security.md chỉ cấm lưu mật khẩu THUẾ
// thô). Định dạng lưu: `pbkdf2$<iterations>$<salt_b64>$<hash_b64>` — tự mô tả tham số
// nên đổi số vòng lặp về sau không phá hàng cũ.
// H-A.5a — số vòng PBKDF2 mặc định. GIỮ 100k: an toàn trần CPU Free 10ms (đo 2026-07-15:
// 100k~7ms, 300k~21ms, 600k~42ms trên V8 → 600k VƯỢT trần Free). OWASP khuyến nghị 600k;
// bật khi nâng Paid (H-A.3) qua env PBKDF2_ITERATIONS — hash tự mô tả số vòng nên tương
// thích ngược (hàng cũ verify bằng đúng số vòng đã lưu).
export const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const KEYLEN_BYTES = 32; // 256-bit.
const SALT_BYTES = 16;
const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEYLEN_BYTES * 8,
  );
  return new Uint8Array(bits);
}

// So sánh THỜI GIAN HẰNG (không rò độ dài khớp qua timing).
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

export async function hashPassword(
  password: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

// H-A.5a — số vòng dùng cho hash MỚI, đọc từ env (Workers var, không nhạy cảm). SÀN =
// DEFAULT: giá trị env dưới sàn hoặc rác → dùng default (fail-safe, chỉ cho tăng, không
// cho hạ làm yếu). Nâng 600k = đặt PBKDF2_ITERATIONS=600000 SAU khi Paid (H-A.3).
export function resolvePbkdf2Iterations(env: { PBKDF2_ITERATIONS?: string }): number {
  const n = Number(env.PBKDF2_ITERATIONS);
  if (!Number.isInteger(n) || n < DEFAULT_PBKDF2_ITERATIONS) return DEFAULT_PBKDF2_ITERATIONS;
  return n;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterStr || !saltB64 || !hashB64) return false;
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromB64(saltB64);
    expected = fromB64(hashB64);
  } catch {
    return false;
  }
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

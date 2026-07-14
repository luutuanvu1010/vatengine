// U12 — Che (mask) dữ liệu nhạy cảm TRƯỚC khi ghi vào audit_log.chi_tiet hoặc log
// (security.md: "KHÔNG log token, mật khẩu, hoặc raw_json … che (mask) trước khi
// ghi"). Thuần, không side-effect; trả BẢN SAO đã che, không đột biến bản gốc.

const REDACTED = "***";

// Khóa bị che theo TÊN (so khớp không phân biệt hoa/thường, bỏ dấu gạch dưới). Bao
// gồm biến thể tiếng Việt (matKhau) và raw_json (dữ liệu hóa đơn thô).
const SENSITIVE_KEYS = new Set([
  "token",
  "tokenhientai",
  "password",
  "passwordhash",
  "matkhau",
  "secret",
  "secretref",
  "authorization",
  "cookie",
  "rawjson",
  "raw",
]);

// Chuỗi kết nối DB có thể lộ mật khẩu inline (postgres://user:pass@host). Che phần
// credential thay vì bỏ cả chuỗi để vẫn giữ ngữ cảnh chẩn đoán.
const CONN_STRING = /\b([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+):([^@/\s]+)@/gi;

// JWT thô (header.payload.signature, base64url) có thể lọt vào chuỗi lỗi tự do dưới
// một khóa vô hại → che phòng thủ chiều sâu. Header JWT luôn bắt đầu `eyJ` (base64 của
// `{"`). (Phát hiện Low từ security-reviewer 2026-07-14.)
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function normalizeKey(key: string): string {
  return key.replace(/_/g, "").toLowerCase();
}

function maskString(value: string): string {
  return value
    .replace(CONN_STRING, (_m, scheme, user) => `${scheme}${user}:${REDACTED}@`)
    .replace(JWT, REDACTED);
}

/**
 * Trả bản sao của `value` với mọi trường nhạy cảm bị che. An toàn với mọi kiểu
 * (null/undefined/nguyên thủy trả nguyên). Dùng cho audit_log.chi_tiet + log.
 */
export function maskSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskString(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(normalizeKey(key)) ? REDACTED : maskSensitive(v);
  }
  return out;
}

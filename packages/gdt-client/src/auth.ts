// Đăng nhập GDT bằng MST + mật khẩu + captcha do người dùng nhập.
// Xem .claude/rules/gdt-adapter.md (401 → dừng, không retry credential cũ) và
// .claude/rules/security.md (không lưu mật khẩu thuế thô, chỉ giữ token).

import { checkContract } from "./contract";
import { AUTH_PATH, BASE } from "./endpoints";
import { GdtError } from "./errors";
import { type RetryOptions, fetchWithRetry } from "./http";
import type { GdtTransport } from "./transport";

export interface AuthCredentials {
  username: string;
  password: string;
  ckey: string;
  cvalue: string;
}

export interface AuthResult {
  token: string;
}

/** Thông điệp GDT giải thích vì sao từ chối đăng nhập (message / error_description). */
function thongDiepTuChoi(data: Record<string, unknown>): string {
  return (
    (typeof data.message === "string" && data.message) ||
    (typeof data.error_description === "string" && data.error_description) ||
    "Đăng nhập thất bại."
  );
}

export async function authenticate(
  transport: GdtTransport,
  credentials: AuthCredentials,
  opts?: RetryOptions,
): Promise<AuthResult> {
  const res = await fetchWithRetry(
    transport,
    `${BASE}${AUTH_PATH}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    },
    opts,
  );

  let data: Record<string, unknown> = {};
  let bodyLaJson = true;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    bodyLaJson = false;
  }

  // Sai captcha/mật khẩu là lỗi NGHIỆP VỤ. KIỂM CHỨNG 2026-09-24 (curl thật): GDT trả
  // HTTP **401** kèm {"message":"Mã captcha không đúng."}; tài liệu cũ nói "200 kèm
  // message không token" — giữ cả hai nhánh. Ở bước đăng nhập CHƯA có phiên nào để
  // "hết", nên 401 ở đây KHÔNG phải SESSION_EXPIRED (trước đây audit ghi "Hết phiên đăng
  // nhập." cho mọi lượt gõ sai captcha — sai bản chất). Giữ đúng thông điệp GDT, kèm
  // httpStatus để tầng gọi/contract test phân biệt 401 nghiệp vụ với 403 WAF chặn.
  // KHÔNG coi là lệch hợp đồng (gdt-adapter.md) — 3 lần gõ sai captcha của người dùng
  // thật không được tự mở circuit breaker.
  if (res.status === 401) {
    throw new GdtError(thongDiepTuChoi(data), "HTTP_ERROR", 401);
  }

  if (!bodyLaJson) {
    throw new GdtError(`Phản hồi không hợp lệ từ máy chủ thuế (HTTP ${res.status}).`);
  }

  if (res.status !== 200 || typeof data.token !== "string") {
    throw new GdtError(thongDiepTuChoi(data), "HTTP_ERROR", res.status);
  }

  checkContract(data, "authenticate", AUTH_PATH);

  return { token: data.token };
}

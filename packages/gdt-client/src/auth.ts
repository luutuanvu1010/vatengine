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

  if (res.status === 401) {
    throw new GdtError("Hết phiên đăng nhập.", "SESSION_EXPIRED");
  }

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new GdtError(`Phản hồi không hợp lệ từ máy chủ thuế (HTTP ${res.status}).`);
  }

  if (res.status !== 200 || typeof data.token !== "string") {
    // Sai captcha/mật khẩu là lỗi NGHIỆP VỤ — GDT có thể trả 200 kèm message lỗi
    // mà không có token. KHÔNG được coi là lệch hợp đồng (xem gdt-adapter.md),
    // nếu không 3 lần gõ sai captcha của người dùng thật sẽ tự mở circuit breaker.
    const message =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error_description === "string" && data.error_description) ||
      "Đăng nhập thất bại.";
    throw new GdtError(message);
  }

  checkContract(data, "authenticate", AUTH_PATH);

  return { token: data.token };
}

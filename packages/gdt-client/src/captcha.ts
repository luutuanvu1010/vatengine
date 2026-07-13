// Lấy ảnh captcha từ GDT — CHỈ trả nguyên ảnh cho người dùng nhập, KHÔNG tự
// giải/bypass (ranh giới pháp lý cứng, xem CLAUDE.md + .claude/rules/security.md).

import { checkContract } from "./contract";
import { BASE, CAPTCHA_PATH } from "./endpoints";
import { GdtError } from "./errors";
import { type RetryOptions, fetchWithRetry } from "./http";
import type { GdtTransport } from "./transport";

export interface Captcha {
  key: string;
  content: string;
}

export async function getCaptcha(transport: GdtTransport, opts?: RetryOptions): Promise<Captcha> {
  const res = await fetchWithRetry(transport, `${BASE}${CAPTCHA_PATH}`, { method: "GET" }, opts);

  if (!res.ok) {
    throw new GdtError(`Không lấy được captcha (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  checkContract(data, "captcha", CAPTCHA_PATH);

  return { key: data.key as string, content: data.content as string };
}

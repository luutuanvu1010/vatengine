// U14 — suy ra hạn token GDT. Cô lập trong gdt-client (kiến thức về token GDT thuộc
// adapter — gdt-adapter.md). Cơ chế chốt theo BẰNG CHỨNG probe (U14-plan Task 1):
// token GDT là JWT có claim `exp` (giây epoch). KHÔNG giả định TTL cố định.
import { GdtError } from "./errors";

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

/** Hạn token = claim `exp` (giây epoch) của JWT GDT. Ném nếu không lấy được (không đoán). */
export function deriveTokenExpiry(token: string): Date {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new GdtError("Token GDT không phải JWT hợp lệ (không suy ra được hạn).");
  }
  const payloadPart = parts[1];
  if (payloadPart === undefined) {
    throw new GdtError("Token GDT không phải JWT hợp lệ (không suy ra được hạn).");
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64urlDecode(payloadPart)) as Record<string, unknown>;
  } catch {
    throw new GdtError("Không giải mã được payload token GDT.");
  }
  if (typeof payload.exp !== "number") {
    throw new GdtError("Token GDT thiếu claim exp (không suy ra được hạn).");
  }
  return new Date(payload.exp * 1000);
}

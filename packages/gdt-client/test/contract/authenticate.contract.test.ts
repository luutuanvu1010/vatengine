// CONTRACT (gọi GDT THẬT) — chỉ chạy khi có credential + captcha do NGƯỜI nhập.
// Mục tiêu: quan sát dạng token GDT trả về + cách suy ra token_het_han. KHÔNG assert
// cứng TTL (chưa có bằng chứng); LOG để ghi vào U14-design.md. testing.md nhóm `contract`.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authenticate, createDirectCfTransport, getCaptcha } from "../../src";

const U = process.env.GDT_TEST_USERNAME;
const P = process.env.GDT_TEST_PASSWORD;
const CKEY = process.env.GDT_TEST_CKEY; // lấy từ getCaptcha ở lần chạy trước
const CVALUE = process.env.GDT_TEST_CVALUE; // người dùng gõ captcha

describe.skipIf(!U || !P)("contract: GDT authenticate (probe dạng token)", () => {
  it("BƯỚC A — lấy captcha để người dùng gõ (chạy trước, KHÔNG cần CKEY/CVALUE)", async () => {
    const cap = await getCaptcha(createDirectCfTransport());
    expect(cap.key).toBeTruthy();
    // KIỂM CHỨNG 2026-07-14 (probe primary-source): GDT trả captcha là SVG MARKUP THÔ
    // (bắt đầu "<svg xmlns=..."), KHÔNG phải data-URI/base64 và KHÔNG chứa "image/".
    // (Sửa drift so với giả định cũ "SVG/PNG base64" trong plan U14 Task 1.)
    expect(cap.content).toContain("<svg");
    // Ghi SVG ra file để người dùng MỞ BẰNG TRÌNH DUYỆT rồi gõ captcha (log chỉ in độ
    // dài thì không đọc được ảnh). Đặt lại GDT_TEST_CKEY/CVALUE rồi chạy BƯỚC B.
    const svgPath = join(tmpdir(), "gdt-captcha-probe.svg");
    writeFileSync(svgPath, cap.content, "utf8");
    console.log("CAPTCHA_KEY=", cap.key);
    console.log("CAPTCHA_SVG_FILE=", svgPath, "(mở bằng trình duyệt để xem + gõ)");
  });

  it.skipIf(!CKEY || !CVALUE)("BƯỚC B — login thật, LOG dạng token + exp", async () => {
    const res = await authenticate(createDirectCfTransport(), {
      username: U as string,
      password: P as string,
      ckey: CKEY as string,
      cvalue: CVALUE as string,
    });
    expect(res.token).toBeTruthy();
    // KIỂM CHỨNG 2026-07-14: token GDT LÀ JWT 3 phần, payload có claim `exp` (epoch giây)
    // → deriveTokenExpiry đọc `exp`. Nâng từ log-thuần thành ASSERTION (U14 Task 1 Step 5,
    // nhánh "có exp"). Vẫn LOG để lần chạy sau còn quan sát dạng token thật.
    const parts = res.token.split(".");
    console.log("TOKEN_PARTS=", parts.length, "TOKEN_LEN=", res.token.length);
    expect(parts).toHaveLength(3);
    const payloadPart = parts[1];
    expect(payloadPart).toBeTruthy();
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob((payloadPart as string).replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        ),
      ),
    ) as Record<string, unknown>;
    // Che `sub` (=MST, dữ liệu tenant) trước khi log — chỉ cần quan sát DẠNG token
    // (có `exp`/`iat` không), KHÔNG cần lộ MST ra stdout (security.md: mask trước khi ghi).
    console.log("TOKEN_PAYLOAD=", JSON.stringify({ ...payload, sub: "<redacted>" }));
    console.log("HAS_EXP=", typeof payload.exp);
    expect(typeof payload.exp).toBe("number");
  });
});

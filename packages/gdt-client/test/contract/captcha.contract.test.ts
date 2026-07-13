import { describe, expect, it } from "vitest";
import schema from "../../gdt-contract-schema.json";
import { BASE, CAPTCHA_PATH } from "../../src/endpoints";

// Nhóm `contract` — gọi MẠNG THẬT tới GDT (endpoint công khai, không đăng nhập).
// Chỉ chạy qua `make test-contract`, không nằm trong `make test` mặc định
// (.claude/rules/testing.md). Lệch schema ⇒ Tổng cục Thuế có thể đã đổi API —
// dừng và cập nhật gdt-contract-schema.json một cách tường minh, không nới lỏng.
describe("GET /api/captcha (contract)", () => {
  it("trả 200 + JSON khớp required_keys đã biết", async () => {
    const res = await fetch(`${BASE}${CAPTCHA_PATH}`, {
      headers: { accept: "application/json, text/plain, */*" },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    for (const key of schema.captcha.required_keys) {
      expect(data).toHaveProperty(key);
    }
  });
});

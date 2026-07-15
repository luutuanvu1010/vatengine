import { describe, expect, it } from "vitest";
import schema from "../../gdt-contract-schema.json";
import { BASE, INVOICE_ENDPOINTS } from "../../src/endpoints";
import { buildSearch } from "../../src/query";

// Nhóm `contract` — kiểm chứng THẬT hình dạng phong bì hóa đơn `{datas, state}`.
// KHÁC captcha: endpoint query CẦN token JWT (đăng nhập có captcha người thật),
// nên KHÔNG tự chạy trong CI. Cung cấp token qua biến môi trường để chạy thủ
// công (runbook probe, giống U1-probe-authenticate.md). Đây là bài test "thất
// bại/kỳ vọng trước": nó ghi rõ kỳ vọng CHƯA KIỂM CHỨNG (2026-07-13); chỉ khi
// có token thật mới thực thi và sinh bằng chứng để gỡ nhãn trong schema.
//
// Cách chạy:
//   GDT_CONTRACT_TOKEN=<jwt> \
//   GDT_CONTRACT_FROM=01/01/2026 GDT_CONTRACT_TO=31/01/2026 \
//   npm run test:contract -w packages/gdt-client
// Đọc env mà không cần @types/node (runtime chạy trên Node qua vitest; Workers
// runtime không có `process` nhưng nhóm contract chỉ chạy thủ công trên Node).
const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const TOKEN = env.GDT_CONTRACT_TOKEN;
const FROM = env.GDT_CONTRACT_FROM ?? "01/01/2026";
const TO = env.GDT_CONTRACT_TO ?? "31/01/2026";

describe("GET /api/query/invoices/purchase (contract)", () => {
  it.skipIf(!TOKEN)(
    "trả 200 + phong bì khớp required_keys (datas); token gắn qua Bearer",
    async () => {
      const query = new URLSearchParams({
        // GDT chỉ hỗ trợ sắp xếp MỘT trường (KIỂM CHỨNG 2026-07-15: đa trường → HTTP 500
        // "Không hỗ trợ sắp xếp theo nhiều trường"). Khớp DEFAULT_SORT của adapter.
        sort: "tdlap:desc",
        size: "10",
        search: buildSearch(FROM, TO),
      });
      const res = await fetch(`${BASE}${INVOICE_ENDPOINTS.purchase}?${query.toString()}`, {
        headers: {
          accept: "application/json, text/plain, */*",
          authorization: `Bearer ${TOKEN}`,
        },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>;
      for (const key of schema.invoice_envelope.required_keys) {
        expect(data).toHaveProperty(key);
      }
      // Kỳ vọng: 'datas' là mảng, 'state' (nếu có) là chuỗi con trỏ phân trang.
      expect(Array.isArray(data.datas)).toBe(true);
      if ("state" in data && data.state !== null) {
        expect(typeof data.state).toBe("string");
      }
    },
  );
});

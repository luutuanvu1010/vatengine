import { describe, expect, it } from "vitest";
import schema from "../../gdt-contract-schema.json";
import { BASE, DETAIL_ENDPOINTS } from "../../src/endpoints";

// Nhóm `contract` — kiểm chứng THẬT hình dạng body chi tiết hóa đơn (dòng hàng +
// thuế suất từng dòng). KHÁC captcha: endpoint detail CẦN token JWT (đăng nhập có
// captcha người thật), nên KHÔNG tự chạy trong CI. Cung cấp token + định danh một
// hóa đơn thật qua biến môi trường để chạy thủ công.
//
// ĐÃ KIỂM CHỨNG (2026-07-13, probe detail thật từ Chrome đăng nhập thật của người
// dùng — HĐ mua vào thường, dòng thuế suất 8%; chỉ đọc HÌNH DẠNG, không ghi token/
// giá trị hóa đơn): GET /api/query/invoices/detail?nbmst&khhdon&shdon&khmshdon (CHỈ
// 4 tham số, KHÔNG có tdlap) trả 200; mảng dòng hàng ở khóa 'hdhhdvu'; mỗi dòng có
// ten/dvtinh/sluong/dgia/thtien + thuế suất ở HAI trường 'ltsuat' (chuỗi "8%") và
// 'tsuat' (số 0.08). Bằng chứng: docs/CHECKLIST-NGHIEM-THU.md (U3) + ADR-0001
// Amendment #6.
//
// CHƯA KIỂM CHỨNG (giữ nhãn): (a) 'sco' (/api/sco-query/invoices/detail) — suy từ
// đối xứng, chưa gọi trực tiếp (tài khoản probe không có HĐ máy tính tiền); (b) biểu
// diễn thuế suất cho mã đặc biệt KCT/KKKNT (mới chỉ quan sát 8%). Nếu response thật
// LỆCH khóa/kiểu → DỪNG, cập nhật gdt-contract-schema.json + src/detail.ts TƯỜNG
// MINH, KHÔNG nới assertion (.claude/rules/gdt-adapter.md).
//
// Bảo mật: test chỉ assert HÌNH DẠNG (tồn tại khóa/kiểu). KHÔNG console.log body/
// giá trị/token; KHÔNG bypass captcha. Xem .claude/rules/security.md.
//
// Cách chạy (phiên có người trực; token + một hóa đơn thật lấy từ queryInvoices):
//   GDT_CONTRACT_TOKEN=<jwt> \
//   GDT_DETAIL_SOURCE=normal \                 # normal | sco (chọn họ endpoint)
//   GDT_DETAIL_NBMST=<mst> GDT_DETAIL_KHHDON=<khhdon> \
//   GDT_DETAIL_KHMSHDON=<khmshdon> GDT_DETAIL_SHDON=<shdon> \
//   npm run test:contract -w packages/gdt-client
// Đọc env mà không cần @types/node (nhóm contract chỉ chạy thủ công trên Node).
const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const TOKEN = env.GDT_CONTRACT_TOKEN;
const SOURCE = env.GDT_DETAIL_SOURCE === "sco" ? "sco" : "normal";
const REF = {
  nbmst: env.GDT_DETAIL_NBMST,
  khhdon: env.GDT_DETAIL_KHHDON,
  khmshdon: env.GDT_DETAIL_KHMSHDON,
  shdon: env.GDT_DETAIL_SHDON,
};
const READY = Boolean(TOKEN && REF.nbmst && REF.khhdon && REF.khmshdon && REF.shdon);

describe("GET /api/query/invoices/detail (contract)", () => {
  it.skipIf(!READY)(
    "trả 200 + body có mảng 'hdhhdvu'; mỗi dòng có trường ánh xạ + thuế suất (ltsuat chuỗi, tsuat số)",
    async () => {
      // 4 tham số định danh, KHÔNG có tdlap (ĐÃ KIỂM CHỨNG).
      const query = new URLSearchParams({
        nbmst: REF.nbmst ?? "",
        khhdon: REF.khhdon ?? "",
        khmshdon: REF.khmshdon ?? "",
        shdon: REF.shdon ?? "",
      });
      const res = await fetch(`${BASE}${DETAIL_ENDPOINTS[SOURCE]}?${query.toString()}`, {
        headers: {
          accept: "application/json, text/plain, */*",
          authorization: `Bearer ${TOKEN}`,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;

      // required_keys của hợp đồng invoice_detail phải hiện diện.
      for (const key of schema.invoice_detail.required_keys) {
        expect(body).toHaveProperty(key);
      }

      const lines = body.hdhhdvu;
      expect(Array.isArray(lines)).toBe(true);
      const rows = lines as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);

      const line = rows[0];
      if (!line) throw new Error("Mảng 'hdhhdvu' rỗng ngoài kỳ vọng.");
      for (const key of ["ten", "dvtinh", "sluong", "dgia", "thtien"]) {
        expect(line).toHaveProperty(key);
      }
      // Thuế suất: hai trường. Chỉ khẳng định TỒN TẠI + kiểu quan sát được; KHÔNG
      // assert tập giá trị (mã KCT/KKKNT chưa kiểm chứng). ltsuat chuỗi, tsuat số.
      expect(line).toHaveProperty("ltsuat");
      expect(line).toHaveProperty("tsuat");
    },
  );
});

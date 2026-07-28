import { describe, expect, it } from "vitest";
import { BASE, EXPORT_XML_ENDPOINTS } from "../../src/endpoints";

// Nhóm `contract` — kiểm chứng THẬT hình dạng phản hồi tải hồ sơ gốc hóa đơn.
// Giống detail: endpoint CẦN token JWT (đăng nhập có captcha người thật) nên KHÔNG
// tự chạy trong CI. Cung cấp token + định danh một hóa đơn thật qua biến môi trường.
//
// ĐÃ KIỂM CHỨNG (2026-07-28, probe thật `scripts/probe-export-xml-u37.mjs` với token
// thật; chỉ đọc HÌNH DẠNG, không ghi token/giá trị hóa đơn):
//   GET /api/query/invoices/export-xml?nbmst&khhdon&shdon&khmshdon (CHỈ 4 tham số,
//   KHÔNG có tdlap) + Authorization: Bearer → HTTP 200, ZIP 317.636 byte, 5 file:
//   invoice.xml (bản gốc có chữ ký số, `<HDon><DLHDon><TTChung><PBan>2.1.0`),
//   invoice.html (bản thể hiện GDT dựng sẵn), details.js, viewinvoice-bg.jpg,
//   sign-check.jpg. Bằng chứng: docs/plans/U37-HO-SO-KHOI-DONG-*.md §4.5 + §4.7.
//
// CHƯA KIỂM CHỨNG (giữ nhãn): họ 'sco' (/api/sco-query/invoices/export-xml) — suy từ
// bundle JS của cổng GDT và từ đối xứng, chưa gọi trực tiếp (hóa đơn mẫu của probe là
// normal). Nếu response thật LỆCH → DỪNG, cập nhật src/exportXml.ts + endpoints.ts
// TƯỜNG MINH, KHÔNG nới assertion (.claude/rules/gdt-adapter.md).
//
// Bảo mật: chỉ assert HÌNH DẠNG (mã trạng thái, chữ ký ZIP, tên file bên trong).
// KHÔNG console.log nội dung/giá trị/token; KHÔNG bypass captcha.
//
// Cách chạy (phiên có người trực):
//   GDT_CONTRACT_TOKEN=<jwt> \
//   GDT_DETAIL_SOURCE=normal \                 # normal | sco (chọn họ endpoint)
//   GDT_DETAIL_NBMST=<mst> GDT_DETAIL_KHHDON=<khhdon> \
//   GDT_DETAIL_KHMSHDON=<khmshdon> GDT_DETAIL_SHDON=<shdon> \
//   GDT_NOSRC_NBMST=<mst> GDT_NOSRC_KHHDON=… GDT_NOSRC_KHMSHDON=… GDT_NOSRC_SHDON=… \
//   npm run test:contract -w packages/gdt-client
// (Bộ GDT_NOSRC_* là một hóa đơn THẬT có `raw_json->>'hsgoc'` = null — tìm bằng
//  scripts/do-hsgoc-u37.mjs. Thiếu bộ này thì ca thứ hai tự bỏ qua.)
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

// Ca "không có hồ sơ gốc" cần một hóa đơn THẬT mà `raw_json->>'hsgoc'` là null (tìm
// bằng scripts/do-hsgoc-u37.mjs). CỐ Ý không dùng số hóa đơn bịa: chưa kiểm chứng
// GDT trả thông điệp nào cho hóa đơn không tồn tại — có thể khác "không tồn tại hồ sơ
// gốc", và assert theo phỏng đoán là đúng thứ Hiến pháp cấm.
const NOSRC = {
  nbmst: env.GDT_NOSRC_NBMST,
  khhdon: env.GDT_NOSRC_KHHDON,
  khmshdon: env.GDT_NOSRC_KHMSHDON,
  shdon: env.GDT_NOSRC_SHDON,
};
const NOSRC_READY = Boolean(TOKEN && NOSRC.nbmst && NOSRC.khhdon && NOSRC.khmshdon && NOSRC.shdon);

/**
 * Đọc tên file trong ZIP bằng cách quét chữ ký local file header (PK\x03\x04).
 * CỐ Ý không dùng thư viện giải nén: `@vat/gdt-client` không phụ thuộc `fflate`, và
 * kéo một phụ thuộc ẩn từ node_modules gốc vào chỉ để assert hình dạng là sai nguyên
 * tắc. Đủ dùng cho việc phát hiện GDT đổi cấu trúc gói.
 */
function tenFileTrongZip(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ten: string[] = [];
  for (let i = 0; i + 30 <= bytes.length; i++) {
    if (view.getUint32(i, true) !== 0x04034b50) continue;
    const doDaiTen = view.getUint16(i + 26, true);
    if (doDaiTen === 0 || i + 30 + doDaiTen > bytes.length) continue;
    ten.push(new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + doDaiTen)));
  }
  return ten;
}

describe("GET /api/query/invoices/export-xml (contract)", () => {
  it.skipIf(!READY)(
    "trả 200 + ZIP chứa hồ sơ gốc invoice.xml và bản thể hiện invoice.html",
    async () => {
      const query = new URLSearchParams({
        nbmst: REF.nbmst ?? "",
        khhdon: REF.khhdon ?? "",
        khmshdon: REF.khmshdon ?? "",
        shdon: REF.shdon ?? "",
      });
      const res = await fetch(`${BASE}${EXPORT_XML_ENDPOINTS[SOURCE]}?${query.toString()}`, {
        headers: {
          accept: "application/json, text/plain, */*",
          authorization: `Bearer ${TOKEN}`,
        },
      });

      expect(res.status).toBe(200);
      const bytes = new Uint8Array(await res.arrayBuffer());

      // Chữ ký ZIP "PK\x03\x04" — nền của cả đường lưu trữ U37a.
      expect(bytes.length).toBeGreaterThan(4);
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);

      // Hai file BẮT BUỘC phải còn: mất invoice.xml là mất bản gốc; mất invoice.html
      // là mất bản thể hiện xem-bằng-mắt (và U38 sống lại).
      const ten_file = tenFileTrongZip(bytes);
      expect(ten_file).toContain("invoice.xml");
      expect(ten_file).toContain("invoice.html");
    },
  );

  it.skipIf(!NOSRC_READY)("hóa đơn KHÔNG có hồ sơ gốc → 5xx + message nhận diện được", async () => {
    // Canh chính chuỗi mà `getInvoiceOriginalZip` dựa vào để phân loại lỗi VĨNH VIỄN.
    // GDT đổi thông điệp này ⇒ ta lặng lẽ quay lại retry 3 lần/hóa đơn cho MỌI hóa đơn
    // thiếu hồ sơ gốc — gọi dồn máy chủ thuế. Phải có test canh.
    const query = new URLSearchParams({
      nbmst: NOSRC.nbmst ?? "",
      khhdon: NOSRC.khhdon ?? "",
      khmshdon: NOSRC.khmshdon ?? "",
      shdon: NOSRC.shdon ?? "",
    });
    const res = await fetch(`${BASE}${EXPORT_XML_ENDPOINTS[SOURCE]}?${query.toString()}`, {
      headers: { accept: "application/json", authorization: `Bearer ${TOKEN}` },
    });

    // ĐÃ KIỂM CHỨNG là 500 (§4.7) — assert lỏng hơn một bậc vì mã lỗi cho ca nghiệp vụ
    // này là lựa chọn phía GDT, có thể đổi; điều BẮT BUỘC không đổi là `message`.
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { message?: unknown };
    expect(typeof body.message).toBe("string");
    expect(String(body.message)).toMatch(/không tồn tại hồ sơ gốc/i);
  });
});

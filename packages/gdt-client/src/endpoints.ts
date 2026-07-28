// Nguồn chân lý DUY NHẤT cho URL/endpoint GDT. Khi thuế đổi endpoint, chỉ sửa ở đây.
// Xem .claude/rules/gdt-adapter.md.

// ĐÃ KIỂM CHỨNG (ADR-0001 Amendment #3, 2026-07-13): wrangler dev --remote (biên
// Cloudflare thật) gọi https://hoadondientu.gdt.gov.vn/api/captcha trả 200 +
// {key,content} hợp lệ, 3/3 lần, từ colo nước ngoài. Không còn dùng cổng :30000
// (tiền đề sai — xem ADR-0001 Amendment #2).
export const BASE = "https://hoadondientu.gdt.gov.vn" as const;

export const CAPTCHA_PATH = "/api/captcha" as const;

// ĐÃ KIỂM CHỨNG (2026-07-13): probe đăng nhập thật (QĐ-2, ADR-0001 Amendment #4)
// từ biên Cloudflare (T0, wrangler dev --remote) trả HTTP 200 + {token} (JWT),
// egress SG. Credential ephemeral đã xoá; token KHÔNG ghi lại. Bằng chứng:
// docs/CHECKLIST-NGHIEM-THU.md (U1) + runbook docs/prompts/U1-probe-authenticate.md.
export const AUTH_PATH = "/api/security-taxpayer/authenticate" as const;

// Hai họ endpoint truy vấn hóa đơn (gộp kết quả): thường + máy tính tiền (sco).
// ĐÃ KIỂM CHỨNG (2026-07-13, probe query thật từ Chrome đăng nhập thật của người
// dùng): GET /api/query/invoices/purchase và /sold trả 200; GET
// /api/sco-query/invoices/purchase trả 200. Có tiền tố /api. Phân trang state
// hoạt động (16 kết quả / 2 trang). Bằng chứng: docs/CHECKLIST-NGHIEM-THU.md (U2)
// + docs/adr/0001-nen-tang-cloudflare.md Amendment #5. (/sco-query/.../sold suy
// từ đối xứng, chưa gọi trực tiếp.) Không ghi lại token/giá trị hóa đơn.
export const INVOICE_ENDPOINTS = {
  purchase: "/api/query/invoices/purchase",
  sold: "/api/query/invoices/sold",
  scoPurchase: "/api/sco-query/invoices/purchase",
  scoSold: "/api/sco-query/invoices/sold",
} as const;

// Chi tiết dòng hàng của một hóa đơn (gộp hai họ: thường + máy tính tiền).
// ĐÃ KIỂM CHỨNG (2026-07-13, probe detail thật từ Chrome đăng nhập thật của người
// dùng — HĐ mua vào thường): GET /api/query/invoices/detail?nbmst&khhdon&shdon&
// khmshdon (CHỈ 4 tham số định danh, KHÔNG có tdlap) trả 200; body chứa mảng dòng
// hàng ở khóa `hdhhdvu`. Bằng chứng: docs/CHECKLIST-NGHIEM-THU.md (U3) +
// docs/adr/0001-nen-tang-cloudflare.md Amendment #6. Không ghi token/giá trị hóa đơn.
// CHƯA KIỂM CHỨNG: `sco` (/api/sco-query/invoices/detail) — suy từ đối xứng với
// INVOICE_ENDPOINTS, chưa gọi trực tiếp (tài khoản probe không có HĐ máy tính tiền).
export const DETAIL_ENDPOINTS = {
  normal: "/api/query/invoices/detail",
  sco: "/api/sco-query/invoices/detail",
} as const;

// Tải HỒ SƠ GỐC của một hóa đơn (bản XML có chữ ký số do người bán phát hành),
// gói trong ZIP. Dùng ĐÚNG 4 tham số định danh như DETAIL_ENDPOINTS.
//
// ĐÃ KIỂM CHỨNG — hai tầng bằng chứng độc lập, xem docs/plans/U37-HO-SO-KHOI-DONG-*.md:
// (a) §4.5, offline 2026-07-28, không cần đăng nhập: bundle JS của chính cổng GDT
//     (docs/doi_chieu_data/Hóa Đơn Điện Tử_files/) —
//       exportXml = (params, token, family) => sendGetBlob(
//         `${BASE}/api/${family}/invoices/export-xml`, params, token)
//       sendGetBlob = (url, params, token) => axios({method:"get", url, params,
//         responseType:"blob", headers:{Authorization:`Bearer ${token}`}})
//     và caller `handleExportXML` truyền family = "query" | "sco-query", params =
//     getValues(row, ["nbmst","khhdon","shdon","khmshdon"]), chặn trước bằng cờ `hsgoc`.
// (b) §4.7, probe THẬT 2026-07-28 (scripts/probe-export-xml-u37.mjs, token thật):
//     họ `query` trả HTTP 200 + ZIP 317.636 byte gồm 5 file — invoice.xml (bản gốc,
//     `<HDon><DLHDon><TTChung><PBan>2.1.0`), invoice.html (bản thể hiện GDT dựng sẵn),
//     details.js, viewinvoice-bg.jpg, sign-check.jpg. Hóa đơn KHÔNG có hồ sơ gốc trả
//     **HTTP 500** + JSON {"message":"Không tồn tại hồ sơ gốc của hóa đơn."} — xem
//     `getInvoiceOriginalZip` (exportXml.ts) vì sao phải coi đây là lỗi VĨNH VIỄN.
//
// CHƯA KIỂM CHỨNG: họ `sco` chưa gọi trực tiếp (hóa đơn mẫu của probe là normal) —
// suy từ bundle (b) và từ đối xứng với INVOICE_ENDPOINTS/DETAIL_ENDPOINTS.
// KHÔNG có endpoint PDF cho hóa đơn: grep toàn bộ bundle chỉ ra tên icon và hai hàm
// in chứng từ TNCN, không có đường xuất PDF hóa đơn nào (§4.5).
export const EXPORT_XML_ENDPOINTS = {
  normal: "/api/query/invoices/export-xml",
  sco: "/api/sco-query/invoices/export-xml",
} as const;

// Endpoint công khai để probe khả năng tới máy chủ (không cần đăng nhập).
export const PUBLIC_PROBE_PATH = CAPTCHA_PATH;

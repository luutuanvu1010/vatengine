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
// CHƯA KIỂM CHỨNG (2026-07-13) — dùng ở U2, chưa test trong U1.
export const INVOICE_ENDPOINTS = {
  purchase: "/api/query/invoices/purchase",
  sold: "/api/query/invoices/sold",
  scoPurchase: "/api/sco-query/invoices/purchase",
  scoSold: "/api/sco-query/invoices/sold",
} as const;

// Endpoint công khai để probe khả năng tới máy chủ (không cần đăng nhập).
export const PUBLIC_PROBE_PATH = CAPTCHA_PATH;

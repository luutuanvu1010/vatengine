// Nguồn chân lý DUY NHẤT cho URL/endpoint GDT. Khi thuế đổi endpoint, chỉ sửa ở đây.
// Xem .claude/rules/gdt-adapter.md. (Giá trị đầy đủ sẽ port từ backend/gdt_client.py ở U1–U3.)

// API GDT nằm ở cổng :30000 (xem backend/gdt_client.py + ADR-0001 mục 2).
// LƯU Ý (Amendment ADR-0001 2026-07-12): biên Cloudflare KHÔNG tới được :30000
// (fetch → 521). Mọi gọi API phải đi qua GdtTransport = vn-relay (relay VN gọi
// thẳng origin). Không gọi fetch(BASE) trực tiếp từ Worker cho API.
export const BASE = "https://hoadondientu.gdt.gov.vn:30000" as const;

// Hai họ endpoint truy vấn hóa đơn (gộp kết quả): thường + máy tính tiền (sco).
export const INVOICE_ENDPOINTS = {
  purchase: "/query/invoices/purchase",
  sold: "/query/invoices/sold",
  scoPurchase: "/sco-query/invoices/purchase",
  scoSold: "/sco-query/invoices/sold",
} as const;

// Endpoint công khai để probe khả năng tới máy chủ (không cần đăng nhập).
export const PUBLIC_PROBE_PATH = "/captcha" as const;

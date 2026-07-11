---
paths:
  - "apps/**/*.ts"
  - "packages/**/*.ts"
  - "packages/db/migrations/**"
---

# Luật: Cô lập đa khách hàng (multi-tenant)

Cụ thể hoá nguyên tắc "mọi truy vấn dữ liệu phải gắn tenant_id" trong Hiến pháp. Runtime: TypeScript trên Workers, Postgres qua Hyperdrive (xem ADR-0001).

## Bắt buộc

- Mọi bảng dữ liệu nghiệp vụ (hóa đơn, tài khoản thuế, lịch sử đồng bộ, log) phải có cột `tenant_id` không null.
- Mọi truy vấn Drizzle đọc/ghi dữ liệu nghiệp vụ phải lọc theo `tenant_id` của phiên hiện tại. Không viết truy vấn "lấy tất cả" rồi lọc ở tầng ứng dụng.
- Bật **Row-Level Security (RLS)** ở PostgreSQL làm lớp phòng thủ thứ hai (đặt `app.tenant_id` cho mỗi giao dịch), **không** thay thế cho lọc tường minh ở tầng ứng dụng.
- Khóa tự nhiên hóa đơn để upsert luôn bao gồm `tenant_id`: `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`. Không dùng khóa thiếu `tenant_id`.
- Session/token đăng nhập thuế gắn với đúng một `tenant_id`; không cho một tenant dùng token của tenant khác dù có quyền admin.
- Job nền (Queue/Workflow) **không có request context** → `tenant_id` phải nằm tường minh trong payload message/Workflow event, không suy đoán ngầm.
- Test phải có ít nhất một ca kiểm tra cách ly tenant: tạo 2 tenant, xác nhận tenant A không đọc được dữ liệu tenant B qua API.

## Khi gặp mơ hồ

Nếu một endpoint/worker/workflow mới chưa rõ cách xác định `tenant_id`, dừng và hỏi thay vì suy đoán — sai sót ở đây là rò rỉ dữ liệu giữa các khách hàng doanh nghiệp, rủi ro pháp lý cao nhất của SaaS này.

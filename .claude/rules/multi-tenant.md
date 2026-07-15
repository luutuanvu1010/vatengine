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
- RLS phải dùng cả `ENABLE` **và** `FORCE ROW LEVEL SECURITY`: `ENABLE` chỉ chi phối role KHÔNG-owner, `FORCE` mới bắt cả table owner tuân theo policy (chặn kịch bản kết nối bằng đúng role sở hữu bảng — mặc định phổ biến của Neon/Supabase). Ràng buộc vận hành: role app kết nối Hyperdrive (U6) **KHÔNG được là superuser** — superuser bỏ qua RLS kể cả FORCE. (Thiết lập ở U4: `packages/db/migrations`, kiểm bằng test cách ly cho cả role owner lẫn non-owner.)
- Khóa tự nhiên hóa đơn để upsert luôn bao gồm `tenant_id`: `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`. Không dùng khóa thiếu `tenant_id`.
- Session/token đăng nhập thuế gắn với đúng một `tenant_id`; không cho một tenant dùng token của tenant khác dù có quyền admin.
- Job nền (Queue/Workflow) **không có request context** → `tenant_id` phải nằm tường minh trong payload message/Workflow event, không suy đoán ngầm.
- Test phải có ít nhất một ca kiểm tra cách ly tenant: tạo 2 tenant, xác nhận tenant A không đọc được dữ liệu tenant B qua API.
- **Dọn trạng thái client khi đổi phiên (H-B.3):** mọi ranh giới đổi phiên/đổi tenant ở SPA (`apps/web`) phải xóa sạch dữ liệu tenant còn ở client — tối thiểu `queryClient.clear()` (cache React Query là singleton toàn app) và `clearInvoiceFilter()` (localStorage chứa MST tenant). Hiện đủ 3 ranh giới trong `features/auth/auth-context.tsx`: `logout`, `onUnauthorized` (401), đầu `login`. **Bất kỳ luồng đổi tenant MỚI nào** (vd "chuyển tenant" trong cùng phiên, đồng bộ token đa-tab) **bắt buộc gọi cùng bước dọn này** — nếu không, việc chưa gắn `tenant_id` vào `queryKey` sẽ thành lỗ hổng rò dữ liệu thật.

## Khi gặp mơ hồ

Nếu một endpoint/worker/workflow mới chưa rõ cách xác định `tenant_id`, dừng và hỏi thay vì suy đoán — sai sót ở đây là rò rỉ dữ liệu giữa các khách hàng doanh nghiệp, rủi ro pháp lý cao nhất của SaaS này.

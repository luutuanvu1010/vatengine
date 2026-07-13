import { sql } from "drizzle-orm";
import { type AnyPgColumn, pgPolicy } from "drizzle-orm/pg-core";

// Policy cách ly tenant (RLS) — lớp phòng thủ THỨ HAI ở tầng DB (multi-tenant.md).
// Chỉ thấy/ghi hàng có tenant khớp `app.tenant_id` của phiên (đặt qua withTenant).
// NULLIF(current_setting(..., true), '') → chuỗi rỗng/chưa đặt hóa NULL trước khi ép
// ::uuid: (a) so sánh NULL = 0 hàng (fail-closed), (b) tránh lỗi 22P02 khi GUC là ''
// (Postgres trả '' thay vì NULL sau khi một SET LOCAL đã kết thúc). KHÔNG thay cho lọc
// tenant_id tường minh ở tầng ứng dụng (U5/U6).
//
// drizzle-kit phát ENABLE ROW LEVEL SECURITY + CREATE POLICY từ khai báo này, NHƯNG
// KHÔNG phát `FORCE ROW LEVEL SECURITY` — ENABLE chỉ chi phối role KHÔNG-owner. Vì vậy
// migration bổ sung tay `FORCE` cho mọi bảng (để RLS ràng buộc cả table owner). Ràng
// buộc vận hành cứng: role app kết nối Hyperdrive (U6) KHÔNG được là owner-superuser —
// superuser bỏ qua RLS kể cả FORCE. Test 13 chứng minh cả owner lẫn non-owner bị chi phối.
const CURRENT_TENANT = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

export function tenantIsolationPolicy(tableName: string, tenantColumn: AnyPgColumn) {
  return pgPolicy(`${tableName}_tenant_isolation`, {
    as: "permissive",
    for: "all",
    using: sql`${tenantColumn} = ${CURRENT_TENANT}`,
    withCheck: sql`${tenantColumn} = ${CURRENT_TENANT}`,
  });
}

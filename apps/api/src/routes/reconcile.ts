// Route đối chiếu (U10): GET /reconcile — chạy module đối chiếu ON-READ trên hóa đơn ĐÃ
// đồng bộ (KHÔNG gọi GDT). Mọi truy vấn trong `withTenant` (RLS lớp 2) + lọc `tenant_id`
// tường minh trong @vat/reconcile/@vat/query (lớp 1). tenantId lấy từ JWT (requireTenant).
// Dùng bảng mã trạng thái MẶC ĐỊNH = production (RỖNG, chưa kiểm chứng — statusCodes.ts):
// endpoint KHÔNG "chốt" mã hủy/thay thế cho tới khi có probe.
import { withTenant } from "@vat/db";
import { invoiceFilterSchema } from "@vat/query";
import { reconcile } from "@vat/reconcile";
import { Hono } from "hono";
import { requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

export function reconcileRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  // JWT hợp lệ + RBAC: đối chiếu dành cho cả 3 vai (kế toán trở lên) — như tra cứu (U8).
  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan", "ke_toan_truong", "quan_tri"));

  // GET /reconcile — báo cáo đối chiếu theo cùng bộ lọc kỳ như /invoices.
  r.get("/", async (c) => {
    const filter = invoiceFilterSchema.safeParse(c.req.query());
    if (!filter.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const report = await withTenant(db, tenantId, (tx) => reconcile(tx, tenantId, filter.data));
      return c.json(report);
    } finally {
      await close();
    }
  });

  return r;
}

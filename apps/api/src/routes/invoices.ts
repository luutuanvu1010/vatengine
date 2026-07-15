// Route tra cứu hóa đơn (U6): list + summary + get-one. Chỉ ĐỌC dữ liệu đã đồng bộ
// (KHÔNG gọi GDT). Mọi truy vấn chạy trong `withTenant` (RLS lớp 2) + lọc `tenant_id`
// tường minh trong @vat/query (lớp 1). tenantId lấy từ JWT (middleware requireTenant).
import { withTenant } from "@vat/db";
import {
  getInvoiceById,
  getInvoiceLines,
  invoiceFilterSchema,
  listInvoices,
  pageSchema,
  summarizeInvoices,
} from "@vat/query";
import { Hono } from "hono";
import { isUuid, requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

export function invoicesRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  // Mọi route con của /invoices cần JWT hợp lệ (security.md). /health nằm ngoài (app.ts).
  // RBAC (U8): TRA CỨU dành cho cả 3 vai (kế toán trở lên) — ma trận quyền U8-plan.
  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan", "ke_toan_truong", "quan_tri"));

  // GET /invoices — danh sách + lọc + phân trang.
  r.get("/", async (c) => {
    const q = c.req.query();
    const filter = invoiceFilterSchema.safeParse(q);
    const page = pageSchema.safeParse(q);
    if (!filter.success || !page.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const result = await withTenant(db, tenantId, (tx) =>
        listInvoices(tx, tenantId, filter.data, page.data),
      );
      return c.json(result);
    } finally {
      await close();
    }
  });

  // GET /invoices/summary — tổng hợp (count + sum tiền) trên cùng bộ lọc. Đăng ký
  // TRƯỚC /:id để route tĩnh thắng route tham số.
  r.get("/summary", async (c) => {
    const filter = invoiceFilterSchema.safeParse(c.req.query());
    if (!filter.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const summary = await withTenant(db, tenantId, (tx) =>
        summarizeInvoices(tx, tenantId, filter.data),
      );
      return c.json(summary);
    } finally {
      await close();
    }
  });

  // GET /invoices/:id — một hóa đơn trong phạm vi tenant, KÈM mảng dòng hàng
  // (dong_hang_hoa) join theo hoadon_id, lọc tenant_id tường minh + RLS. Pipeline U5
  // nay có lấy dòng hàng 2 pha (ĐV3) nên bảng đã có dữ liệu để trả về.
  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    // id không phải UUID → request sai (tránh lỗi 22P02 ở Postgres).
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const result = await withTenant(db, tenantId, async (tx) => {
        const row = await getInvoiceById(tx, tenantId, id);
        if (!row) return null;
        const dongHangHoa = await getInvoiceLines(tx, tenantId, id);
        return { ...row, dongHangHoa };
      });
      if (!result) return c.json({ error: "not_found" }, 404);
      return c.json(result);
    } finally {
      await close();
    }
  });

  return r;
}

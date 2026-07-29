// Route tra cứu hóa đơn (U6): list + summary + get-one. Chỉ ĐỌC dữ liệu đã đồng bộ
// (KHÔNG gọi GDT). Mọi truy vấn chạy trong `withTenant` (RLS lớp 2) + lọc `tenant_id`
// tường minh trong @vat/query (lớp 1). tenantId lấy từ JWT (middleware requireTenant).
import { withTenant } from "@vat/db";
import {
  getInvoiceById,
  getInvoiceLines,
  invoiceFilterSchema,
  listInvoices,
  listKhachHang,
  pageSchema,
  sortSchema,
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
    // U31 — tham số sắp xếp. `sortBy` phải nằm trong ALLOWLIST của sortSchema; giá trị lạ
    // bị chặn ngay tại biên và KHÔNG BAO GIỜ chạm được vào ORDER BY (chống injection).
    const sort = sortSchema.safeParse(q);
    if (!filter.success || !page.success || !sort.success) {
      return c.json({ error: "bad_request" }, 400);
    }

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const result = await withTenant(db, tenantId, (tx) =>
        listInvoices(tx, tenantId, filter.data, page.data, sort.data),
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
  // GET /invoices/khach-hang — danh sách khách hàng (bên mua) để CHỌN khi tải hóa đơn
  // gốc (U37b). PHẢI đứng TRƯỚC "/:id": Hono khớp theo thứ tự khai báo, đặt sau thì
  // "khach-hang" bị nuốt thành `:id` rồi trượt kiểm UUID và trả 400 (đã có test canh).
  // Chỉ ĐỌC dữ liệu đã đồng bộ, không gọi GDT. Danh sách nhỏ (đo thật: 167 mục ở tenant
  // lớn nhất) nên trả trọn — lọc/tìm làm ở máy khách, không cần phân trang.
  r.get("/khach-hang", async (c) => {
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const result = await withTenant(db, tenantId, (tx) => listKhachHang(tx, tenantId));
      return c.json(result);
    } finally {
      await close();
    }
  });

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

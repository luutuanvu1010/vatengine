// U35 (A5) — tra cứu + đánh dấu đã đọc "thay đổi trạng thái hóa đơn" (badge/panel màn
// Tra cứu). CHỈ đọc kho nội bộ (lich_su_thay_doi_hoa_don, ghi bởi trigger DB) + đổi cờ
// da_doc — KHÔNG endpoint nào chạm GDT (không cần GdtTransport/xử lý 401 ở đơn vị này).
import { withTenant } from "@vat/db";
import {
  invoiceChangeFilterSchema,
  listInvoiceChanges,
  markInvoiceChangesRead,
  pageSchema,
} from "@vat/query";
import { Hono } from "hono";
import { z } from "zod";
import { requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

const markReadSchema = z.object({
  // Thiếu/rỗng = TẤT CẢ chưa đọc của tenant (mặc định "đánh dấu hết"). Mỗi phần tử PHẢI
  // là UUID hợp lệ ở biên — id lạ (không phải UUID) chạm SQL sẽ vỡ 22P02, chặn ở đây
  // trước khi tới @vat/query (cùng mẫu isUuid ở routes/invoices.ts:75).
  ids: z.array(z.string().uuid()).optional(),
});

export function invoiceChangesRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  // TRA CỨU dành cho cả 3 vai (kế toán trở lên) — cùng ma trận quyền /invoices, vì đây
  // là bề mặt "xem thay đổi" của chính màn tra cứu hóa đơn, không phải hành động quản trị.
  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan", "ke_toan_truong", "quan_tri"));

  // GET /invoices/changes — danh sách + lọc + phân trang + số chưa đọc (nguồn cho badge).
  r.get("/", async (c) => {
    const q = c.req.query();
    const filter = invoiceChangeFilterSchema.safeParse(q);
    const page = pageSchema.safeParse(q);
    if (!filter.success || !page.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const result = await withTenant(db, tenantId, (tx) =>
        listInvoiceChanges(tx, tenantId, filter.data, page.data),
      );
      return c.json(result);
    } finally {
      await close();
    }
  });

  // POST /invoices/changes/mark-read — chỉ đổi cờ da_doc; KHÔNG audit log (security.md
  // liệt kê đăng nhập thuế/đồng bộ/xuất dữ liệu/đổi cấu hình tenant — đánh dấu đã đọc
  // không thuộc nhóm nhạy cảm đó, cùng mức với các thao tác UI đọc-nhẹ khác).
  r.post("/mark-read", async (c) => {
    // Thân request RỖNG là hợp lệ (nút "đánh dấu tất cả đã đọc" không cần payload) →
    // {} (mark-all). Thân KHÔNG rỗng nhưng hỏng cú pháp JSON → 400 (lỗi client thật,
    // không đoán/nuốt êm — tránh vô tình đánh dấu nhầm "tất cả" khi client định gửi ids
    // cụ thể nhưng gõ sai).
    const raw = await c.req.text();
    let body: unknown = {};
    if (raw.trim().length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        return c.json({ error: "bad_request" }, 400);
      }
    }
    const parsed = markReadSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const markedCount = await withTenant(db, tenantId, (tx) =>
        markInvoiceChangesRead(tx, tenantId, parsed.data.ids),
      );
      return c.json({ ok: true, markedCount });
    } finally {
      await close();
    }
  });

  return r;
}

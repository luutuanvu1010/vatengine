// Route kết xuất hóa đơn (U7): tạo file xlsx/csv từ dữ liệu ĐÃ đồng bộ (KHÔNG gọi GDT),
// GHI ra R2, trả liên kết tải (chốt #1). Tải lại stream từ R2, GIỚI HẠN TENANT qua tiền
// tố key (chốt cách ly). Ghi audit "xuất dữ liệu" (chốt #4, security.md). Mọi truy vấn
// chạy trong `withTenant` (RLS lớp 2) + buildWhere lọc `tenant_id` tường minh (lớp 1).
import { auditLog, withTenant } from "@vat/db";
import {
  type ExportFormat,
  csvStream,
  isExportFormat,
  iterateInvoices,
  toXlsxFromBatches,
} from "@vat/export";
import { invoiceFilterSchema } from "@vat/query";
import { Hono } from "hono";
import { requireTenant } from "../auth";
import type { AppDeps, AppEnv } from "../types";

// id đối tượng kết xuất: "<uuid>.<xlsx|csv>". Dùng để dựng lại key theo tenant khi tải.
const EXPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(xlsx|csv)$/i;

const CONTENT_TYPE: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

// Key luôn mang tiền tố tenant → tải chỉ dựng key từ tenantId của CHÍNH người gọi ⇒
// một tenant không thể chạm object của tenant khác (cách ly — multi-tenant.md).
function exportKey(tenantId: string, id: string): string {
  return `exports/${tenantId}/${id}`;
}

export function exportsRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  // Mọi route cần JWT hợp lệ (security.md). tenantId lấy từ context (middleware).
  r.use("*", requireTenant);

  // POST /exports?format=xlsx|csv&<bộ lọc U6> — tạo file kết xuất (có side effect: ghi
  // R2 + audit) → dùng POST, không GET.
  r.post("/", async (c) => {
    const format = c.req.query("format");
    // Nguồn định dạng hợp lệ = @vat/export (không hardcode lại — tránh nguồn sự thật thứ hai).
    if (!isExportFormat(format)) return c.json({ error: "bad_request" }, 400);
    const filter = invoiceFilterSchema.safeParse(c.req.query());
    if (!filter.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const id = `${crypto.randomUUID()}.${format}`;
    const key = exportKey(tenantId, id);
    const storage = deps.getStorage(c.env);
    const { db, close } = await deps.getDb(c.env);
    try {
      await withTenant(db, tenantId, async (tx) => {
        const batches = iterateInvoices(tx, tenantId, filter.data);
        // CSV: stream thẳng vào R2 (không giữ cả file trong RAM). XLSX: gom (bản chất zip)
        // nhưng tiêu thụ generator lô-by-lô, không nạp cả tập ORM cùng lúc.
        if (format === "csv") {
          await storage.put(key, csvStream(batches));
        } else {
          await storage.put(key, await toXlsxFromBatches(batches));
        }
        // Audit "xuất dữ liệu" (append). KHÔNG log raw_json/token (security.md).
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "export",
          doiTuong: format,
          chiTiet: { key, filter: filter.data },
        });
      });
    } finally {
      await close();
    }
    return c.json({ id, key, url: `/exports/${id}` }, 201);
  });

  // GET /exports/:id — tải file từ R2, giới hạn tenant qua tiền tố key.
  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!EXPORT_ID_RE.test(id)) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const key = exportKey(tenantId, id);
    const bytes = await deps.getStorage(c.env).get(key);
    if (!bytes) return c.json({ error: "not_found" }, 404);

    const format: ExportFormat = id.endsWith(".xlsx") ? "xlsx" : "csv";
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE[format],
        "Content-Disposition": `attachment; filename="hoadon-${id}"`,
      },
    });
  });

  return r;
}

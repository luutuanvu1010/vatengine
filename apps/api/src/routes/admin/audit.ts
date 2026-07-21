// U18 — GET /admin/audit. Mở ĐƯỜNG ĐỌC `audit_log_admin` mà migration 0007 (U17a) cố ý
// để dành cho đơn vị này — xem chú thích cuối packages/db/src/schema/auditLogAdmin.ts:
// bảng khi đó chỉ có policy `FOR INSERT`, không policy SELECT nào, vì chưa có consumer
// thật (YAGNI). U18 là consumer đó.
//
// Đọc qua hàm `admin_doc_audit()` (owner BYPASSRLS) chứ KHÔNG thêm policy
// `FOR SELECT TO <role>`: giữ đúng nguyên tắc "bảng đóng, cửa hẹp" của cả đơn vị. Thêm
// policy SELECT sẽ mở bảng cho bất kỳ truy vấn nào của role đó, kể cả truy vấn viết nhầm
// ở một route khác; một hàm thì chỉ trả đúng những cột nó khai.
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireSuperAdmin } from "../../admin/requireSuperAdmin";
import type { AdminEnv, AppDeps } from "../../types";

export function adminAuditRoutes(deps: AppDeps) {
  const r = new Hono<AdminEnv>();
  r.use("*", requireSuperAdmin);

  r.get("/", async (c) => {
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    const { db, close } = await deps.getDb(c.env);
    try {
      // Trần/sàn được kẹp TRONG hàm SQL (greatest/least) — tham số vô lý không quét được
      // cả bảng. Ở đây chỉ lọc NaN để không truyền `null` làm hàm rơi về mặc định ngoài ý.
      const res = (await db.execute(sql`
        select * from admin_doc_audit(
          ${Number.isFinite(limit) ? limit : 50}::int,
          ${Number.isFinite(offset) ? offset : 0}::int)`)) as {
        rows: Array<Record<string, unknown>>;
      };
      const total = res.rows.length > 0 ? Number(res.rows[0]?.total) : 0;
      const items = res.rows.map(({ total: _bo, ...item }) => item);
      return c.json({ items, total });
    } finally {
      await close();
    }
  });

  return r;
}

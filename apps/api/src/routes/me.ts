// A1 (U15) — GET /me: hồ sơ tenant hiện tại (ten/mst/goiDichVu/banQuyen/ghiChu) + vai từ
// token. Đọc-only, cả 3 vai (chỉ requireTenant). Cách ly tenant: `tenant_id` LẤY TỪ TOKEN
// (không nhận từ client); truy vấn trong withTenant (RLS lớp 2) + lọc id tường minh (lớp
// 1). KHÔNG trả bí mật (không secret_ref/token thuế). Email không cần (client biết từ lúc
// đăng nhập).
// U17a-7 (QĐ-7) — thêm `goiDichVuTen` (nhãn tiếng Việt của gói) qua leftJoin sang bảng
// goi_dich_vu; `goiDichVu` giữ nguyên là MÃ. Không thêm trường nhạy cảm nào khác.
// U-b — PATCH /me: chỉ quan_tri sửa ten/ghiChu; RBAC 403; cách ly tenant; strict body;
// ghi 1 audit_log "cap_nhat_cau_hinh" (không lộ giá trị, chỉ tên trường).
import { auditLog, goiDichVu, tenants, withTenant } from "@vat/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

// Chỉ 2 trường sửa được. .strict() → khoá lạ (mst/banQuyen/email…) làm parse thất bại (400).
const patchMeSchema = z
  .object({
    ten: z.string().trim().min(1).max(200).optional(),
    ghiChu: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.ten !== undefined || v.ghiChu !== undefined, { message: "empty" });

export function meRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.use("*", requireTenant);

  r.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    const role = c.get("role");
    const { db, close } = await deps.getDb(c.env);
    try {
      const row = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .select({
            ten: tenants.ten,
            mst: tenants.mst,
            goiDichVu: tenants.goiDichVu,
            // U17a (QĐ-7) — cột `goi_dich_vu` nay giữ MÃ ('free'); nhãn tiếng Việt lấy từ
            // bảng gói để đổi tên gói chỉ sửa một chỗ. leftJoin: gói bị xóa không làm
            // hỏng /me (FK RESTRICT khiến ca này gần như không xảy ra, nhưng /me là
            // đường tải trang — không đánh đổi).
            goiDichVuTen: goiDichVu.ten,
            banQuyen: tenants.banQuyen,
            ghiChu: tenants.ghiChu,
          })
          .from(tenants)
          .leftJoin(goiDichVu, eq(tenants.goiDichVu, goiDichVu.ma))
          .where(eq(tenants.id, tenantId));
        return rows[0] ?? null;
      });
      if (!row) return c.json({ error: "not_found" }, 404);
      return c.json({
        ten: row.ten,
        mst: row.mst,
        goiDichVu: row.goiDichVu,
        goiDichVuTen: row.goiDichVuTen ?? row.goiDichVu,
        banQuyen: row.banQuyen,
        ghiChu: row.ghiChu,
        role,
      });
    } finally {
      await close();
    }
  });

  r.patch("/", requireRole("quan_tri"), async (c) => {
    const tenantId = c.get("tenantId");
    const role = c.get("role");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = patchMeSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const { db, close } = await deps.getDb(c.env);
    try {
      const row = await withTenant(db, tenantId, async (tx) => {
        const set: { ten?: string; ghiChu?: string | null } = {};
        if (parsed.data.ten !== undefined) set.ten = parsed.data.ten;
        if (parsed.data.ghiChu !== undefined) set.ghiChu = parsed.data.ghiChu;
        const updated = await tx
          .update(tenants)
          .set(set)
          .where(eq(tenants.id, tenantId))
          .returning({
            ten: tenants.ten,
            mst: tenants.mst,
            goiDichVu: tenants.goiDichVu,
            banQuyen: tenants.banQuyen,
            ghiChu: tenants.ghiChu,
          });
        // Audit "đổi cấu hình tenant" (append). chi_tiet chỉ TÊN trường, không giá trị.
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "cap_nhat_cau_hinh",
          doiTuong: "tenant",
          chiTiet: { fields: Object.keys(set) },
        });
        return updated[0] ?? null;
      });
      if (!row) return c.json({ error: "not_found" }, 404);
      return c.json({ ...row, role });
    } finally {
      await close();
    }
  });

  return r;
}

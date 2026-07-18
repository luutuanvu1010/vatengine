// U22 B6 — GET /backfill/:id: theo dõi tiến độ một backfill. Đọc ĐỊNH NGHĨA từ
// BackfillTracker DO (B4; phạm vi tenant — def tenant khác/không có → 404, không rò chéo
// tenant) rồi SUY trạng thái từng tháng (cho|dang_chay|xong|loi) + tổng từ `lan_dong_bo`
// (B6 monthlyBackfillStatus). Chỉ ĐỌC (không gọi GDT). tenantId lấy từ JWT (requireTenant).
import { withTenant } from "@vat/db";
import { monthlyBackfillStatus } from "@vat/sync";
import { Hono } from "hono";
import { isUuid, requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

export function backfillRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  // Đọc-only: cả 3 vai (kế toán trở lên) xem được tiến độ (như tra cứu hóa đơn).
  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan", "ke_toan_truong", "quan_tri"));

  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    if (!c.env.BACKFILL_TRACKER) return c.json({ error: "backfill_unavailable" }, 503);

    const tenantId = c.get("tenantId");
    // Đọc def có kiểm phạm vi tenant ngay ở DO (tenantId từ JWT, KHÔNG từ input client).
    const def = await deps.getBackfillTracker(c.env, id).get(tenantId);
    if (!def) return c.json({ error: "not_found" }, 404);

    const { db, close } = await deps.getDb(c.env);
    try {
      // `def.createdAtMs` (SỰ CỐ 2026-07-18): bỏ qua bản ghi THẤT BẠI CŨ hơn thời điểm
      // tạo backfill — không để lỗi của các lần chạy trước làm banner báo "loi" NGAY
      // khi bấm trong khi job mới còn chưa chạy.
      const progress = await withTenant(db, tenantId, (tx) =>
        monthlyBackfillStatus(
          tx,
          tenantId,
          def.taikhoanId,
          def.directions,
          def.months,
          def.createdAtMs,
        ),
      );
      return c.json({ backfillId: id, ...progress });
    } finally {
      await close();
    }
  });

  return r;
}

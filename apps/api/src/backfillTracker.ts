// U22 B4 — Logic THUẦN của tracker backfill (docs/plans/U22-plan.md §4C PA-A). Tách
// khỏi wiring Durable Object (backfillTrackerDO.ts) để test offline — cùng khuôn
// loginLimiter/loginLimiterDO. Tracker CHỈ lưu ĐỊNH NGHĨA một backfill (tháng nào thuộc
// yêu cầu này); tiến độ "xong/chưa" từng tháng được SUY từ `lan_dong_bo` ở tầng GET
// (B6) qua coveredMonths (B3) — nên KHÔNG cần consumer báo về DO (giữ nguyên pipeline
// U5, U22-plan §7).
import type { InvoiceDirection } from "@vat/gdt-client";

/** Định nghĩa một lần backfill do producer (B5) tạo. `tenantId` để chốt phạm vi khi
 * đọc (cách ly tenant). `months` = danh sách kỳ "YYYY-MM" đã enqueue (Task 7: không-force
 * là MỌI tháng trong khoảng, không còn lọc "còn thiếu"). `mode` (Task 7, optional — def cũ
 * trong DO trước Task 7 không có trường này, tương thích lùi): "delta" = đường mặc định
 * (enqueue audit mỗi tháng, tự quyết đủ/hụt ở consumer); "force" = đường legacy full-month
 * (header, bỏ coverage). initDef/readDef KHÔNG đọc trường này — chỉ mang theo để B6 (GET
 * /backfill/:id) dùng sau nếu cần phân biệt hiển thị. */
export interface BackfillDef {
  tenantId: string;
  taikhoanId: string;
  months: string[];
  directions: InvoiceDirection[];
  createdAtMs: number;
  mode?: "delta" | "force";
}

/** Kết quả khởi tạo store-once. `conflict` = backfillId đã thuộc TENANT KHÁC → KHÔNG
 * kèm def (không rò dữ liệu chéo tenant). */
export type InitResult =
  | { status: "created"; def: BackfillDef }
  | { status: "exists"; def: BackfillDef }
  | { status: "conflict" };

/**
 * Khởi tạo STORE-ONCE (idempotent) + CÁCH LY TENANT:
 * - chưa có def → `created` (producer B5 sẽ enqueue).
 * - đã có def CÙNG tenant → `exists`, GIỮ NGUYÊN def cũ (nền AC5: gọi trùng id không ghi
 *   đè danh sách tháng gốc → không enqueue lại vô hạn).
 * - đã có def của TENANT KHÁC (trùng backfillId UUID) → `conflict`, **KHÔNG echo def** của
 *   tenant kia (nhất quán với `readDef` — multi-tenant.md: không rò dữ liệu chéo tenant).
 */
export function initDef(existing: BackfillDef | undefined, incoming: BackfillDef): InitResult {
  if (!existing) return { status: "created", def: incoming };
  if (existing.tenantId !== incoming.tenantId) return { status: "conflict" };
  return { status: "exists", def: existing };
}

/**
 * Đọc def có kiểm PHẠM VI TENANT: def của tenant khác → `null` (KHÔNG rò tồn tại chéo
 * tenant — hành xử y như "không tồn tại"/404). Chưa init cũng `null`.
 */
export function readDef(
  stored: BackfillDef | undefined,
  requestingTenantId: string,
): BackfillDef | null {
  if (!stored) return null;
  if (stored.tenantId !== requestingTenantId) return null;
  return stored;
}

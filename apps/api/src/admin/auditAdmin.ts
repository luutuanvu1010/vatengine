// U18 — Đường GHI vào `audit_log_admin`. Bảng do U17a tạo (migration 0007) và cố ý để
// trống đường ghi cho tới U18 — xem chú thích ở packages/db/src/schema/auditLogAdmin.ts.
//
// VÌ SAO KHÔNG DÙNG `audit_log` (bảng audit của khách): bảng đó có `tenant_id NOT NULL` +
// FK cascade + policy RLS so `tenant_id` + trigger append-only. Một hành động XUYÊN-tenant
// của chủ phần mềm không có `tenant_id` hợp lệ để điền — và nếu điền đại tenant đích thì
// bản ghi sẽ BIẾN MẤT cùng tenant khi tenant đó bị xoá, đúng lúc ta cần nó nhất.
//
// Ghi trực tiếp bằng Drizzle (không qua hàm SECURITY DEFINER): 0007 đã mở sẵn
// `GRANT INSERT ... TO PUBLIC` + policy `FOR INSERT WITH CHECK(true)`, nên role app chèn
// được mà không cần mượn quyền. Đường ĐỌC mới là thứ phải đi qua `admin_doc_audit()`.
import { maskSensitive } from "@vat/crypto";
import { auditLogAdmin } from "@vat/db";
import type { AnyDb } from "../types";

export interface GhiAuditAdminArgs {
  /** Động từ ổn định, dùng để lọc/thống kê sau này. vd `duyet_tenant`, `admin_login`. */
  hanhDong: string;
  /** Đối tượng bị tác động — thường là tenant id. NULL cho hành động không nhắm ai. */
  doiTuong?: string | null;
  /** Id super-admin (`sub` của token). Với login thất bại thì chưa biết ai ⇒ "khong_xac_dinh". */
  nguoiThucHien: string;
  /** Ghi CŨ → MỚI (QĐ-6), không chỉ tên trường. Luôn đi qua maskSensitive. */
  chiTiet?: unknown;
}

/**
 * Ghi một dòng nhật ký quản trị.
 *
 * `maskSensitive` áp cho MỌI lời gọi, kể cả khi nơi gọi tin rằng `chiTiet` của mình sạch.
 * Đây là phòng thủ chiều sâu chứ không phải hoài nghi người viết: các hàm gọi sẽ được sửa
 * bởi người khác, sau này, và mặc định an toàn phải nằm ở đây — không ở kỷ luật của từng
 * nơi gọi. Riêng mật khẩu tạm (QĐ-1) thì KHÔNG BAO GIỜ được truyền vào đây ngay từ đầu:
 * nó là chuỗi 6 chữ số, `maskSensitive` không có cách nào nhận ra để che.
 */
export async function ghiAuditAdmin(db: AnyDb, args: GhiAuditAdminArgs): Promise<void> {
  await db.insert(auditLogAdmin).values({
    hanhDong: args.hanhDong,
    doiTuong: args.doiTuong ?? null,
    nguoiThucHien: args.nguoiThucHien,
    chiTiet: (args.chiTiet === undefined ? null : maskSensitive(args.chiTiet)) as never,
  });
}

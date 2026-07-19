import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// U17a — Gói dịch vụ. Bảng TOÀN CỤC: KHÔNG có tenant_id, nên KHÔNG dùng
// tenantIsolationPolicy. Đây là bảng đầu tiên của dự án như vậy ⇒ RLS + quyền phải làm
// TAY trong migration 0007 (drizzle chỉ phát ENABLE RLS cho bảng có khai báo policy).
//
// Hạn mức đọc từ đây thay hardcode (thay getGioiHanTkThue cũ). Ngưỡng gh_* là hạng A
// (QĐ-5) — Admin sửa tự do ở U18; hạng B'/C chống tấn công và nhịp GDT KHÔNG nằm ở đây.
export const goiDichVu = pgTable("goi_dich_vu", {
  ma: text("ma").primaryKey(),
  ten: text("ten").notNull(),
  soMstToiDa: integer("so_mst_toi_da").notNull().default(1),
  // NULL = không giới hạn số hóa đơn/tháng.
  soHoaDonThang: integer("so_hoa_don_thang"),
  choTaiKhoanCon: boolean("cho_tai_khoan_con").notNull().default(false),
  ghInvoicesMoiPhut: integer("gh_invoices_moi_phut").notNull().default(120),
  ghExportsMoiPhut: integer("gh_exports_moi_phut").notNull().default(20),
  ghReconcileMoiPhut: integer("gh_reconcile_moi_phut").notNull().default(20),
  capNhatLuc: timestamp("cap_nhat_luc", { withTimezone: true }).notNull().defaultNow(),
});

import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { taiKhoanThue } from "./taiKhoanThue";
import { tenants } from "./tenants";

/**
 * Tập trạng thái hợp lệ của một lần đồng bộ (`lan_dong_bo.trang_thai`).
 *
 * Cột là `text` (KHÔNG enum cứng ở DB) — object này là NGUỒN CHÂN LÝ DÙNG CHUNG
 * cho tầng đồng bộ (`packages/sync`) và worker nền (`apps/sync-worker`), để mọi
 * nơi ghi cùng một tập giá trị thay vì rải literal. Migration `0004` gắn
 * `COMMENT ON COLUMN` tài liệu hoá đúng tập này ở tầng DB (không thêm CHECK để
 * còn dung nạp giá trị nghiệp vụ tương lai mà không cần migration khoá cứng).
 *
 * - `running`              : đang chạy.
 * - `completed`            : hoàn thành trọn vẹn (mọi nhánh OK).
 * - `hoan_thanh_mot_phan`  : hoàn thành MỘT PHẦN — phần thành công đã lưu, có
 *                            nhánh lỗi thật (vd sco lỗi ≠404) cần retry riêng.
 * - `failed`               : thất bại (không lưu được kết quả dùng được).
 * - `can_dang_nhap_lai`    : dừng vì hết phiên/token (SESSION_EXPIRED).
 */
export const TRANG_THAI_LAN_DONG_BO = {
  DANG_CHAY: "running",
  HOAN_THANH: "completed",
  HOAN_THANH_MOT_PHAN: "hoan_thanh_mot_phan",
  THAT_BAI: "failed",
  CAN_DANG_NHAP_LAI: "can_dang_nhap_lai",
} as const;

export type TrangThaiLanDongBo =
  (typeof TRANG_THAI_LAN_DONG_BO)[keyof typeof TRANG_THAI_LAN_DONG_BO];

// Nhật ký một lần đồng bộ (một chiều, một khoảng ngày). U5 ghi số HĐ mới/cập nhật;
// U9 (nền) đọc để tiếp tục/giám sát. Lịch sử có phiên bản = truy vấn lại theo tenant.
export const lanDongBo = pgTable(
  "lan_dong_bo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taikhoanId: uuid("taikhoan_id")
      .notNull()
      .references(() => taiKhoanThue.id, { onDelete: "cascade" }),
    chieu: text("chieu").notNull(), // 'purchase' | 'sold'
    tuNgay: timestamp("tu_ngay", { withTimezone: true }).notNull(),
    denNgay: timestamp("den_ngay", { withTimezone: true }).notNull(),
    soHdMoi: integer("so_hd_moi").notNull().default(0),
    soHdCapNhat: integer("so_hd_cap_nhat").notNull().default(0),
    trangThai: text("trang_thai").notNull().default("running"),
    thongDiepLoi: text("thong_diep_loi"),
    batDau: timestamp("bat_dau", { withTimezone: true }).notNull().defaultNow(),
    ketThuc: timestamp("ket_thuc", { withTimezone: true }),
  },
  (t) => [tenantIsolationPolicy("lan_dong_bo", t.tenantId)],
);

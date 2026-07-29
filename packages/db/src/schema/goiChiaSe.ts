import {
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { nguoiDung } from "./nguoiDung";
import { tenants } from "./tenants";

/** Trạng thái một gói chia sẻ. Nguồn chân lý ở tầng ứng dụng (text ở DB, không enum cứng)
 * — cùng quy ước `lan_dong_bo.trang_thai`, `tep_hoa_don_goc.trang_thai`. */
export const TRANG_THAI_GOI_CHIA_SE = ["dang_tao", "san_sang", "loi", "da_thu_hoi"] as const;
export type TrangThaiGoiChiaSe = (typeof TRANG_THAI_GOI_CHIA_SE)[number];

// U37b — sổ theo dõi các gói hóa đơn gốc đã phát hành qua LINK CÔNG KHAI (bucket
// `vat-chia-se` gắn `docs.tourdao.vn`, hạn ~30 ngày).
//
// Bảng này nhạy cảm hơn `tep_hoa_don_goc`: nó trỏ tới file nằm NGOÀI hàng rào RLS/JWT.
// Sau khi phát hành, ai có khóa là tải được — không còn cửa nào chặn. Vì vậy:
//  - `khoa_r2` DUY NHẤT TOÀN CỤC (không chỉ trong tenant): trùng khóa nghĩa là một link
//    mở ra gói của tenant khác. Đây là ràng buộc AN TOÀN, không phải chuyện gọn gàng.
//  - KHÔNG cấp quyền DELETE cho role ứng dụng: thu hồi = xóa object R2 + đổi `trang_thai`,
//    giữ nguyên hàng để còn vết "ai đã phát hành link nào" khi cần điều tra lộ dữ liệu.
export const goiChiaSe = pgTable(
  "goi_chia_se",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    /** Khóa object trong bucket công khai: `goi-hoa-don/<YYYY-MM>/<token ≥128-bit>.zip`.
     * TUYỆT ĐỐI không chứa MST/tên doanh nghiệp/khoảng ngày — khóa LÀ thứ bảo vệ file. */
    khoaR2: text("khoa_r2").notNull(),
    /** MST khách hàng của gói này (QĐ-B2: mỗi gói đúng một khách hàng). */
    nmmst: text("nmmst").notNull(),
    /** Khoảng ngày lập hóa đơn. QĐ-B9: KHÔNG cho trống — không phát gói phủ cả lịch sử. */
    tuNgay: date("tu_ngay").notNull(),
    denNgay: date("den_ngay").notNull(),
    soHoaDon: integer("so_hoa_don").notNull().default(0),
    kichThuoc: integer("kich_thuoc"),
    /** Người bấm phát hành. FK ĐƠN (không ghép same-tenant) vì `nguoi_dung` chưa có
     * UNIQUE(tenant_id, id) — thêm ràng buộc đó là sửa bảng khác, ngoài phạm vi U37b.
     * Rủi ro còn lại nhỏ và đã có lớp chắn: `tenant_id` của chính hàng này vẫn bị RLS
     * ép, và `audit_log` ghi độc lập ai phát hành. Ghi nhận để không quên. */
    nguoiTao: uuid("nguoi_tao"),
    taoLuc: timestamp("tao_luc", { withTimezone: true }).notNull().defaultNow(),
    /** Mốc hết hạn dự kiến. Việc xóa THẬT do R2 Lifecycle làm (QĐ-6) và Cloudflare chỉ
     * bảo đảm xóa "trong vòng 24h sau mốc" ⇒ giao diện phải nói "khoảng 30 ngày". */
    hetHanLuc: timestamp("het_han_luc", { withTimezone: true }).notNull(),
    /** TRANG_THAI_GOI_CHIA_SE. */
    trangThai: text("trang_thai").notNull(),
    maLoi: text("ma_loi"),
  },
  (t) => [
    // AN TOÀN: duy nhất TOÀN CỤC, không phải theo tenant. Xem chú thích đầu bảng.
    unique("goi_chia_se_khoa_r2_unique").on(t.khoaR2),
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "goi_chia_se_tenant_id_tenants_id_fk",
    }).onDelete("cascade"),
    // Người dùng bị xóa vẫn giữ được bản ghi gói (chỉ mất tên người tạo) — không để mất
    // vết một link công khai đã từng phát hành.
    foreignKey({
      columns: [t.nguoiTao],
      foreignColumns: [nguoiDung.id],
      name: "goi_chia_se_nguoi_tao_fk",
    }).onDelete("set null"),
    // Màn "gói đã phát hành" liệt kê theo tenant, mới nhất trước.
    index("goi_chia_se_tenant_taoluc_idx").on(t.tenantId, t.taoLuc),
    tenantIsolationPolicy("goi_chia_se", t.tenantId),
  ],
);

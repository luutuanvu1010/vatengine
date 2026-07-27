import {
  boolean,
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
import { hoaDon } from "./hoaDon";
import { lanDongBo } from "./lanDongBo";

/** Trường trạng thái theo dõi (A3.1) — chỉ hai trường này tính là "thay đổi" (A2#3,
 * số tiền để v2). */
export const TRUONG_LICH_SU_HOP_LE = ["ttxly", "tthai"] as const;
export type TruongLichSu = (typeof TRUONG_LICH_SU_HOP_LE)[number];

/** Tên ràng buộc UNIQUE khử trùng redelivery (A3.1) — CHỈ an toàn nếu trigger INSERT
 * dùng `ON CONFLICT DO NOTHING` (bắt buộc, xem migration). */
export const LICH_SU_THAY_DOI_UNIQUE_CONSTRAINT = "lich_su_thay_doi_hoa_don_natural_key";

// U35 (A3.1) — nhật ký MỖI LẦN một trường trạng thái hóa đơn đổi giá trị. Ghi bởi
// trigger DB `hoa_don_ghi_lich_su_thay_doi` (migration, gần dữ liệu nhất → phủ mọi
// đường ghi: `sync()` cũ, delta-sync `syncChunk`, VÀ đường race `onConflictDoUpdate`).
// Bất biến TRỪ `da_doc` (đánh dấu đã đọc cho badge — cột DUY NHẤT được UPDATE).
export const lichSuThayDoiHoaDon = pgTable(
  "lich_su_thay_doi_hoa_don",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // KHÔNG `.references(tenants.id)` trực tiếp: `hoa_don_id` NOT NULL nên FK composite
    // (tenant_id, hoa_don_id) → hoa_don(tenant_id, id) bên dưới đã RÀNG BUỘC tenant_id
    // hợp lệ một cách bắc cầu (hoa_don.tenant_id tự nó đã FK tới tenants) — thêm FK
    // trực tiếp là dư thừa (CASCADE khi xóa tenant cũng đã bắc cầu qua hoa_don).
    tenantId: uuid("tenant_id").notNull(),
    hoaDonId: uuid("hoa_don_id").notNull(),
    /** 'ttxly' | 'tthai' (TRUONG_LICH_SU_HOP_LE) — text ở DB (không enum cứng), cùng
     * quy ước với `lan_dong_bo.trang_thai` (nguồn chân lý ở tầng ứng dụng). */
    truong: text("truong").notNull(),
    giaTriCu: integer("gia_tri_cu"),
    giaTriMoi: integer("gia_tri_moi"),
    /** Phiên đồng bộ phát hiện thay đổi — NULL nếu biến phiên chưa đặt lúc UPDATE
     * xảy ra (guard `_rls.ts`-style, không ném lỗi). */
    lanDongBoId: uuid("lan_dong_bo_id"),
    phatHienLuc: timestamp("phat_hien_luc", { withTimezone: true }).notNull().defaultNow(),
    /** Cột DUY NHẤT được UPDATE (đánh dấu đã đọc cho badge/panel). */
    daDoc: boolean("da_doc").notNull().default(false),
  },
  (t) => [
    // Idempotent chống redelivery Queue (cùng lan_dong_bo_id) — PHẢI đi kèm
    // `ON CONFLICT DO NOTHING` ở trigger, nếu không redelivery vỡ unique → rollback
    // cả chunk (review B3, U35-plan.md A3.1).
    unique(LICH_SU_THAY_DOI_UNIQUE_CONSTRAINT).on(t.hoaDonId, t.truong, t.giaTriMoi, t.lanDongBoId),
    // FK composite same-tenant (review C5) — KHÔNG dùng FK đơn `hoa_don_id → hoa_don.id`
    // (không ép cùng tenant). Cascade: hóa đơn bị xóa → lịch sử của nó biến mất theo
    // (cùng chính sách dongHangHoa → hoaDon).
    foreignKey({
      columns: [t.tenantId, t.hoaDonId],
      foreignColumns: [hoaDon.tenantId, hoaDon.id],
      name: "lich_su_thay_doi_hoa_don_hoa_don_fk",
    }).onDelete("cascade"),
    // FK composite same-tenant cho phiên đồng bộ — set null nếu phiên bị xóa (không
    // có đường xóa `lan_dong_bo` trong sản phẩm hiện tại, phòng thủ thuần).
    foreignKey({
      columns: [t.tenantId, t.lanDongBoId],
      foreignColumns: [lanDongBo.tenantId, lanDongBo.id],
      name: "lich_su_thay_doi_hoa_don_lan_dong_bo_fk",
    }).onDelete("set null"),
    // Badge/panel: đếm + liệt kê chưa đọc mới nhất của tenant (A7 — nhiễu hiệu năng).
    index("lich_su_thay_doi_hoa_don_badge_idx").on(t.tenantId, t.daDoc, t.phatHienLuc),
    tenantIsolationPolicy("lich_su_thay_doi_hoa_don", t.tenantId),
  ],
);

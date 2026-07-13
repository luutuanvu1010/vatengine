import { index, integer, jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { hoaDon } from "./hoaDon";
import { tenants } from "./tenants";

// Chi tiết từng dòng hàng hóa/dịch vụ của một hóa đơn (ánh xạ từ mapDetailLines, U3).
// Có `tenant_id` TRỰC TIẾP (không chỉ qua join hoa_don) để RLS + lọc tường minh
// (multi-tenant.md). Thuế suất giữ KÉP: `ltsuat` chuỗi + `tsuat` số (bằng chứng U3).
export const dongHangHoa = pgTable(
  "dong_hang_hoa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hoaDonId: uuid("hoadon_id")
      .notNull()
      .references(() => hoaDon.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    stt: integer("stt"),
    ten: text("ten"),
    dvtinh: text("dvtinh"),
    sluong: numeric("sluong"),
    dgia: numeric("dgia"),
    thtien: numeric("thtien"),
    // ltsuat: chuỗi hiển thị ("8%"/"KCT"/"KKKNT") — ép số làm mất mã chữ (U3).
    ltsuat: text("ltsuat"),
    // tsuat: số thập phân (0.08).
    tsuat: numeric("tsuat"),
    // Tiền thuế riêng của dòng — mục 7.1 gọi `tsuat_tien`, adapter U3 trả `tthue`.
    tsuatTien: numeric("tsuat_tien"),
    rawJson: jsonb("raw_json").notNull(),
  },
  (t) => [
    index("dong_hang_hoa_hoadon_idx").on(t.hoaDonId),
    tenantIsolationPolicy("dong_hang_hoa", t.tenantId),
  ],
);

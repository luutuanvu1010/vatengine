import {
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

/** Trạng thái một bản ghi hồ sơ gốc. Nguồn chân lý ở tầng ứng dụng (text ở DB, không
 * enum cứng) — cùng quy ước `lan_dong_bo.trang_thai`, `lich_su_thay_doi_hoa_don.truong`. */
export const TRANG_THAI_TEP_GOC = ["da_tai", "khong_co_ho_so_goc", "loi"] as const;
export type TrangThaiTepGoc = (typeof TRANG_THAI_TEP_GOC)[number];

// U37a — sổ theo dõi HỒ SƠ GỐC của từng hóa đơn: bản XML có chữ ký số do người bán
// phát hành, tải từ GDT qua `getInvoiceOriginalZip()` rồi lưu ở R2 (bucket NỘI BỘ
// `vat-raw`). Hồ sơ gốc BẤT BIẾN ⇒ tải một lần dùng mãi; bảng này là thứ trả lời
// "hóa đơn nào đã có rồi" để không gọi lại máy chủ thuế (U37 §4.7).
//
// Vì sao lưu KHÓA R2 thay vì suy ra từ quy ước đặt tên: quy ước có thể đổi, còn object
// đã ghi thì không tự đổi tên theo. Suy ra khóa sẽ làm mồ côi toàn bộ file cũ ngay lần
// đổi quy ước đầu tiên; lưu tường minh giữ kho R2 luôn tra ngược được từ DB.
//
// Vì sao CHỈ hai file: ZIP GDT trả về có 5 file, nhưng 3 trong đó (`details.js`,
// `viewinvoice-bg.jpg`, `sign-check.jpg`) GIỐNG HỆT NHAU ở mọi hóa đơn và chiếm ~86%
// dung lượng. Lưu chúng theo từng hóa đơn thì 33.945 hóa đơn tốn ~10,5 GB thay vì
// ~1,4 GB (U37 §4.7 hệ quả 2) — giữ MỘT bộ dùng chung, không lưu ở đây.
export const tepHoaDonGoc = pgTable(
  "tep_hoa_don_goc",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // KHÔNG FK trực tiếp tới `tenants`: FK composite (tenant_id, hoa_don_id) bên dưới
    // đã ràng buộc tenant_id hợp lệ một cách bắc cầu (hoa_don.tenant_id tự nó FK tới
    // tenants), và CASCADE khi xóa tenant cũng bắc cầu qua hoa_don. Cùng lập luận
    // `lich_su_thay_doi_hoa_don`.
    tenantId: uuid("tenant_id").notNull(),
    hoaDonId: uuid("hoa_don_id").notNull(),
    /** Khóa object R2 của `invoice.xml` — NULL khi GDT không có hồ sơ gốc hoặc khi lỗi. */
    khoaXml: text("khoa_xml"),
    /** Khóa object R2 của `invoice.html` (bản thể hiện GDT dựng sẵn). NULL như trên. */
    khoaHtml: text("khoa_html"),
    kichThuocXml: integer("kich_thuoc_xml"),
    kichThuocHtml: integer("kich_thuoc_html"),
    /** TRANG_THAI_TEP_GOC. `khong_co_ho_so_goc` là kết quả HỢP LỆ, không phải sự cố —
     * GDT trả HTTP 500 + "Không tồn tại hồ sơ gốc của hóa đơn." cho ~19,9% hóa đơn
     * `purchase/normal` (U37 §4.6). Phân biệt với `loi` để không retry vô ích. */
    trangThai: text("trang_thai").notNull(),
    /** Mã lỗi adapter khi thất bại (`NO_SOURCE_DOCUMENT` | `HTTP_ERROR` | …). */
    maLoi: text("ma_loi"),
    /** Thời điểm tải thành công. NULL khi chưa/không tải được. */
    taiLuc: timestamp("tai_luc", { withTimezone: true }),
    ngayTao: timestamp("ngay_tao", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Một hóa đơn đúng MỘT bản ghi — nền của upsert idempotent: job chạy lại (hoặc
    // Queue redelivery) chỉ cập nhật, không nhân đôi.
    unique("tep_hoa_don_goc_tenant_hoa_don_unique").on(t.tenantId, t.hoaDonId),
    // FK composite same-tenant — FK đơn trên `hoa_don_id` KHÔNG ép cùng tenant (đúng lỗ
    // hổng mà `dong_hang_hoa` phải tự bịt bằng code ở packages/sync/src/detailLines.ts).
    // Cascade: xóa hóa đơn → xóa bản ghi tệp gốc, không để hàng mồ côi trỏ vào R2.
    foreignKey({
      columns: [t.tenantId, t.hoaDonId],
      foreignColumns: [hoaDon.tenantId, hoaDon.id],
      name: "tep_hoa_don_goc_hoa_don_fk",
    }).onDelete("cascade"),
    // Job nền hỏi liên tục "tenant này còn hóa đơn nào chưa tải?" → lọc theo
    // (tenant_id, trang_thai).
    index("tep_hoa_don_goc_tenant_trangthai_idx").on(t.tenantId, t.trangThai),
    tenantIsolationPolicy("tep_hoa_don_goc", t.tenantId),
  ],
);

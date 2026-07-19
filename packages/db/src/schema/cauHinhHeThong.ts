import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// U17a (QĐ-5 hạng B) — Cấu hình TOÀN CỤC dạng key/value. Chỗ hợp lẽ cho ngưỡng không
// thuộc tenant nào: rate-limit đăng ký theo IP xảy ra khi CHƯA có tenant nào tồn tại,
// nên không thể sống trong bảng có tenant_id.
//
// `gia_tri` là TEXT có chủ ý (không jsonb, không cột số): mọi resolveXxxConfig hiện nhận
// Record<string, string | undefined> và đã có fail-safe về DEFAULT — giữ text cho phép
// TÁI DÙNG NGUYÊN các hàm thuần đã test, chỉ đổi NGUỒN nạp.
//
// KHÔNG chứa ngưỡng hạng B' (chống dò mật khẩu) và hạng C (nhịp gọi GDT) — hai hạng đó
// giữ trong env, không đưa lên bảng điều khiển (QĐ-5).
export const cauHinhHeThong = pgTable("cau_hinh_he_thong", {
  khoa: text("khoa").primaryKey(),
  giaTri: text("gia_tri").notNull(),
  moTa: text("mo_ta"),
  capNhatLuc: timestamp("cap_nhat_luc", { withTimezone: true }).notNull().defaultNow(),
});

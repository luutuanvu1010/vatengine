import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// Tài khoản đăng nhập cơ quan thuế của một tenant. RANH GIỚI PHÁP LÝ (security.md):
// KHÔNG lưu mật khẩu thuế thô — chỉ `secret_ref` (tham chiếu bí mật đã mã hóa) và
// token JWT do GDT cấp (mã hóa tại nghỉ, vòng đời ngắn, có `token_het_han`).
export const taiKhoanThue = pgTable(
  "tai_khoan_thue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    loai: text("loai").notNull().default("chinh"), // 'chinh' | 'con'
    // Tham chiếu tới bí mật đã mã hóa (KMS/Vault) — KHÔNG phải mật khẩu thô.
    secretRef: text("secret_ref"),
    // Token JWT GDT — mã hóa tại nghỉ, vòng đời ngắn. U12: envelope encryption qua
    // seam `tokenVault` (storeToken/readToken, @vat/crypto). Giá trị lưu là chuỗi
    // sealed `v1$aesgcm$…`, KHÔNG phải token thô.
    tokenHienTai: text("token_hien_tai"),
    tokenHetHan: timestamp("token_het_han", { withTimezone: true }),
    // U14 — mốc ủy quyền tenant (NĐ 13/2023). null = CHƯA ủy quyền → chặn login GDT.
    uyQuyenLuc: timestamp("uy_quyen_luc", { withTimezone: true }),
    ngayTao: timestamp("ngay_tao", { withTimezone: true }).notNull().defaultNow(),
  },
  // U23-D: chống trùng tài khoản thuế trong một tenant (khớp migration 0006). Cùng tenant
  // nhưng username khác (tài khoản con "abcd-001") vẫn hợp lệ.
  (t) => [
    tenantIsolationPolicy("tai_khoan_thue", t.tenantId),
    uniqueIndex("tai_khoan_thue_tenant_username_unique").on(t.tenantId, t.username),
  ],
);

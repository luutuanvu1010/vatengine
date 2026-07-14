import { maskSensitive } from "@vat/crypto";
// U9 — Ghi vết job đồng bộ nền vào DB (lan_dong_bo + audit_log) + đánh dấu token
// chết. MỌI truy cập tenant-scoped qua withTenant (RLS, lớp phòng thủ 2) + lọc
// tường minh tenant_id (multi-tenant.md). KHÔNG lưu mật khẩu/không log token
// (security.md). loadAccountToken chỉ đọc trạng thái token (đủ để pre-flight).
//
// U12 — chi_tiet audit đi qua maskSensitive trước khi ghi (che credential nếu lỡ lọt
// vào chuỗi lỗi). Token tại nghỉ: seam mã hóa `@vat/db` storeToken/readToken.
//
// U14 — loadAccountToken nối vào readToken (giải mã tại nghỉ). Cột
// `tai_khoan_thue.token_hien_tai` lưu chuỗi sealed `v1$aesgcm$…`; readToken tự
// tenant-scoped (withTenant) + giải mã (openSecret) nên hàm dưới đây trả TOKEN
// THẬT cho runJob gửi GDT, không còn trả thẳng chuỗi sealed.
import { auditLog, lanDongBo, readToken, taiKhoanThue, withTenant } from "@vat/db";
import { and, eq } from "drizzle-orm";
import { parseDdmmyyyy } from "./schedule";
import type { AccountToken, AnyDb, JobRecorder, SyncJobMessage } from "./types";

/** Trạng thái lan_dong_bo khi bỏ qua vì token hết hạn (cần người dùng đăng nhập lại). */
export const TRANG_THAI_CAN_DANG_NHAP_LAI = "can_dang_nhap_lai";
/** Hành động audit khi job phát hiện cần đăng nhập lại. */
export const AUDIT_HANH_DONG_REAUTH = "dong_bo_can_dang_nhap_lai";
/** Hành động audit khi bỏ qua tick vì circuit breaker mở. */
export const AUDIT_HANH_DONG_BREAKER_SKIP = "dong_bo_bo_qua_breaker";

/** Đọc + giải mã token của một tài khoản (tenant-scoped). null nếu tài khoản không có
 * hoặc chưa có token. `kekB64` là secret KEK (Workers Secret, security.md). */
export async function loadAccountToken(
  db: AnyDb,
  msg: SyncJobMessage,
  kekB64: string,
): Promise<AccountToken | null> {
  // readToken tự tenant-scoped (withTenant) + giải mã (openSecret). Trả null nếu chưa
  // có token/không thuộc tenant. tokenHienTai giờ là TOKEN THẬT (đã giải mã), không sealed.
  const dec = await readToken(db, msg.tenantId, msg.taikhoanId, kekB64);
  if (!dec) return null;
  return { tokenHienTai: dec.token, tokenHetHan: dec.tokenHetHan };
}

export function dbRecorder(db: AnyDb): JobRecorder {
  return {
    async reauthPreflight(msg, reason) {
      await withTenant(db, msg.tenantId, async (tx) => {
        const now = new Date();
        // Ghi MỘT phiên lan_dong_bo "cần đăng nhập lại" (nhật ký có phiên bản, P7).
        await tx.insert(lanDongBo).values({
          tenantId: msg.tenantId,
          taikhoanId: msg.taikhoanId,
          chieu: msg.direction,
          tuNgay: parseDdmmyyyy(msg.dateFrom),
          denNgay: parseDdmmyyyy(msg.dateTo),
          soHdMoi: 0,
          soHdCapNhat: 0,
          trangThai: TRANG_THAI_CAN_DANG_NHAP_LAI,
          thongDiepLoi: reason,
          batDau: now,
          ketThuc: now,
        });
        await tx.insert(auditLog).values({
          tenantId: msg.tenantId,
          hanhDong: AUDIT_HANH_DONG_REAUTH,
          doiTuong: msg.taikhoanId,
          // U12: mask chi_tiet trước khi ghi (security.md) — reason có thể chứa
          // chuỗi lỗi kèm credential.
          chiTiet: maskSensitive({ reason, period: msg.period, phase: "preflight" }),
        });
      });
    },

    async reauthRuntime(msg, reason) {
      await withTenant(db, msg.tenantId, async (tx) => {
        // GDT từ chối token (401) dù đồng hồ nói còn hạn → token đã chết. Xóa token
        // để tick sau pre-flight bỏ qua sạch, KHÔNG gọi GDT với token chết nữa.
        // sync() đã ghi lan_dong_bo(failed) — không ghi trùng phiên ở đây.
        await tx
          .update(taiKhoanThue)
          .set({ tokenHienTai: null, tokenHetHan: null })
          .where(and(eq(taiKhoanThue.id, msg.taikhoanId), eq(taiKhoanThue.tenantId, msg.tenantId)));
        await tx.insert(auditLog).values({
          tenantId: msg.tenantId,
          hanhDong: AUDIT_HANH_DONG_REAUTH,
          doiTuong: msg.taikhoanId,
          chiTiet: maskSensitive({ reason, period: msg.period, phase: "runtime" }),
        });
      });
    },

    async breakerSkip(msg) {
      await withTenant(db, msg.tenantId, async (tx) => {
        await tx.insert(auditLog).values({
          tenantId: msg.tenantId,
          hanhDong: AUDIT_HANH_DONG_BREAKER_SKIP,
          doiTuong: msg.taikhoanId,
          chiTiet: maskSensitive({ period: msg.period }),
        });
      });
    },
  };
}

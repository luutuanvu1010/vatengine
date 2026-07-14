// RBAC phía client — PHẢN CHIẾU apps/api/src/rbac.ts (nguồn chân lý ở server). Guard
// client CHỈ là UX (ẩn/khóa nút); server vẫn là biên tin cậy (BINDING_MAP §6). Vai:
// ke_toan < ke_toan_truong < quan_tri.
import type { Role } from "../types/api";

const PRIVILEGED: readonly Role[] = ["ke_toan_truong", "quan_tri"];

/** Kết xuất/Convert/Tải (/exports*) — chỉ ke_toan_truong + quan_tri (ke_toan → 403). */
export function canExport(role: Role): boolean {
  return PRIVILEGED.includes(role);
}

/** Kết nối tài khoản thuế (/tax-accounts*) — chỉ ke_toan_truong + quan_tri. */
export function canManageTaxAccounts(role: Role): boolean {
  return PRIVILEGED.includes(role);
}

/** Nhãn vai hiển thị (tiếng Việt). */
export function labelRole(role: Role): string {
  switch (role) {
    case "ke_toan":
      return "Kế toán";
    case "ke_toan_truong":
      return "Kế toán trưởng";
    case "quan_tri":
      return "Quản trị";
  }
}

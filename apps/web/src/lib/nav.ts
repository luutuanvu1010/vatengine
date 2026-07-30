import type { Role } from "../types/api";
// U41 — NGUỒN SỰ THẬT DUY NHẤT cho điều hướng ứng dụng.
//
// Ba bề mặt cùng đọc từ đây: thanh bên (`components/layout/Sidebar.tsx`), Footer bốn cột
// (`components/layout/Footer.tsx`) và khối "Lối tắt" ở Tổng quan. Trước U41 danh sách này là
// hằng riêng tư trong `Sidebar.tsx`; thêm Footer mà không tách ra là tự nhận việc chép tay ba
// nơi — và ba nơi rồi sẽ lệch. Sửa ở đây, cả ba tự hưởng.
//
// HAI CƠ CHẾ ẨN, CỐ Ý KHÔNG TRỘN (giữ nguyên kỷ luật của `Sidebar.tsx` cũ):
//
//   • `visible` — RBAC theo VAI. Trang ĐÃ phát hành, nhưng vai này không được xem.
//     Phản chiếu RBAC server (BINDING_MAP §6); guard client chỉ là UX, server vẫn là biên
//     tin cậy.
//   • Cờ tính năng (`featureFlags.ts`) — trang CHƯA phát hành. Không vai nào xem được, kể cả
//     quản trị. Hiện thực bằng spread có điều kiện ngay trong mảng, KHÔNG nhét vào `visible`.
//
// Trộn hai thứ vào một trường sẽ làm mờ nghĩa của cả hai: trang ẩn vì chưa phát hành trông
// giống hệt trang bị chặn vì thiếu quyền, và người sửa sau sẽ không biết gỡ cái nào.
import { SHOW_EXPORTS, SHOW_RECONCILE } from "./featureFlags";
import { vi } from "./i18n/vi";
import { canExport, canManageTaxAccounts } from "./rbac";

export interface NavItem {
  to: string;
  /** Nhãn hiển thị — LUÔN lấy từ `i18n/vi.ts`, không gõ chuỗi rời tại đây. */
  label: string;
  /** Guard hiển thị theo vai (undefined = mọi vai). CHỈ dành cho RBAC — xem đầu tệp. */
  visible?: (role: Role) => boolean;
  /** Khớp chính xác đường dẫn (dành cho "/" khỏi khớp mọi trang con). */
  end?: boolean;
}

export const NAV_CHINH: readonly NavItem[] = [
  { to: "/", label: vi.navDashboard, end: true },
  { to: "/invoices", label: vi.navInvoices },
  ...(SHOW_RECONCILE ? [{ to: "/reconcile", label: vi.navReconcile }] : []),
  { to: "/lien-ket", label: vi.navLienKet },
  ...(SHOW_EXPORTS ? [{ to: "/exports", label: vi.navExports, visible: canExport }] : []),
  { to: "/tax-accounts", label: vi.navTaxAccounts, visible: canManageTaxAccounts },
];

export const NAV_HE_THONG: readonly NavItem[] = [
  { to: "/settings", label: vi.navSettings },
  { to: "/gioi-thieu", label: vi.navAbout },
];

/** Lọc theo vai. Trả mảng MỚI — không đụng vào nguồn (nhiều bề mặt cùng đọc một mảng). */
export function navHienThi(items: readonly NavItem[], role: Role): NavItem[] {
  return items.filter((it) => !it.visible || it.visible(role));
}

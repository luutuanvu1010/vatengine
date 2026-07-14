// Chuỗi tiếng Việt (i18n — tiếng Việt trước, ADR-0003). Khung đơn giản: một từ điển
// phẳng; mở rộng đa ngữ sau (English "sắp có"). Dùng qua `t(key)`.
export const vi = {
  brand: "VATEngine",
  brandTagline: "Tra cứu, kết xuất & đối chiếu hóa đơn điện tử",
  loading: "Đang tải…",
  empty: "Chưa có dữ liệu",
  errorTitle: "Đã xảy ra lỗi",
  retry: "Thử lại",
  // trạng thái phiên
  sessionExpired: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  forbidden: "Bạn không có quyền thực hiện thao tác này.",
  notFound: "Không tìm thấy.",
  networkError: "Không kết nối được máy chủ. Kiểm tra mạng và thử lại.",
  // điều hướng
  navDashboard: "Tổng quan",
  navInvoices: "Danh sách hóa đơn",
  navReconcile: "Đối chiếu",
  navExports: "Kết xuất & Convert",
  navTaxAccounts: "Kết nối tài khoản thuế",
  navSettings: "Cài đặt chung",
  logout: "Đăng xuất",
} as const;

export type I18nKey = keyof typeof vi;
export function t(key: I18nKey): string {
  return vi[key];
}

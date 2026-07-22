// U19 — Kiểu khớp hợp đồng Admin API (U18). Nguồn sự thật là `apps/api/src/routes/admin/*`
// và các hàm SQL ở `packages/db/migrations/0011_super_admin.sql`; file này chỉ mô tả lại.

/** Khớp máy trạng thái U18 (`apps/api/src/admin/tenantStateMachine.ts`). */
export const TRANG_THAI_TENANT = ["cho_duyet", "active", "khoa", "tu_choi"] as const;
export type TrangThaiTenant = (typeof TRANG_THAI_TENANT)[number];

export interface TenantRow {
  id: string;
  ten: string;
  mst: string;
  trang_thai: string;
  goi_dich_vu: string;
  ngay_tao: string;
  /** Email tài khoản chính — hàm SQL trả NULL nếu tenant chưa có người dùng nào. */
  email: string | null;
}

export interface DanhSachTenant {
  items: TenantRow[];
  total: number;
}

export interface NguoiDungRow {
  id: string;
  email: string;
  vai_tro: string;
  ngay_tao: string;
  phai_doi_mat_khau: boolean;
  da_dat_mat_khau: boolean;
}

export interface TaiKhoanThueRow {
  id: string;
  username: string;
  loai: string;
  /** CHỈ hạn token, KHÔNG bao giờ có token thô — U18 cố ý không trả (security.md). */
  token_het_han: string | null;
}

export interface ChiTietTenant {
  id: string;
  ten: string;
  mst: string;
  trang_thai: string;
  goi_dich_vu: string;
  ghi_chu: string | null;
  ngay_tao: string;
  nguoi_dung: NguoiDungRow[];
  tai_khoan_thue: TaiKhoanThueRow[];
  dong_bo_gan_nhat: {
    bat_dau: string;
    ket_thuc: string | null;
    trang_thai: string;
    so_hd_moi: number;
    so_hd_cap_nhat: number;
  } | null;
}

/**
 * Phản hồi của `duyet` và `gui-link-dat-mat-khau` (QĐ-14).
 *
 * KHÔNG còn `mat_khau_tam`. Trước Lát cắt 3, chủ dự án nhìn thấy mật khẩu 6 chữ số của
 * khách rồi tự chuyển cho họ qua điện thoại/Zalo. Giờ hệ thống gửi thư kèm liên kết, và
 * thứ duy nhất Cổng Admin biết là thư ĐÃ ĐI HAY CHƯA.
 *
 * `da_gui_thu` phải được hiện ra, không được nuốt: nó `false` nghĩa là khách sẽ không bao
 * giờ nhận được gì, và chủ dự án là người duy nhất có thể phát hiện.
 */
export interface KetQuaGuiThuDatMatKhau {
  ok: true;
  trang_thai?: TrangThaiTenant;
  /** Địa chỉ thư đã gửi tới — để chủ dự án đối chiếu đúng người. */
  email: string;
  da_gui_thu: boolean;
  /** Mốc hết hạn của liên kết (72 giờ). */
  het_han: string;
}

export interface AuditRow {
  id: string;
  hanh_dong: string;
  doi_tuong: string | null;
  nguoi_thuc_hien: string;
  chi_tiet: unknown;
  tao_luc: string;
}

export interface AuditPage {
  items: AuditRow[];
  total: number;
}

/** Trạng thái hạn token GDT, suy từ `token_het_han` (U18 §5). Ngưỡng "sắp hết" = 24h. */
export type TinhTrangToken = "con_han" | "sap_het" | "het_han" | "chua_ket_noi";

export function tinhTrangToken(hetHan: string | null, bayGio = new Date()): TinhTrangToken {
  if (!hetHan) return "chua_ket_noi";
  const con = new Date(hetHan).getTime() - bayGio.getTime();
  if (con <= 0) return "het_han";
  return con < 24 * 3600_000 ? "sap_het" : "con_han";
}

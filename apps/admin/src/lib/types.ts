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
 * Phản hồi của `duyet` và `reset-mat-khau` (QĐ-1).
 *
 * `mat_khau_tam` chỉ tồn tại trong ĐÚNG phản hồi này — DB giữ bản băm nên không endpoint
 * nào đọc lại được. Mất là phải `reset-mat-khau` để cấp mã mới.
 */
export interface KetQuaCapMatKhau {
  ok: true;
  trang_thai?: TrangThaiTenant;
  mat_khau_tam: string;
  email: string;
  mat_khau_tam_het_han: string;
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

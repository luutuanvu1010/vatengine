// U18 — Máy trạng thái vòng đời tenant. NGUỒN CHÂN LÝ DUY NHẤT ở tầng ứng dụng cho câu
// hỏi "chuyển này có hợp lệ không". Logic THUẦN: không I/O, không DB, không Hono — để
// route và test cùng bám một chỗ, và để phủ được toàn bộ bảng chân lý bằng test unit rẻ.
//
// HAI TẦNG ÉP, CÓ CHỦ Ý: file này ép ở tầng ứng dụng; hàm SQL `admin_doi_trang_thai_tenant`
// (migration 0011) ép lần nữa bằng `WHERE trang_thai = tu` — chuyển sai không cập nhật hàng
// nào. Không tin một tầng: tầng ứng dụng có thể bị một route mới đi vòng qua, còn mệnh đề
// WHERE thì đi cùng mọi đường ghi.
//
// Cột `tenants.trang_thai` là `text` KHÔNG có CHECK (khớp tiền lệ 0004 "cột text không
// CHECK — không khoá cứng enum"), nên tập hợp lệ chỉ tồn tại ở đây và trong hàm SQL.

/** Tập trạng thái vòng đời tenant. Khớp giá trị thật đang chạy production sau U17b
 * (`apps/api/src/routes/auth.ts` — chỉ `active` đăng nhập được). */
export const TRANG_THAI_TENANT = ["active", "cho_duyet", "khoa", "tu_choi"] as const;
export type TrangThaiTenant = (typeof TRANG_THAI_TENANT)[number];

/** Hành động super-admin trên vòng đời tenant. Tên khớp path route:
 * `duyet` → POST /admin/tenants/:id/duyet, `mo_khoa` → …/mo-khoa. */
export const HANH_DONG_ADMIN = ["duyet", "tu_choi", "khoa", "mo_khoa"] as const;
export type HanhDongAdmin = (typeof HANH_DONG_ADMIN)[number];

// Chỉ liệt kê ô HỢP LỆ. Mọi thứ không có mặt ở đây là không hợp lệ — bảng khai theo hướng
// allowlist để việc thêm một trạng thái mới sau này KHÔNG vô tình mở thêm đường chuyển.
const CHUYEN_HOP_LE: ReadonlyArray<readonly [TrangThaiTenant, HanhDongAdmin, TrangThaiTenant]> = [
  ["cho_duyet", "duyet", "active"],
  ["cho_duyet", "tu_choi", "tu_choi"],
  ["active", "khoa", "khoa"],
  ["khoa", "mo_khoa", "active"],
];

/**
 * Trả trạng thái ĐÍCH nếu `hanhDong` hợp lệ trên `tu`, ngược lại `null` (route → 409).
 *
 * Fail-closed với đầu vào lạ: `tu` không thuộc `TRANG_THAI_TENANT` (dữ liệu cũ/hỏng trong
 * DB — cột không có CHECK) trả `null` chứ không ném. Một trạng thái ta không hiểu thì
 * không được phép thao tác lên, nhưng nó cũng không nên làm sập cả route liệt kê.
 *
 * `tu_choi` không xuất hiện ở vế trái ô nào ⇒ là trạng thái CUỐI. Chủ ý: tenant đã bị chối
 * từ không hồi sinh bằng một cú bấm nhầm trong Cổng Admin — muốn nhận lại thì đăng ký lại.
 */
export function chuyenTrangThai(
  tu: TrangThaiTenant,
  hanhDong: HanhDongAdmin,
): TrangThaiTenant | null {
  const o = CHUYEN_HOP_LE.find(([tuHopLe, hd]) => tuHopLe === tu && hd === hanhDong);
  return o ? o[2] : null;
}

/** Ép kiểu có kiểm tra cho giá trị đọc từ DB / path param. Dùng ở ranh giới route. */
export function laTrangThaiTenant(v: unknown): v is TrangThaiTenant {
  return typeof v === "string" && (TRANG_THAI_TENANT as readonly string[]).includes(v);
}

export function laHanhDongAdmin(v: unknown): v is HanhDongAdmin {
  return typeof v === "string" && (HANH_DONG_ADMIN as readonly string[]).includes(v);
}

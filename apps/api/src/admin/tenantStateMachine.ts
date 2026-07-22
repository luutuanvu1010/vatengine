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
export const TRANG_THAI_TENANT = [
  "active",
  // U34c — trạng thái ĐẦU TIÊN của mọi hồ sơ tự đăng ký. Khách chưa bấm link trong thư
  // thì admin CHƯA nhìn thấy và CHƯA bị làm phiền (QĐ-15): xác thực email là bộ lọc đặt
  // trước người thật, nếu không kênh báo của chủ dự án thành đích spam.
  "cho_xac_thuc_email",
  "cho_duyet",
  "khoa",
  "tu_choi",
] as const;
export type TrangThaiTenant = (typeof TRANG_THAI_TENANT)[number];

/** Hành động super-admin trên vòng đời tenant. Tên khớp path route:
 * `duyet` → POST /admin/tenants/:id/duyet, `mo_khoa` → …/mo-khoa. */
export const HANH_DONG_ADMIN = ["duyet", "tu_choi", "khoa", "mo_khoa"] as const;
export type HanhDongAdmin = (typeof HANH_DONG_ADMIN)[number];

// Chỉ liệt kê ô HỢP LỆ. Mọi thứ không có mặt ở đây là không hợp lệ — bảng khai theo hướng
// allowlist để việc thêm một trạng thái mới sau này KHÔNG vô tình mở thêm đường chuyển.
const CHUYEN_HOP_LE: ReadonlyArray<readonly [TrangThaiTenant, HanhDongAdmin, TrangThaiTenant]> = [
  // U34c — `cho_xac_thuc_email` KHÔNG xuất hiện ở vế trái ô nào, tức nằm HOÀN TOÀN NGOÀI
  // bề mặt thao tác của admin. Không phải thiếu sót:
  //   • Theo QĐ-15, admin còn chẳng NHÌN THẤY hồ sơ chưa xác thực — cho họ một nút bấm lên
  //     thứ họ không thấy là vô nghĩa.
  //   • Đường ra duy nhất của trạng thái này là do CHÍNH KHÁCH bấm link (hàm DB
  //     `xac_thuc_email_dung`), còn dọn hồ sơ chết là việc của U34f (`da_xoa`).
  //   • Và quan trọng nhất: thêm ô ở đây sẽ cho `tu_choi` HAI trạng thái nguồn, phá vỡ giả
  //     định một-nguồn mà `chuyenTuHanhDong` dựa vào — nền của câu UPDATE nguyên tử ở
  //     route. Test `chuyenTuHanhDong` đã bắt đúng điều này khi tôi thử thêm vào.
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

/**
 * Trạng thái NGUỒN và ĐÍCH của một hành động. Mỗi hành động chỉ hợp lệ từ ĐÚNG MỘT trạng
 * thái nguồn (xem `CHUYEN_HOP_LE`), nên cặp này suy được từ riêng hành động.
 *
 * VÌ SAO QUAN TRỌNG: route không cần đọc trạng thái hiện tại rồi mới ghi — nó gọi thẳng
 * `admin_doi_trang_thai_tenant(id, tu, den)` với `WHERE trang_thai = tu`. Một câu UPDATE
 * NGUYÊN TỬ, không có khe hở đọc-rồi-ghi. Hai super-admin bấm "Duyệt" cùng lúc thì người
 * thứ hai cập nhật 0 hàng và nhận 409, thay vì cả hai cùng đọc 'cho_duyet' rồi cùng ghi.
 */
export function chuyenTuHanhDong(hanhDong: HanhDongAdmin): {
  tu: TrangThaiTenant;
  den: TrangThaiTenant;
} {
  const o = CHUYEN_HOP_LE.find(([, hd]) => hd === hanhDong);
  // Không thể xảy ra khi `hanhDong` đã qua `laHanhDongAdmin` — nhưng ném rõ ràng còn hơn
  // trả undefined rồi dựng ra một câu UPDATE thiếu điều kiện.
  if (!o) throw new Error(`hành động không có trong máy trạng thái: ${hanhDong}`);
  return { tu: o[0], den: o[2] };
}

/** Ép kiểu có kiểm tra cho giá trị đọc từ DB / path param. Dùng ở ranh giới route. */
export function laTrangThaiTenant(v: unknown): v is TrangThaiTenant {
  return typeof v === "string" && (TRANG_THAI_TENANT as readonly string[]).includes(v);
}

export function laHanhDongAdmin(v: unknown): v is HanhDongAdmin {
  return typeof v === "string" && (HANH_DONG_ADMIN as readonly string[]).includes(v);
}

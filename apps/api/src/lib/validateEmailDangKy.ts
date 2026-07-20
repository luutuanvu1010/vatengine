// U17b (§3.4) — Validate email đăng ký công khai. Hàm THUẦN, không side-effect.
//
// THỨ TỰ KIỂM CÓ CHỦ Ý (dạng → alias '+' → miền dùng-1-lần → allowlist đuôi): mỗi tầng chặn
// một kiểu lạm dụng khác, và thứ tự quyết định thông báo người dùng nhận được. Ví dụ
// "a+x@mailinator.com" sai CẢ HAI cách — báo 'alias_cong' trước vì đó là thứ người dùng
// hợp pháp sửa được ngay; báo 'mien_dung_mot_lan' cho một người dùng thật đang lỡ gõ dấu
// cộng thì họ không hiểu phải làm gì.
//
// Đây KHÔNG phải hàng rào tuyệt đối — chỉ nâng chi phí lạm dụng. Cổng thật là bước Admin
// duyệt ở U18.
import { DISPOSABLE_DOMAINS } from "./disposableDomains";

// Đuôi miền được phép. Thứ tự trong mảng KHÔNG ảnh hưởng kết quả vì dùng .some() — mỗi miền
// khớp được một hoặc nhiều đuôi (ví dụ "abc.com.vn" khớp cả ".com.vn" lẫn ".vn", cả hai cho
// kết quả hợp lệ). Sắp xếp chỉ để dễ theo dõi. Hộp thư phổ thông (gmail.com, yahoo.com...)
// được chấp nhận tự nhiên qua đuôi ".com", không cần liệt kê riêng.
const DUOI_CHO_PHEP: readonly string[] = [
  "com.vn",
  "net.vn",
  "org.vn",
  "edu.vn",
  "gov.vn",
  "com",
  "net",
  "org",
  "vn",
  "biz",
  "info",
  "co",
];

export type KetQuaValidate =
  | { ok: true }
  | {
      ok: false;
      ly_do: "dang_sai" | "alias_cong" | "mien_dung_mot_lan" | "mien_khong_duoc_phep";
    };

// Cố ý CHẶT hơn RFC 5322: chỉ chấp nhận dạng thông dụng. Đường đăng ký công khai không cần
// đỡ mọi biến thể hợp lệ về lý thuyết; chặt hơn = ít bề mặt lạm dụng hơn.
const DANG_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function validateEmailDangKy(email: string): KetQuaValidate {
  const e = email.trim().toLowerCase();
  if (!DANG_EMAIL.test(e)) return { ok: false, ly_do: "dang_sai" };

  const [phanTen, mien] = e.split("@") as [string, string];
  if (phanTen.includes("+")) return { ok: false, ly_do: "alias_cong" };
  if (DISPOSABLE_DOMAINS.has(mien)) return { ok: false, ly_do: "mien_dung_mot_lan" };

  const hopLe = DUOI_CHO_PHEP.some((d) => mien.endsWith(`.${d}`));
  return hopLe ? { ok: true } : { ok: false, ly_do: "mien_khong_duoc_phep" };
}

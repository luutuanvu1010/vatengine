// Chuẩn hóa chuỗi tiếng Việt — dùng CHUNG cho web (tìm kiếm) và server (đặt tên tệp).
//
// Đặt ở gói dùng chung thay vì nhân đôi: chỗ xử lý `Đ` bên dưới là loại dễ làm sai và
// dễ để hai bản lệch nhau — một bản sửa, bản kia quên.
//
// Vì sao cần: người dùng gõ nhanh thì hiếm khi bỏ dấu đúng — gõ "cong ty tour dao" phải ra
// "CÔNG TY TNHH TOUR ĐẢO". Không có bước này thì ô tìm live gần như vô dụng với tên tiếng Việt.

/**
 * Bỏ dấu + hạ chữ thường + gom khoảng trắng.
 *
 * ⚠️ `normalize("NFD")` tách được dấu thanh/dấu mũ (Ô → O + ̂) nhưng **KHÔNG tách được `Đ/đ`**
 * (U+0110/U+0111 là chữ cái riêng, không phải D + dấu). Thiếu bước thay tường minh thì gõ
 * "dao" sẽ không ra "ĐẢO" — mất luôn những khách hàng có chữ Đ trong tên.
 */
export function boDau(s: string): string {
  return (
    s
      .normalize("NFD")
      // Dùng thuộc tính Unicode `\p{Diacritic}` thay lớp [\u0300-\u036f]: diễn đạt đúng ý
      // "mọi dấu phụ" và tránh cảnh báo `noMisleadingCharacterClass` (lớp ký tự chứa dấu tổ
      // hợp bị coi là nhập nhằng vì có thể cắt đôi một ký tự hiển thị).
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
  );
}

/**
 * Chuỗi người dùng gõ có khớp một mục không. Khớp CHỨA (không chỉ đầu chuỗi) để gõ "tnhh"
 * ra được "CÔNG TY TNHH ABC". Gõ rỗng ⇒ khớp mọi mục (hiện cả danh sách).
 */
export function khopTim(daGo: string, mucTieu: string): boolean {
  const tim = boDau(daGo);
  if (tim === "") return true;
  return boDau(mucTieu).includes(tim);
}

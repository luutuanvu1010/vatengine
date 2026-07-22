// U34c — Địa chỉ gốc của SPA khách hàng, dùng để dựng liên kết trong thư.
//
// Đặt riêng một file vì nó được dùng ở NHIỀU đường thư (xác thực email, đặt mật khẩu ở
// U34d), và một liên kết sai trong thư là kiểu hỏng không sửa lại được: thư đã gửi đi rồi.
//
// Mặc định `https://vatengine.tourdao.vn` thay vì để rỗng: liên kết tương đối trong thư
// KHÔNG dùng được (trình đọc thư không có gốc nào để nối vào), nên rỗng nghĩa là mọi lá
// thư đều mang một liên kết chết. Sai tên miền còn sửa được bằng một biến môi trường; gửi
// đi hàng loạt liên kết chết thì không.
export function urlWeb(env: { URL_WEB?: string }): string {
  const v = env.URL_WEB?.trim();
  return v && v.length > 0 ? v : "https://vatengine.tourdao.vn";
}

// U34c — Nội dung thư gửi khách.
//
// Nguyên tắc chung cho mọi lá thư của hệ thống này:
//   • KHÔNG hứa điều chưa làm được. Trước U34, trang đăng ký từng suýt hứa "sẽ gửi email
//     thông báo" trong khi hạ tầng email chưa tồn tại — hứa một bức thư không bao giờ tới
//     là cách chắc chắn nhất để mất niềm tin ngay lần đầu khách chạm vào sản phẩm.
//   • Luôn có CẢ bản HTML và bản văn bản thuần. Chỉ gửi HTML làm điểm spam tăng, và người
//     dùng trình đọc thư thuần văn bản sẽ nhận được một khoảng trống.
//   • Nói rõ vì sao họ nhận được thư này, và phải làm gì nếu không phải họ đăng ký.

import type { ThuCanGui } from "./types";

/** Thoát ký tự cho HTML. Tên doanh nghiệp do NGƯỜI LẠ nhập vào form đăng ký công khai —
 * đây là đường tiêm thật, không phải lo xa. */
function thoat(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const KHUNG_HTML = (noiDung: string) => `<!doctype html>
<html lang="vi"><body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2328">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<div style="font-size:20px;font-weight:800;margin-bottom:20px">VATEngine</div>
${noiDung}
<hr style="border:0;border-top:1px solid #e6e8eb;margin:24px 0">
<div style="font-size:13px;line-height:1.6;color:#6b7280">
Bạn nhận được thư này vì địa chỉ của bạn vừa được dùng để đăng ký VATEngine.
Nếu không phải bạn, hãy bỏ qua thư này — sẽ không có tài khoản nào được kích hoạt.
</div>
</div></body></html>`;

export function thuXacThucEmail(
  tenDoanhNghiep: string,
  lienKet: string,
): ThuCanGui & { den: string } {
  const html = KHUNG_HTML(`
<p style="font-size:16px;line-height:1.6;margin:0 0 16px">
Cảm ơn bạn đã đăng ký cho <strong>${thoat(tenDoanhNghiep)}</strong>.
</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 24px">
Vui lòng xác nhận đây đúng là địa chỉ email của bạn:
</p>
<p style="margin:0 0 24px">
<a href="${thoat(lienKet)}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:16px">Xác nhận địa chỉ email</a>
</p>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0 0 8px">
Liên kết có hiệu lực trong <strong>24 giờ</strong> và chỉ dùng được một lần.
</p>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0">
Nếu nút trên không bấm được, sao chép liên kết này vào trình duyệt:<br>
<span style="word-break:break-all">${thoat(lienKet)}</span>
</p>`);

  // Bản văn bản thuần KHÔNG phải bản rút gọn cho có — nó phải tự đủ nghĩa, vì với một số
  // người đây là bản DUY NHẤT họ đọc được.
  const text = [
    `Cảm ơn bạn đã đăng ký VATEngine cho ${tenDoanhNghiep}.`,
    "",
    "Vui lòng xác nhận đây đúng là địa chỉ email của bạn bằng cách mở liên kết sau:",
    lienKet,
    "",
    "Liên kết có hiệu lực trong 24 giờ và chỉ dùng được một lần.",
    "",
    "Nếu không phải bạn đăng ký, hãy bỏ qua thư này — sẽ không có tài khoản nào được kích hoạt.",
  ].join("\n");

  return { den: "", tieuDe: "Xác nhận địa chỉ email — VATEngine", html, text };
}

/**
 * Lát cắt 3 (QĐ-14) — Thư gửi khi chủ dự án bấm Duyệt.
 *
 * ⚠️ Thư này KHÔNG chứa mật khẩu, và đó là điểm cốt lõi của QĐ-14. Trước Lát cắt 3, chủ
 * dự án nhìn thấy mật khẩu 6 chữ số của khách rồi tự gửi qua Zalo/điện thoại. Mã 6 số ra
 * đời CHỈ vì phải đọc qua điện thoại; khi hệ thống tự gửi được thư thì lý do đó biến mất
 * và chỉ còn lại điểm yếu (10^6 khả năng). Gửi mã 6 số qua email là giữ nguyên điểm yếu
 * mà vứt đi lý do duy nhất biện minh cho nó.
 */
export function thuDatMatKhau(
  tenDoanhNghiep: string,
  lienKet: string,
): ThuCanGui & { den: string } {
  const html = KHUNG_HTML(`
<p style="font-size:16px;line-height:1.6;margin:0 0 16px">
Hồ sơ của <strong>${thoat(tenDoanhNghiep)}</strong> đã được duyệt.
</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 24px">
Bước cuối: đặt mật khẩu để đăng nhập.
</p>
<p style="margin:0 0 24px">
<a href="${thoat(lienKet)}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:16px">Đặt mật khẩu</a>
</p>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0 0 8px">
Liên kết có hiệu lực trong <strong>72 giờ</strong> và chỉ dùng được một lần.
Quá hạn thì liên hệ chúng tôi để nhận liên kết mới.
</p>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0">
Nếu nút trên không bấm được, sao chép liên kết này vào trình duyệt:<br>
<span style="word-break:break-all">${thoat(lienKet)}</span>
</p>`);

  // Bản văn bản thuần phải TỰ ĐỦ NGHĨA — với một số người đây là bản DUY NHẤT họ đọc được.
  const text = [
    `Hồ sơ VATEngine của ${tenDoanhNghiep} đã được duyệt.`,
    "",
    "Bước cuối: đặt mật khẩu để đăng nhập, bằng cách mở liên kết sau:",
    lienKet,
    "",
    "Liên kết có hiệu lực trong 72 giờ và chỉ dùng được một lần.",
    "Quá hạn thì liên hệ chúng tôi để nhận liên kết mới.",
  ].join("\n");

  return { den: "", tieuDe: "Đặt mật khẩu cho tài khoản VATEngine", html, text };
}

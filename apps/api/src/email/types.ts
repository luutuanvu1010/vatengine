// U34b (ADR-0007) — Hợp đồng gửi thư, tách khỏi nhà cung cấp cụ thể.
//
// Cùng khuôn mẫu `GdtTransport` (`gdt-adapter.md`): logic nghiệp vụ KHÔNG được gọi thẳng
// `fetch()` tới SES. Ranh giới này còn gánh một việc nữa — `aws4fetch` đã hai năm không ra
// bản mới; nếu có ngày nó hỏng thì thay bằng ~60 dòng SigV4 tự viết chỉ đụng MỘT file.

export interface ThuCanGui {
  /** Địa chỉ nhận. Đúng MỘT người — không gửi hàng loạt từ đường này. */
  den: string;
  tieuDe: string;
  /** Phải có CẢ hai dạng. Chỉ gửi HTML làm điểm spam tăng, và người dùng trình đọc thư
   * thuần văn bản sẽ nhận được một khoảng trống. */
  html: string;
  text: string;
}

/**
 * Vì sao phân biệt tới bảy lý do thay vì một cờ `thành công/thất bại`: chỗ gọi xử lý chúng
 * KHÁC NHAU về bản chất, và gộp lại sẽ che mất đúng những ca cần con người can thiệp.
 */
export type LyDoKhongGui =
  /** Thiếu biến môi trường. Lỗi triển khai, không phải lỗi người dùng. */
  | "chua_cau_hinh"
  /** Tên miền của người nhận không nhận được thư. Chặn TRƯỚC khi gọi SES — đây là chốt
   * chính giữ tỉ lệ bounce thấp, tức giữ cho tài khoản SES không bị AWS đình chỉ. */
  | "mien_khong_nhan_thu"
  /** SES từ chối chính lá thư (`MessageRejected`). Thường là lỗi nội dung của ta. */
  | "dia_chi_bi_tu_choi"
  /** Tên miền GỬI chưa xác minh (`MailFromDomainNotVerified`). Cấu hình phía ta sai ⇒
   * TOÀN BỘ đường thư chết, không phải một lá thư hỏng. Phải báo động, không nuốt. */
  | "cau_hinh_sai"
  /** 🔴 `AccountSuspended` / `SendingPaused` — AWS đã khoá khả năng gửi của tài khoản.
   * Đây là ca tệ nhất trong ADR-0007 §1.5: email đặt mật khẩu của KHÁCH THẬT cũng chết,
   * và khôi phục phải giải trình với AWS. Không bao giờ được gộp với lỗi mạng thoáng qua. */
  | "tai_khoan_bi_khoa"
  /** Vượt tốc độ gửi (`TooManyRequests`). Đáng thử lại sau. */
  | "qua_nhip"
  /** Mạng hỏng, DNS hỏng, quá hạn. Có thể chỉ là thoáng qua. */
  | "khong_goi_duoc";

export type KetQuaGuiThu =
  | { daGui: true; messageId: string }
  | { daGui: false; lyDo: LyDoKhongGui; chiTiet?: string };

export interface EmailTransport {
  gui(thu: ThuCanGui): Promise<KetQuaGuiThu>;
}

/** Các lý do mà THỬ LẠI có ý nghĩa. Lý do ngoài danh sách này thì thử lại chỉ tốn hạn mức
 * và làm tỉ lệ bounce tệ thêm. */
export const CO_THE_THU_LAI: ReadonlySet<LyDoKhongGui> = new Set<LyDoKhongGui>([
  "qua_nhip",
  "khong_goi_duoc",
]);

/** Các lý do đòi CON NGƯỜI can thiệp ngay — không tự khỏi theo thời gian. */
export const CAN_BAO_DONG: ReadonlySet<LyDoKhongGui> = new Set<LyDoKhongGui>([
  "chua_cau_hinh",
  "cau_hinh_sai",
  "tai_khoan_bi_khoa",
]);

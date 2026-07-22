// Lát cắt 3 (QĐ-14) — Báo kết quả gửi thư sau khi Duyệt / Gửi lại liên kết.
//
// Thay `MatKhauTamDialog`. Hộp thoại cũ tồn tại để hiện MỘT THỨ KHÔNG LẤY LẠI ĐƯỢC — mật
// khẩu 6 chữ số mà chủ dự án phải tự chuyển cho khách. Vì thế nó phải doạ ("chỉ hiện một
// lần"), phải cho sao chép, và phải khoá nút Đóng cho tới khi người dùng xác nhận đã lưu.
//
// Giờ hệ thống tự gửi thư, nên hộp thoại này KHÔNG giữ bí mật nào. Cả ba cơ chế phòng-đóng-
// nhầm ở trên đều biến mất theo, và đó là dấu hiệu thiết kế đã đúng: bớt được nghi thức vì
// bớt được thứ nguy hiểm, không phải vì bỏ qua nó.
//
// Việc DUY NHẤT còn lại của nó là trả lời một câu: thư đã đi chưa? Và chính câu đó mới là
// lý do nó vẫn phải tồn tại. Nếu SES hỏng mà màn hình vẫn báo "xong", khách ngồi chờ một
// lá thư không bao giờ tới, và không ai biết cho tới khi họ gọi điện — nếu họ còn buồn gọi.
import type { KetQuaGuiThuDatMatKhau } from "../../lib/types";

interface Props {
  ketQua: KetQuaGuiThuDatMatKhau;
  onDong: () => void;
  /** Thử gửi lại NGAY trong hộp thoại, không bắt đóng ra rồi đi tìm nút. Chỉ hiện khi hỏng. */
  onGuiLai: () => void;
}

export function DaGuiThuDialog({ ketQua, onDong, onGuiLai }: Props) {
  const hetHan = new Date(ketQua.het_han);
  const hong = !ketQua.da_gui_thu;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        zIndex: 50,
      }}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby="gui-thu-tieu-de"
        style={{
          position: "static",
          width: "min(100%, 32rem)",
          color: "var(--chu)",
          background: "var(--nen-noi)",
          border: `2px solid ${hong ? "var(--nguy)" : "var(--tot)"}`,
          borderRadius: "12px",
          padding: "1.75rem",
        }}
      >
        <h2 id="gui-thu-tieu-de" style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>
          {hong ? "⚠️ CHƯA gửi được thư" : "Đã gửi thư đặt mật khẩu"}
        </h2>

        {hong ? (
          <>
            <p style={{ margin: "0 0 1rem", color: "var(--nguy)", fontWeight: 600 }}>
              Doanh nghiệp đã được duyệt, nhưng thư tới <strong>{ketQua.email}</strong> KHÔNG gửi
              được. Khách sẽ không nhận được gì và không đặt được mật khẩu.
            </p>
            <p style={{ margin: "0 0 1.25rem", color: "var(--chu-mo)" }}>
              Thử gửi lại. Nếu vẫn hỏng, kiểm tra cấu hình gửi thư (SES) trước khi báo cho khách —
              lúc đó vấn đề nằm ở phía ta, không phải ở hộp thư của họ.
            </p>
            <button
              type="button"
              onClick={onGuiLai}
              style={{
                width: "100%",
                padding: "0.7rem",
                background: "var(--nhan)",
                color: "#1f1300",
                border: "none",
                fontWeight: 700,
                marginBottom: "0.75rem",
              }}
            >
              Gửi lại thư
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 1rem" }}>
              Thư kèm liên kết đặt mật khẩu đã gửi tới <strong>{ketQua.email}</strong>.
            </p>
            <p style={{ margin: "0 0 1.25rem", color: "var(--chu-mo)" }}>
              Liên kết hết hạn lúc{" "}
              <strong>{hetHan.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</strong>{" "}
              (giờ VN). Khách tự đặt mật khẩu rồi đăng nhập — bạn không cần làm gì thêm.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={onDong}
          style={{
            width: "100%",
            padding: "0.7rem",
            background: "var(--nen-noi-2)",
            color: "var(--chu)",
            border: "1px solid var(--vien)",
            fontWeight: 600,
          }}
        >
          Đóng
        </button>
      </dialog>
    </div>
  );
}

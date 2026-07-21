// U19 (D3) — Hiện mật khẩu tạm SAU KHI duyệt / cấp lại.
//
// Đây là màn hình quan trọng nhất về mặt vận hành của cả Cổng Admin, vì nó hiện MỘT THỨ
// KHÔNG THỂ LẤY LẠI. QĐ-1 bỏ email khỏi U18 (hạ tầng SES thuộc U24), nên chuỗi 6 chữ số
// này chỉ tồn tại trong đúng một phản hồi HTTP: DB chỉ giữ bản băm, không endpoint nào đọc
// lại được. Đóng nhầm hộp thoại = phải "Cấp lại mật khẩu", và mã cũ chết ngay lúc đó.
//
// Vì vậy UI cố ý làm ba việc: (1) nói thẳng là không hiện lại, (2) cho sao chép một chạm,
// (3) buộc xác nhận đã lưu thay vì cho đóng bằng click ra ngoài / phím Esc.
//
// R4 — mã này KHÔNG được ghi vào localStorage, KHÔNG vào URL, KHÔNG log. Nó chỉ sống trong
// state của React cho tới khi hộp thoại đóng.
import { useEffect, useRef, useState } from "react";
import type { KetQuaCapMatKhau } from "../../lib/types";

interface Props {
  ketQua: KetQuaCapMatKhau;
  onDong: () => void;
}

export function MatKhauTamDialog({ ketQua, onDong }: Props) {
  const [daSaoChep, setDaSaoChep] = useState(false);
  const [daXacNhan, setDaXacNhan] = useState(false);
  const nutDongRef = useRef<HTMLButtonElement>(null);

  // Đưa tiêu điểm vào hộp thoại để người dùng bàn phím không bị bỏ lại ngoài.
  useEffect(() => {
    nutDongRef.current?.focus();
  }, []);

  async function saoChep() {
    try {
      await navigator.clipboard.writeText(ketQua.mat_khau_tam);
      setDaSaoChep(true);
    } catch {
      // Clipboard API cần ngữ cảnh bảo mật + quyền; hỏng thì mã vẫn hiện rõ trên màn hình
      // để gõ tay. Không chặn luồng vì một tiện ích phụ.
      setDaSaoChep(false);
    }
  }

  const hetHan = new Date(ketQua.mat_khau_tam_het_han);

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
        aria-labelledby="mk-tam-tieu-de"
        style={{
          position: "static",
          width: "min(100%, 32rem)",
          color: "var(--chu)",
          background: "var(--nen-noi)",
          border: "2px solid var(--nhan)",
          borderRadius: "12px",
          padding: "1.75rem",
        }}
      >
        <h2 id="mk-tam-tieu-de" style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>
          Mật khẩu tạm cho {ketQua.email}
        </h2>

        <p style={{ margin: "0 0 1.25rem", color: "var(--cho)", fontWeight: 600 }}>
          ⚠️ Mã này chỉ hiện MỘT LẦN. Đóng cửa sổ là không xem lại được — khi đó phải bấm “Cấp lại
          mật khẩu”, và mã hiện tại sẽ hết hiệu lực ngay.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: "var(--nen)",
            border: "1px solid var(--vien)",
            borderRadius: "var(--ban-kinh)",
            padding: "1rem",
          }}
        >
          <code
            data-testid="mat-khau-tam"
            style={{ fontSize: "2rem", letterSpacing: "0.4em", fontWeight: 700 }}
          >
            {ketQua.mat_khau_tam}
          </code>
          <button
            type="button"
            onClick={() => void saoChep()}
            style={{
              marginLeft: "auto",
              padding: "0.5rem 0.9rem",
              background: "var(--nen-noi-2)",
              color: "var(--chu)",
              border: "1px solid var(--vien)",
            }}
          >
            {daSaoChep ? "Đã sao chép ✓" : "Sao chép"}
          </button>
        </div>

        <p style={{ marginTop: "1rem", color: "var(--chu-mo)", fontSize: "var(--fs-sm)" }}>
          Đọc mã này cho khách qua điện thoại hoặc Zalo. Khách đăng nhập bằng mã rồi{" "}
          <strong>buộc phải đổi mật khẩu ngay</strong>. Mã hết hạn lúc{" "}
          <strong>{hetHan.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</strong> (giờ
          VN) — quá hạn thì phải cấp lại.
        </p>

        <label
          style={{
            display: "flex",
            gap: "0.6rem",
            alignItems: "flex-start",
            margin: "1.25rem 0 1rem",
          }}
        >
          <input
            type="checkbox"
            checked={daXacNhan}
            onChange={(e) => setDaXacNhan(e.target.checked)}
            style={{ marginTop: "0.3rem" }}
          />
          <span>Tôi đã ghi lại hoặc gửi mã này cho khách.</span>
        </label>

        <button
          ref={nutDongRef}
          type="button"
          disabled={!daXacNhan}
          onClick={onDong}
          style={{
            width: "100%",
            padding: "0.7rem",
            background: daXacNhan ? "var(--nhan)" : "var(--nen-noi-2)",
            color: daXacNhan ? "#1f1300" : "var(--chu-mo)",
            border: "none",
            fontWeight: 700,
          }}
        >
          Đóng
        </button>
      </dialog>
    </div>
  );
}

// U19 — Màn đăng nhập Cổng Admin. KHÔNG dùng lại `LoginPage` của khách (U19-plan §1).
//
// Vì sao không tái dùng dù hai form trông giống nhau: dùng chung component nghĩa là dùng
// chung đường gọi API và đường lưu phiên. Đúng thứ cả U18 lẫn U19 bỏ công tách ra. Một
// form 40 dòng chép lại là cái giá rẻ để giữ hai miền không có điểm chạm nào.
import { type FormEvent, useState } from "react";
import { AdminApiError } from "../../lib/adminApiClient";
import { useAdminAuth } from "./admin-auth-context";

/** Chuyển mã lỗi API thành câu tiếng Việt nói đúng bản chất.
 *
 * 401 cố ý MƠ HỒ ("email hoặc mật khẩu không đúng") vì backend không phân biệt sai-email
 * với sai-mật-khẩu — nói rõ hơn ở đây sẽ tự phá cơ chế chống dò tài khoản của U18.
 * 503 thì ngược lại, phải nói THẬT CỤ THỂ: đó là lỗi cấu hình máy chủ, người dùng có gõ
 * đúng mật khẩu đến mấy cũng không vào được, và thông điệp chung chung sẽ khiến chủ dự án
 * ngồi thử lại mật khẩu hàng chục lần một cách vô ích.
 */
function thongDiepLoi(e: unknown): string {
  if (e instanceof AdminApiError) {
    if (e.status === 401) return "Email hoặc mật khẩu không đúng.";
    if (e.status === 503) {
      return "Máy chủ chưa cấu hình khoá quản trị (ADMIN_JWT_SECRET thiếu hoặc trùng khoá của app khách). Đây là lỗi cấu hình, không phải mật khẩu — cần đặt lại secret rồi thử lại.";
    }
    if (e.status === 0) return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  }
  return "Có lỗi xảy ra. Vui lòng thử lại.";
}

export function AdminLoginPage() {
  const { dangNhap } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [matKhau, setMatKhau] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function guiForm(e: FormEvent) {
    e.preventDefault();
    setLoi(null);
    setDangGui(true);
    try {
      await dangNhap(email, matKhau);
    } catch (err) {
      setLoi(thongDiepLoi(err));
    } finally {
      setDangGui(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
      }}
    >
      <form
        onSubmit={guiForm}
        style={{
          width: "min(100%, 26rem)",
          background: "var(--nen-noi)",
          border: "1px solid var(--vien)",
          borderRadius: "12px",
          padding: "1.75rem",
        }}
      >
        <p
          style={{
            margin: "0 0 0.25rem",
            color: "var(--nhan)",
            fontWeight: 700,
            letterSpacing: "0.08em",
            fontSize: "var(--fs-sm)",
          }}
        >
          KHU VỰC QUẢN TRỊ
        </p>
        <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Đăng nhập VATEngine Admin</h1>

        <label htmlFor="email" style={{ display: "block", marginBottom: "0.35rem" }}>
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={o}
        />

        <label htmlFor="mat-khau" style={{ display: "block", margin: "1rem 0 0.35rem" }}>
          Mật khẩu
        </label>
        <input
          id="mat-khau"
          type="password"
          autoComplete="current-password"
          required
          value={matKhau}
          onChange={(e) => setMatKhau(e.target.value)}
          style={o}
        />

        {loi && (
          // role="alert" để trình đọc màn hình đọc ngay khi lỗi xuất hiện.
          <p
            role="alert"
            style={{
              marginTop: "1rem",
              marginBottom: 0,
              color: "var(--nguy)",
              fontSize: "var(--fs-sm)",
            }}
          >
            {loi}
          </p>
        )}

        <button
          type="submit"
          disabled={dangGui}
          style={{
            width: "100%",
            marginTop: "1.5rem",
            padding: "0.7rem",
            background: "var(--nhan)",
            color: "#1f1300",
            border: "none",
            fontWeight: 700,
          }}
        >
          {dangGui ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}

const o: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.7rem",
  background: "var(--nen)",
  color: "var(--chu)",
  border: "1px solid var(--vien)",
};

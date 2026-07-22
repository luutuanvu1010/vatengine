// Lát cắt 3 (QĐ-14) — Trang khách tự đặt mật khẩu sau khi hồ sơ được duyệt.
//
// ── KHÁC TRANG /xac-thuc-email MỘT ĐIỂM QUAN TRỌNG ───────────────────────────────────
// Trang xác thực tự gửi POST ngay khi tải, vì nó không cần khách nhập gì. Trang này thì
// KHÔNG — nó hiện form và chỉ gọi API khi khách bấm gửi. Hệ quả tốt: token không bị tiêu
// bởi bất kỳ thứ gì tự động, kể cả trình duyệt tải trước hay tiện ích mở link ngầm.
//
// Cũng vì thế trang KHÔNG kiểm token trước khi hiện form. Kiểm trước cần thêm một endpoint
// đọc, mà một endpoint `GET` nhận token lại mở đúng cánh cửa vừa đóng. Một lần chạm token,
// một endpoint.
import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Brand } from "../../components/Brand";
import { Alert, Button, Card, TextField } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";

/** Khớp `TOI_THIEU` ở `apps/api/src/routes/datMatKhau.ts` và `MAT_KHAU_TOI_THIEU` ở
 * `routes/auth.ts`. Kiểm ở client là để báo NGAY, không phải để bảo vệ — server vẫn ép. */
const TOI_THIEU = 8;

type KetCuc = "het_han" | "da_dung" | "khong_thay";

/** Ba kết cục TÁCH BẠCH, vì người dùng làm việc khác nhau với chúng — gộp lại là bắt họ
 * đoán xem nên thử lại, nên đăng nhập, hay nên liên hệ hỗ trợ. */
const LOI_MAY_CHU: Record<KetCuc, string> = {
  het_han:
    "Liên kết đã hết hạn. Liên kết đặt mật khẩu chỉ có hiệu lực trong 72 giờ — vui lòng liên hệ chúng tôi để nhận liên kết mới.",
  da_dung:
    "Liên kết này đã được dùng để đặt mật khẩu rồi. Nếu đó là bạn, hãy đăng nhập bình thường.",
  khong_thay:
    "Liên kết không hợp lệ. Liên kết có thể bị cắt ngắn khi sao chép từ thư — hãy thử mở lại đúng liên kết trong thư.",
};

function maLoi(err: unknown): KetCuc {
  if (err instanceof ApiError && (err.code === "het_han" || err.code === "da_dung")) {
    return err.code;
  }
  return "khong_thay";
}

/** Khung chung của cả bốn trạng thái màn — cùng bố cục với `/xac-thuc-email` để hai lá thư
 * của cùng một chuỗi đăng ký dẫn tới hai trang trông như một nhà. */
function Khung({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "var(--sp-6) var(--sp-4)",
      }}
    >
      <div style={{ width: "min(100%, 34rem)", display: "grid", gap: "var(--sp-5)" }}>
        <Brand />
        <Card>{children}</Card>
      </div>
    </main>
  );
}

export function DatMatKhauPage() {
  // Đọc qua `useSearchParams` của router, KHÔNG đọc thẳng `window.location.search`. Đọc
  // thẳng thì đi vòng qua router: nó vẫn chạy dưới `BrowserRouter` ở production nhưng
  // hỏng câm dưới `MemoryRouter` — tức là chính chỗ test đứng. Một trang không test được
  // là một trang không ai chứng minh được là đúng.
  const [params] = useSearchParams();
  const token = params.get("token");
  const [matKhau, setMatKhau] = useState("");
  const [nhapLai, setNhapLai] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [xong, setXong] = useState(false);

  async function gui(e: FormEvent) {
    e.preventDefault();
    // Kiểm tại chỗ TRƯỚC khi gọi: một lần gõ hụt không được đốt mất liên kết duy nhất của
    // khách. Server cũng kiểm độ dài trước khi chạm token, nên hai tầng khớp nhau.
    if (matKhau.length < TOI_THIEU) {
      setLoi(`Mật khẩu phải có ít nhất ${TOI_THIEU} ký tự.`);
      return;
    }
    if (matKhau !== nhapLai) {
      setLoi("Hai ô mật khẩu không khớp.");
      return;
    }
    setLoi(null);
    setDangGui(true);
    try {
      await api.datMatKhau(token as string, matKhau);
      setXong(true);
    } catch (err) {
      setLoi(LOI_MAY_CHU[maLoi(err)]);
    } finally {
      setDangGui(false);
    }
  }

  // Trạng thái 1 — liên kết hỏng ngay từ URL. Không hiện form: gõ mật khẩu vào một form
  // chắc chắn hỏng là lãng phí công của người dùng.
  if (!token) {
    return (
      <Khung>
        <h1 style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-2xl)" }}>
          Liên kết không hợp lệ
        </h1>
        <Alert tone="danger">{LOI_MAY_CHU.khong_thay}</Alert>
        <p style={{ fontSize: "var(--fs-base)", marginBottom: 0 }}>
          <Link to="/login">← Về trang đăng nhập</Link>
        </p>
      </Khung>
    );
  }

  // Trạng thái 2 — xong.
  if (xong) {
    return (
      <Khung>
        <h1 style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-2xl)" }}>
          Đã đặt mật khẩu xong
        </h1>
        <Alert tone="success">
          Tài khoản của bạn đã sẵn sàng. Hãy đăng nhập bằng email và mật khẩu vừa đặt.
        </Alert>
        <p style={{ fontSize: "var(--fs-base)", marginBottom: 0 }}>
          <Link to="/login">Đăng nhập →</Link>
        </p>
      </Khung>
    );
  }

  // Trạng thái 3 & 4 — form rảnh, và form đang gửi (nút tự đổi chữ + khoá lại).
  return (
    <Khung>
      <form onSubmit={(e) => void gui(e)} style={{ display: "grid", gap: "var(--sp-4)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--fs-2xl)" }}>Đặt mật khẩu</h1>
          <p style={{ color: "var(--text-tertiary)", marginTop: "var(--sp-1)", marginBottom: 0 }}>
            Hồ sơ của bạn đã được duyệt. Đặt mật khẩu để bắt đầu dùng VATEngine.
          </p>
        </div>

        {loi ? <Alert tone="danger">{loi}</Alert> : null}

        <TextField
          label={`Mật khẩu mới (ít nhất ${TOI_THIEU} ký tự)`}
          type="password"
          autoComplete="new-password"
          value={matKhau}
          onChange={(e) => setMatKhau(e.target.value)}
        />
        <TextField
          label="Nhập lại mật khẩu"
          type="password"
          autoComplete="new-password"
          value={nhapLai}
          onChange={(e) => setNhapLai(e.target.value)}
        />

        <Button type="submit" disabled={dangGui}>
          {dangGui ? "Đang đặt…" : "Đặt mật khẩu"}
        </Button>
      </form>
    </Khung>
  );
}

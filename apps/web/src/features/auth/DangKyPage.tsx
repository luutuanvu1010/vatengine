// U20 §2 — Trang Đăng ký công khai. Mắt xích cuối của chuỗi onboard:
//
//   Khách điền form → tenant `cho_duyet` → super-admin duyệt (U19) → khách đăng nhập
//
// Trước U20, `POST /dang-ky` đã sống trên production từ U17b nhưng KHÔNG có đường nào tới
// nó từ trình duyệt — backend có cổng mà chưa ai làm cánh cửa.
//
// Route CÔNG KHAI, đặt ngang `/login`, ngoài `ProtectedLayout`.
import { type FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../../components/Brand";
import { KhoiHoTro } from "../../components/KhoiHoTro";
import { Turnstile, type TurnstileHandle } from "../../components/Turnstile";
import { Alert, Button, Card, TextField } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";
import { vi } from "../../lib/i18n/vi";

// 10 = doanh nghiệp/tổ chức; 13 = đơn vị phụ thuộc; 12 = số định danh cá nhân
// (hộ kinh doanh / cá nhân, theo TT 86/2024/TT-BTC). Khớp `apps/api/.../dangKy.ts`.
const MST_RE = /^\d{10}$|^\d{12}$|^\d{13}$/;

/**
 * Ánh xạ ĐỦ 7 mã lỗi của `POST /dang-ky`. Mỗi câu phải nói người dùng cần LÀM GÌ tiếp —
 * "Có lỗi xảy ra" không giúp ai sửa được gì.
 *
 * Danh sách mã lấy từ chính `apps/api/src/routes/dangKy.ts`, không phải từ spec: spec U20
 * chỉ liệt kê 4 mã, backend thật có 7.
 */
export function thongDiepLoiDangKy(err: unknown): string {
  if (!(err instanceof ApiError)) return vi.errorTitle;
  switch (err.code) {
    case "email_khong_hop_le":
      return "Email này không được chấp nhận. Vui lòng dùng email doanh nghiệp, Gmail hoặc Yahoo — không dùng email tạm thời.";
    case "mst_khong_hop_le":
      return "Mã số thuế phải gồm đúng 10, 12 hoặc 13 chữ số.";
    case "chua_dong_y_dieu_khoan":
      return "Bạn cần tích ô cam kết ủy quyền trước khi gửi đăng ký.";
    case "da_ton_tai":
      return "Email hoặc mã số thuế này đã được đăng ký. Nếu đây là doanh nghiệp của bạn, hãy đăng nhập hoặc liên hệ hỗ trợ.";
    // U33 — 4 mã của cổng Turnstile. `thieu_captcha`/`captcha_sai`/`het_han` là việc người
    // dùng TỰ xử lý được (giải lại), nên câu chữ phải nói đúng thao tác đó. `cau_hinh_sai`
    // là lỗi của MÁY CHỦ (secret sai) — không được đổ cho người dùng "thử lại", vì thử bao
    // nhiêu lần cũng hỏng cho tới khi bên vận hành sửa.
    case "thieu_captcha":
    case "captcha_sai":
      return "Chưa qua được bước kiểm tra bảo mật. Vui lòng thực hiện lại ô xác minh bên dưới.";
    case "het_han":
      return "Ô xác minh bảo mật đã hết hạn. Vui lòng xác minh lại rồi gửi.";
    case "cau_hinh_sai":
    case "captcha_chua_cau_hinh":
      return "Hệ thống tạm thời chưa tiếp nhận được đăng ký. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.";
    case "bad_request":
      return "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các ô đã nhập.";
    default:
      return err.status === 0 ? vi.networkError : vi.errorTitle;
  }
}

/** Màn thành công.
 *
 * KHÔNG hứa gửi email và KHÔNG hẹn thời gian — hệ thống hiện không gửi gì cho khách
 * (hạ tầng email thuộc U24, chưa có; mật khẩu tạm do quản trị viên đọc trực tiếp — QĐ-1).
 * Hứa một bức thư không bao giờ tới là cách chắc chắn nhất để mất niềm tin ngay từ bước
 * đầu tiên khách chạm vào sản phẩm. */
function ManChoDuyet({ email, daGuiThu }: { email: string; daGuiThu: boolean }) {
  // Lát cắt 1 — hai màn KHÁC HẲN nhau, vì việc khách cần làm khác hẳn nhau.
  //
  // Thư gửi được ⇒ bảo họ đi mở hộp thư. Thư KHÔNG gửi được ⇒ tuyệt đối không được nói câu
  // đó: bắt người ta ngồi chờ một bức thư không bao giờ tới là cách chắc chắn nhất để mất
  // họ. Backend trả cờ `daGuiThu` chính là để màn này nói đúng sự thật.
  if (!daGuiThu) {
    return (
      <Card>
        <h1 style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-2xl)" }}>
          Đã ghi nhận đăng ký
        </h1>
        <Alert tone="danger">
          Chúng tôi chưa gửi được thư xác nhận tới <strong>{email}</strong>.
        </Alert>
        <p style={{ fontSize: "var(--fs-base)", lineHeight: 1.6 }}>
          Đăng ký của bạn <strong>đã được lưu</strong>, nhưng địa chỉ email có thể gõ nhầm hoặc
          không nhận được thư. Vui lòng kiểm tra lại địa chỉ và{" "}
          <Link to="/dang-ky">đăng ký lại</Link>, hoặc liên hệ qua trang{" "}
          <Link to="/gioi-thieu">Giới thiệu &amp; Hỗ trợ</Link>.
        </p>
        <Link to="/login">← Về trang đăng nhập</Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-2xl)" }}>
        Kiểm tra hộp thư của bạn
      </h1>
      <Alert tone="success">
        Chúng tôi vừa gửi thư xác nhận tới <strong>{email}</strong>.
      </Alert>
      <p style={{ fontSize: "var(--fs-base)", lineHeight: 1.6 }}>
        Vui lòng mở thư và bấm nút xác nhận để chúng tôi biết đây đúng là địa chỉ của bạn. Liên kết
        có hiệu lực trong <strong>24 giờ</strong>.
      </p>
      <p style={{ fontSize: "var(--fs-base)", lineHeight: 1.6 }}>
        Không thấy thư? Hãy kiểm tra cả thư mục <strong>Spam</strong> hoặc{" "}
        <strong>Quảng cáo</strong>.
      </p>
      <p style={{ fontSize: "var(--fs-base)", lineHeight: 1.6 }}>
        Sau khi xác nhận, chúng tôi sẽ xác minh thông tin doanh nghiệp trước khi kích hoạt tài
        khoản.
      </p>
      <p style={{ fontSize: "var(--fs-base)", lineHeight: 1.6 }}>
        Nếu cần hỗ trợ hoặc muốn hỏi tình trạng hồ sơ, vui lòng liên hệ qua trang{" "}
        <Link to="/gioi-thieu">Giới thiệu &amp; Hỗ trợ</Link>.
      </p>
      <Link to="/login">← Về trang đăng nhập</Link>
    </Card>
  );
}

export function DangKyPage() {
  const [email, setEmail] = useState("");
  const [tenDoanhNghiep, setTenDoanhNghiep] = useState("");
  const [mst, setMst] = useState("");
  const [dongY, setDongY] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle>(null);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState(false);
  const [daGuiThu, setDaGuiThu] = useState(true);

  // Validate phía client CHỈ để đỡ một vòng round-trip vô ích. Nguồn chân lý vẫn là
  // backend (U17b) — nó lọc miền email dùng-một-lần, alias `+`, và rate-limit theo IP,
  // những thứ client không thể và không nên tự quyết.
  const mstHopLe = MST_RE.test(mst.trim());
  // `captcha !== null` nằm trong điều kiện gửi ⇒ widget hỏng hoặc chưa giải thì nút khoá.
  // Fail-closed cùng chiều với backend (503 khi thiếu secret): không có đường nào để form
  // này gửi đi mà thiếu token.
  const guiDuoc =
    email.trim() !== "" &&
    tenDoanhNghiep.trim() !== "" &&
    mstHopLe &&
    dongY &&
    captcha !== null &&
    !dangGui;

  async function guiForm(e: FormEvent) {
    e.preventDefault();
    setLoi(null);
    if (captcha === null) return;
    setDangGui(true);
    try {
      const kq = await api.dangKy(
        {
          email: email.trim(),
          tenDoanhNghiep: tenDoanhNghiep.trim(),
          mst: mst.trim(),
          dongYDieuKhoan: dongY,
        },
        captcha,
      );
      setDaGuiThu(kq.daGuiThu);
      setXong(true);
    } catch (err) {
      setLoi(thongDiepLoiDangKy(err));
      // Token vừa tiêu. KHÔNG đặt lại thì lần gửi thứ hai mang token đã dùng và luôn hỏng
      // với `het_han` — người dùng sửa đúng lỗi của mình mà vẫn không gửi được.
      captchaRef.current?.reset();
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
        padding: "var(--sp-6) var(--sp-4)",
      }}
    >
      <div style={{ width: "min(100%, 34rem)", display: "grid", gap: "var(--sp-5)" }}>
        <Brand />

        {xong ? (
          <ManChoDuyet email={email.trim()} daGuiThu={daGuiThu} />
        ) : (
          <Card>
            <h1 style={{ margin: "0 0 var(--sp-2)", fontSize: "var(--fs-2xl)" }}>
              Đăng ký sử dụng VATEngine
            </h1>
            <p
              style={{
                marginTop: 0,
                fontSize: "var(--fs-base)",
                lineHeight: 1.6,
                color: "var(--text-secondary)",
              }}
            >
              Miễn phí cho doanh nghiệp Việt Nam. Tài khoản sẽ được kích hoạt sau khi chúng tôi xác
              minh thông tin.
            </p>

            <form onSubmit={guiForm} style={{ display: "grid", gap: "var(--sp-4)" }}>
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ketoan@congty.vn"
              />
              <TextField
                label="Tên doanh nghiệp"
                required
                value={tenDoanhNghiep}
                onChange={(e) => setTenDoanhNghiep(e.target.value)}
                placeholder="Công ty TNHH ABC"
              />
              <TextField
                label="Mã số thuế"
                required
                inputMode="numeric"
                value={mst}
                onChange={(e) => setMst(e.target.value)}
                placeholder="10, 12 hoặc 13 chữ số"
                aria-describedby="mst-help"
              />
              {mst.trim() !== "" && !mstHopLe && (
                <p
                  id="mst-help"
                  style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--danger-600)" }}
                >
                  Mã số thuế phải gồm đúng 10, 12 hoặc 13 chữ số.
                </p>
              )}

              {/* Cam kết ủy quyền — ranh giới PHÁP LÝ, không phải thủ tục hình thức.
                  Hiến pháp dự án: mỗi tenant phải ủy quyền rõ ràng (NĐ 13/2023). Backend
                  cũng từ chối bằng `chua_dong_y_dieu_khoan` nếu thiếu — hai lớp. */}
              <label
                style={{
                  display: "flex",
                  gap: "var(--sp-3)",
                  alignItems: "flex-start",
                  fontSize: "var(--fs-base)",
                  lineHeight: 1.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={dongY}
                  onChange={(e) => setDongY(e.target.checked)}
                  style={{ marginTop: "0.3rem" }}
                />
                <span>
                  Tôi cam kết được <strong>ủy quyền hợp pháp</strong> sử dụng tài khoản mã số thuế
                  nêu trên, và đồng ý với chính sách sử dụng &amp; bảo mật của VATEngine.
                </span>
              </label>

              <Turnstile ref={captchaRef} onToken={setCaptcha} />

              {loi && <Alert tone="danger">{loi}</Alert>}

              <Button type="submit" disabled={!guiDuoc}>
                {dangGui ? "Đang gửi…" : "Gửi đăng ký"}
              </Button>
            </form>

            <p style={{ fontSize: "var(--fs-base)", marginBottom: 0 }}>
              Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
            </p>
          </Card>
        )}

        <KhoiHoTro />
      </div>
    </main>
  );
}

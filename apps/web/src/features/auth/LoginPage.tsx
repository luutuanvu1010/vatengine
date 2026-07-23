// S0 — Đăng nhập nội bộ (email + mật khẩu SaaS).
// "Ghi nhớ đăng nhập" + "Quên mật khẩu?": TẠM ẨN (2026-07-23, theo chủ dự án) để làm sau —
// đã ghi backlog `docs/BACKLOG-y-tuong-va-de-xuat.md`. KHÔNG log mật khẩu; không bí mật ở client.
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../../components/Brand";
import { Turnstile, type TurnstileHandle } from "../../components/Turnstile";
import { Alert, Button, TextField } from "../../components/ui/primitives";
import { ApiError } from "../../lib/apiClient";
import { vi } from "../../lib/i18n/vi";
import { ORG } from "../../lib/orgInfo";
import { MOBILE_QUERY, useMediaQuery } from "../../lib/useMediaQuery";
import { useAuth } from "./auth-context";

// 4 fact nổi bật hiển thị ở panel phải màn đăng nhập (nội dung do chủ dự án chốt).
const LOGIN_FACTS: ReadonlyArray<{ title: string; desc: ReactNode }> = [
  {
    title: "Dữ liệu gốc từ Tổng cục Thuế",
    desc: "Hóa đơn mua vào & bán ra truy xuất trực tiếp từ Hệ thống HĐĐT của Tổng cục Thuế bằng chính tài khoản MST của bạn — đầy đủ dữ liệu.",
  },
  {
    title: "Đủ hai chiều, đủ loại hóa đơn",
    desc: "Đồng bộ cả HĐĐT thường lẫn hóa đơn máy tính tiền, cả mua vào và bán ra; tự khử trùng lặp và cập nhật trạng thái hủy/thay thế.",
  },
  {
    title: "Bảo mật & đúng pháp lý",
    // Căn cứ pháp lý in ĐẬM + NGHIÊNG để nổi bật (yêu cầu chủ dự án 2026-07-23).
    desc: (
      <>
        Không lưu mật khẩu thuế, captcha do bạn tự nhập, dữ liệu mỗi doanh nghiệp cách ly tuyệt đối;
        tuân thủ{" "}
        <strong>
          <em>NĐ 13/2023, NĐ 123/2020 &amp; TT 78/2021.</em>
        </strong>
      </>
    ),
  },
  {
    title: "Sẵn sàng đối chiếu & kê khai",
    desc: "Tra cứu theo kỳ, phát hiện lệch thuế và kết xuất Excel/CSV chỉ trong vài cú nhấp — phục vụ đối chiếu, kê khai và tích hợp kế toán.",
  },
];

// Icon Cloudflare (inline SVG, dùng currentColor để bám màu chữ theo token).
function CloudflareIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M16.5 16.3l.28-.95c.33-1.13.2-2.17-.36-2.94-.51-.71-1.37-1.12-2.4-1.17l-8.02-.1a.16.16 0 01-.12-.07.16.16 0 01-.02-.14.21.21 0 01.19-.14l8.09-.1c.96-.04 2-.82 2.36-1.77l.46-1.2A.28.28 0 0017.4 6a5.34 5.34 0 00-10.26-.55A2.4 2.4 0 003.4 7.9a2.44 2.44 0 00.06.66.11.11 0 01-.1.13H3.3c-1.8.17-3.3 1.7-3.3 3.5 0 .17.01.33.03.5a.16.16 0 00.16.14h14.8c.09 0 .17-.06.2-.15l1.31-.38z" />
      <path d="M19.9 9.4h-.23a.14.14 0 00-.13.1l-.31 1.08c-.33 1.13-.2 2.17.36 2.94.51.71 1.37 1.12 2.4 1.17l1.71.1a.16.16 0 01.12.07.16.16 0 01.02.15.21.21 0 01-.19.14l-1.78.1c-.96.05-2 .82-2.36 1.78l-.13.33a.1.1 0 00.08.13h6.12a.17.17 0 00.16-.12c.11-.4.17-.81.17-1.24 0-2.6-2.11-4.71-4.71-4.71z" />
    </svg>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // U33 — cổng Turnstile trả 400 cho captcha hỏng, TRÙNG mã với "thiếu email/mật khẩu".
    // Phân biệt bằng `code` chứ không bằng status, nếu không người dùng nhập đủ email và
    // mật khẩu vẫn bị bảo là "nhập email và mật khẩu hợp lệ" — chỉ dẫn sai chỗ cần sửa.
    if (err.code === "thieu_captcha" || err.code === "captcha_sai")
      return "Chưa qua được bước kiểm tra bảo mật. Vui lòng thực hiện lại ô xác minh.";
    if (err.code === "het_han")
      return "Ô xác minh bảo mật đã hết hạn. Vui lòng xác minh lại rồi đăng nhập.";
    // Lỗi cấu hình phía máy chủ (secret sai/thiếu) — 503, không phải lỗi người dùng.
    if (err.code === "cau_hinh_sai" || err.code === "captcha_chua_cau_hinh")
      return "Hệ thống tạm thời chưa tiếp nhận được đăng nhập. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.";
    if (err.status === 401) return "Email hoặc mật khẩu không đúng.";
    if (err.status === 400) return "Vui lòng nhập email và mật khẩu hợp lệ.";
    if (err.status === 0) return vi.networkError;
  }
  return vi.errorTitle;
}

export function LoginPage() {
  const { login } = useAuth();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (captcha === null) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, captcha);
    } catch (err) {
      setError(errorMessage(err));
      // Token dùng một lần — sai mật khẩu lần đầu là chuyện thường, và nếu không xin token
      // mới thì lần gõ đúng ngay sau đó vẫn hỏng. Đúng cái bẫy khiến người dùng tin là
      // mật khẩu của mình sai trong khi thực ra captcha đã tiêu.
      captchaRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        // Mobile: 1 cột (chỉ form). Desktop: form + panel marketing.
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1fr)",
      }}
    >
      <div
        style={{
          display: "grid",
          placeItems: "center",
          padding: isMobile ? "var(--sp-6)" : "var(--sp-8)",
        }}
      >
        <form
          onSubmit={onSubmit}
          style={{ width: "min(360px, 100%)", display: "grid", gap: "var(--sp-4)" }}
        >
          <Brand size="lg" />
          <div>
            <h1 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-extrabold)" }}>
              Đăng nhập
            </h1>
            <p style={{ color: "var(--text-tertiary)", marginTop: "var(--sp-1)" }}>
              Truy cập hệ thống hóa đơn điện tử của doanh nghiệp bạn.
            </p>
          </div>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <TextField
            label="Email công việc"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div style={{ display: "grid", gap: "var(--sp-1)" }}>
            <TextField
              label="Mật khẩu"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              style={{
                justifySelf: "start",
                background: "none",
                border: "none",
                color: "var(--info-600)",
                cursor: "pointer",
                fontSize: "var(--fs-sm)",
                padding: 0,
              }}
            >
              {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            </button>
          </div>

          {/* "Ghi nhớ đăng nhập" + "Quên mật khẩu?" TẠM ẨN (2026-07-23, theo chủ dự án) —
              để làm sau, đã ghi backlog. Không hiển thị nhãn "(sắp có)" gây rối mắt. */}

          <Turnstile ref={captchaRef} onToken={setCaptcha} />

          <Button type="submit" disabled={submitting || captcha === null}>
            {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
          </Button>

          {/* Thông tin Beta + pháp nhân sở hữu. Đọc tên công ty & địa chỉ từ `lib/orgInfo.ts`
              (nguồn sự thật duy nhất — không chép chuỗi vào JSX). Yêu cầu chủ dự án 2026-07-23. */}
          <Alert tone="info">
            <strong>{ORG.sanPham}</strong> là sản phẩm đang trong giai đoạn{" "}
            <strong>thử nghiệm (Beta)</strong>, thuộc sở hữu của {ORG.congTy}. Địa chỉ: {ORG.diaChi}
            .
          </Alert>

          <p style={{ fontSize: "var(--fs-base)", margin: 0 }}>
            Chưa có tài khoản? <Link to="/dang-ky">Đăng ký</Link>
          </p>
        </form>
      </div>

      <aside
        // Panel marketing chỉ hiện trên desktop — mobile tập trung vào form (thông điệp
        // thử nghiệm đã có ở Alert trong form).
        // 2026-07-23 (chủ dự án): BỎ nền đỏ (brand-600) → nền xám nhẹ đồng nhất toàn trang
        // (cùng --surface-page với khu vực form). Chữ dùng token màu thường trên nền sáng.
        hidden={isMobile}
        style={{
          display: isMobile ? "none" : "grid",
          background: "var(--surface-page)",
          color: "var(--text-primary)",
          alignContent: "center",
          gap: "var(--sp-6)",
          padding: "var(--sp-12)",
        }}
      >
        <div
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "var(--fs-sm)",
            color: "var(--text-tertiary)",
          }}
        >
          Vì sao chọn VATEngine
        </div>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: "var(--sp-6)",
          }}
        >
          {LOGIN_FACTS.map((fact, i) => (
            <li
              key={fact.title}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "var(--sp-3)",
                alignItems: "start",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-full)",
                  // Nền sáng: badge dùng màu thương hiệu + chữ trắng để giữ điểm nhấn.
                  background: "var(--brand-600)",
                  color: "var(--text-on-brand)",
                  fontWeight: "var(--fw-bold)",
                  fontSize: "var(--fs-sm)",
                }}
              >
                {i + 1}
              </span>
              <div style={{ display: "grid", gap: "var(--sp-1)" }}>
                <div
                  style={{
                    fontSize: "var(--fs-lg)",
                    fontWeight: "var(--fw-extrabold)",
                    lineHeight: "var(--lh-heading)",
                    color: "var(--text-primary)",
                  }}
                >
                  {fact.title}
                </div>
                {/* QĐ-9 (U20) — VĂN BẢN ĐỂ ĐỌC, không phải nhãn phụ. Trên nền xám nhẹ dùng
                    text-secondary cho tương phản đủ, --fs-base để đọc hết đoạn. */}
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--fs-base)",
                    lineHeight: "var(--lh-body)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {fact.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {/* Hạ tầng bảo mật & phục vụ bởi Cloudflare — kèm biểu tượng. Nội dung đọc từ
            ORG.haTang (nguồn sự thật duy nhất). Yêu cầu chủ dự án 2026-07-23. */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--sp-2)",
            paddingTop: "var(--sp-4)",
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-tertiary)",
            fontSize: "var(--fs-sm)",
          }}
        >
          <span style={{ color: "#f6821f", display: "inline-flex" }}>
            <CloudflareIcon />
          </span>
          {ORG.haTang}.
        </div>
      </aside>
    </div>
  );
}

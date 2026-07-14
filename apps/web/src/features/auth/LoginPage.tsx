// S0 — Đăng nhập nội bộ (email + mật khẩu SaaS). "Ghi nhớ đăng nhập" + "Quên mật khẩu?"
// DỰNG SẴN CHỖ nhưng chưa nối (backend A3/A4 tách unit sau — U15-buoc4 §4) → đánh dấu
// "(sắp có)", không giả vờ hoạt động. KHÔNG log mật khẩu; không bí mật ở client.
import { type FormEvent, useState } from "react";
import { Brand } from "../../components/Brand";
import { Alert, Button, TextField } from "../../components/ui/primitives";
import { ApiError } from "../../lib/apiClient";
import { vi } from "../../lib/i18n/vi";
import { useAuth } from "./auth-context";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Email hoặc mật khẩu không đúng.";
    if (err.status === 400) return "Vui lòng nhập email và mật khẩu hợp lệ.";
    if (err.status === 0) return vi.networkError;
  }
  return vi.errorTitle;
}

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
      }}
    >
      <div style={{ display: "grid", placeItems: "center", padding: "var(--sp-8)" }}>
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label
              style={{
                display: "inline-flex",
                gap: "var(--sp-2)",
                alignItems: "center",
                color: "var(--text-disabled)",
                fontSize: "var(--fs-sm)",
              }}
              title="Sắp có — cần đăng nhập lại khi tải lại trang"
            >
              <input type="checkbox" disabled />
              Ghi nhớ đăng nhập (sắp có)
            </label>
            <span
              style={{ color: "var(--text-disabled)", fontSize: "var(--fs-sm)" }}
              title="Sắp có"
            >
              Quên mật khẩu? (sắp có)
            </span>
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
          </Button>

          <Alert tone="info">
            Sản phẩm đang trong giai đoạn <strong>thử nghiệm</strong> — miễn phí cho doanh nghiệp
            nhỏ. Dữ liệu mỗi doanh nghiệp được cách ly riêng.
          </Alert>
        </form>
      </div>

      <aside
        aria-hidden="true"
        style={{
          background: "var(--brand-600)",
          color: "#fff",
          display: "grid",
          alignContent: "center",
          gap: "var(--sp-5)",
          padding: "var(--sp-12)",
        }}
      >
        <div
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "var(--fs-sm)",
            opacity: 0.85,
          }}
        >
          Kết nối trực tiếp Tổng cục Thuế
        </div>
        <div
          style={{
            fontSize: "var(--fs-3xl)",
            fontWeight: "var(--fw-extrabold)",
            lineHeight: "var(--lh-heading)",
          }}
        >
          Tra cứu, kết xuất & đối chiếu hóa đơn — chính xác đến từng đồng.
        </div>
        <p style={{ opacity: 0.9, margin: 0 }}>
          Kéo hóa đơn mua vào & bán ra về một nơi bằng chính tài khoản MST của doanh nghiệp.
        </p>
      </aside>
    </div>
  );
}

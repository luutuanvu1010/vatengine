// S0 — Đăng nhập nội bộ (email + mật khẩu SaaS). "Ghi nhớ đăng nhập" + "Quên mật khẩu?"
// DỰNG SẴN CHỖ nhưng chưa nối (backend A3/A4 tách unit sau — U15-buoc4 §4) → đánh dấu
// "(sắp có)", không giả vờ hoạt động. KHÔNG log mật khẩu; không bí mật ở client.
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../../components/Brand";
import { Alert, Button, TextField } from "../../components/ui/primitives";
import { ApiError } from "../../lib/apiClient";
import { vi } from "../../lib/i18n/vi";
import { MOBILE_QUERY, useMediaQuery } from "../../lib/useMediaQuery";
import { useAuth } from "./auth-context";

// 4 fact nổi bật hiển thị ở panel phải màn đăng nhập (nội dung do chủ dự án chốt).
const LOGIN_FACTS: ReadonlyArray<{ title: string; desc: string }> = [
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
    desc: "Không lưu mật khẩu thuế, captcha do bạn tự nhập, dữ liệu mỗi doanh nghiệp cách ly tuyệt đối; tuân thủ NĐ 13/2023, NĐ 123/2020 & TT 78/2021.",
  },
  {
    title: "Sẵn sàng đối chiếu & kê khai",
    desc: "Tra cứu theo kỳ, phát hiện lệch thuế và kết xuất Excel/CSV chỉ trong vài cú nhấp — phục vụ đối chiếu, kê khai và tích hợp kế toán.",
  },
];

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
  const isMobile = useMediaQuery(MOBILE_QUERY);
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

          {/* U20 §3 — Gợi ý TĨNH, luôn hiện, KHÔNG suy ra từ phản hồi đăng nhập.
              /auth/login cố ý trả 401 gọn cho CẢ sai-mật-khẩu lẫn chưa-được-duyệt (chống
              dò tài khoản, U17b). Nếu UI đoán "tài khoản của bạn chưa được duyệt" từ một
              mã 401, nó vừa đoán sai vừa phá chính cơ chế mà backend dựng lên để không rò
              thông tin. Vì vậy thông điệp này tách hẳn khỏi kết quả đăng nhập. */}
          <p style={{ fontSize: "var(--fs-base)", lineHeight: 1.6, margin: 0 }}>
            Nếu bạn vừa đăng ký, tài khoản cần được duyệt trước khi đăng nhập được.
          </p>
          <p style={{ fontSize: "var(--fs-base)", margin: 0 }}>
            Chưa có tài khoản? <Link to="/dang-ky">Đăng ký</Link>
          </p>
        </form>
      </div>

      <aside
        // Panel marketing chỉ hiện trên desktop — mobile tập trung vào form (thông điệp
        // thử nghiệm đã có ở Alert trong form).
        hidden={isMobile}
        style={{
          display: isMobile ? "none" : "grid",
          background: "var(--brand-600)",
          color: "#fff",
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
            opacity: 0.85,
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
                  background: "rgba(255,255,255,0.16)",
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
                  }}
                >
                  {fact.title}
                </div>
                {/* QĐ-9 (U20) — VĂN BẢN ĐỂ ĐỌC, không phải nhãn phụ. Chính chỗ này là
                    thứ chủ dự án Inspect ra khi báo "chữ nhỏ khó đọc": 13px cộng opacity
                    0.9 trên nền màu thương hiệu. Nâng --fs-base và bỏ làm mờ — tương phản
                    đủ mới đọc hết được đoạn, không chỉ liếc qua. */}
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--fs-base)",
                    lineHeight: "var(--lh-body)",
                  }}
                >
                  {fact.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

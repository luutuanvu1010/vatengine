// Footer dùng chung — chứa thông tin Beta + pháp nhân sở hữu + tuyên bố bản quyền.
// NGUỒN SỰ THẬT DUY NHẤT: đọc tên công ty & địa chỉ từ `lib/orgInfo.ts`, KHÔNG chép chuỗi
// vào JSX (chép là tạo nguồn sự thật thứ hai — lệch khi công ty đổi thông tin).
// Năm bản quyền tính động (`new Date().getFullYear()`) để không bị lỗi thời qua từng năm.
// Bám design token (`styles/tokens.css`): không hardcode màu/cỡ chữ.
import { ORG } from "../../lib/orgInfo";

export function Footer() {
  const nam = new Date().getFullYear();
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border-subtle)",
        padding: "var(--sp-6) var(--sp-8)",
        display: "grid",
        gap: "var(--sp-2)",
        color: "var(--text-tertiary)",
        fontSize: "var(--fs-sm)",
        lineHeight: "var(--lh-body)",
        textAlign: "center",
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>{ORG.sanPham}</strong> là sản phẩm đang trong giai đoạn{" "}
        <strong>thử nghiệm (Beta)</strong>, thuộc sở hữu của {ORG.congTy}. Địa chỉ: {ORG.diaChi}.
      </p>
      <p style={{ margin: 0 }}>
        © {nam} {ORG.congTy}. Bản quyền được bảo lưu.
      </p>
    </footer>
  );
}

// Trang "Giới thiệu & Ủng hộ" (U16) — thuần tĩnh: mục đích phần mềm + 2 phần rõ ràng
// (góp ý Zalo/WhatsApp · đóng góp QR động). Không gọi API, không dữ liệu tenant. Bám
// mẫu SettingsPage + primitives + tokens.
import type { ReactNode } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Card } from "../../components/ui/primitives";
import { CONTACT_PHONE } from "../../lib/contact";
import { whatsappUrl, zaloUrl } from "../../lib/contactLinks";
import { DonationQr } from "./DonationQr";

/** Nút-liên-kết ra ngoài (thẻ <a> đúng ngữ nghĩa, mở tab mới, chống tabnabbing). */
function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-3) var(--sp-5)",
        fontSize: "var(--fs-base)",
        fontWeight: "var(--fw-semibold)",
        color: "#fff",
        background: "var(--brand-600)",
        border: "1px solid transparent",
        borderRadius: "var(--radius-md)",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>{children}</h2>;
}

const bodyStyle = {
  color: "var(--text-secondary)",
  lineHeight: "var(--lh-body)",
  margin: "var(--sp-3) 0 0",
} as const;

export function AboutPage() {
  return (
    <div style={{ display: "grid", gap: "var(--sp-4)" }}>
      <PageHeader
        title="Giới thiệu & Ủng hộ"
        subtitle="Vì sao có VATEngine, và cách bạn tiếp sức"
      />

      <Card>
        <SectionTitle>VATEngine giúp gì cho bạn?</SectionTitle>
        <p style={bodyStyle}>
          VATEngine giúp doanh nghiệp nhỏ tự tra cứu, kết xuất và đối chiếu hóa đơn điện tử trực
          tiếp từ hệ thống của Tổng cục Thuế bằng chính tài khoản của mình. Bạn không phải mua phần
          mềm kế toán đắt tiền chỉ để lấy hóa đơn, cũng không phải bỏ nhiều giờ tải và nhập tay từng
          hóa đơn mỗi kỳ — tiết kiệm cả chi phí phần mềm lẫn thời gian nhân sự.
        </p>
      </Card>

      <Card>
        <SectionTitle>Góp ý &amp; hỗ trợ</SectionTitle>
        <p style={bodyStyle}>
          Mọi góp ý, báo lỗi hay đề xuất tính năng đều được đón nhận. Nhắn trực tiếp cho nhóm phát
          triển:
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--sp-3)",
            marginTop: "var(--sp-4)",
          }}
        >
          <LinkButton href={zaloUrl(CONTACT_PHONE)}>Góp ý qua Zalo</LinkButton>
          <LinkButton href={whatsappUrl(CONTACT_PHONE)}>Góp ý qua WhatsApp</LinkButton>
        </div>
      </Card>

      <Card>
        <SectionTitle>Đóng góp duy trì &amp; phát triển</SectionTitle>
        <p style={bodyStyle}>
          VATEngine đang miễn phí cho doanh nghiệp nhỏ. Nếu phần mềm giúp ích cho công việc của bạn,
          một khoản đóng góp — dù nhỏ — sẽ giúp duy trì máy chủ và phát triển thêm tính năng. Chọn
          mức bên dưới rồi quét mã QR để ủng hộ:
        </p>
        <div style={{ marginTop: "var(--sp-5)" }}>
          <DonationQr />
        </div>
        <div style={{ marginTop: "var(--sp-5)" }}>
          <Alert tone="success">Cảm ơn bạn đã đồng hành cùng VATEngine. 🙏</Alert>
        </div>
      </Card>
    </div>
  );
}

// Trang "Giới thiệu & Hỗ trợ" (U16b) — mục đích phần mềm + Trung tâm hỗ trợ & tài liệu
// (FAQ + liên hệ) + Lịch sử cập nhật. Đóng góp QR ẩn bằng cờ SHOW_DONATION, code giữ
// nguyên để bật lại. Thuần tĩnh: không gọi API, không dữ liệu tenant.
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Card, SectionTitle } from "../../components/ui/primitives";
import { SHOW_DONATION } from "../../lib/donation";
import { Changelog } from "./Changelog";
import { DonationQr } from "./DonationQr";
import { SupportCenter } from "./SupportCenter";

const bodyStyle = {
  color: "var(--text-secondary)",
  lineHeight: "var(--lh-body)",
  margin: "var(--sp-3) 0 0",
} as const;

export function AboutPage() {
  return (
    <div style={{ display: "grid", gap: "var(--sp-4)" }}>
      <PageHeader
        title="Giới thiệu & Hỗ trợ"
        subtitle="Vì sao có VATEngine, và cách bạn được hỗ trợ"
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

      {/* U41 — hai neo `#faq` và `#lich-su` là ĐÍCH của liên kết trong Footer bốn cột. Đổi
          hoặc bỏ `id` ở đây sẽ làm hai liên kết đó rơi vào đầu trang mà không báo lỗi gì. */}
      <div id="faq">
        <Card>
          <SectionTitle>Trung tâm hỗ trợ &amp; tài liệu</SectionTitle>
          <div style={{ marginTop: "var(--sp-3)" }}>
            <SupportCenter />
          </div>
        </Card>
      </div>

      <div id="lich-su">
        <Card>
          <SectionTitle>Lịch sử cập nhật phần mềm</SectionTitle>
          <div style={{ marginTop: "var(--sp-3)" }}>
            <Changelog />
          </div>
        </Card>
      </div>

      {SHOW_DONATION && (
        <Card>
          <SectionTitle>Đóng góp duy trì &amp; phát triển</SectionTitle>
          <p style={bodyStyle}>
            VATEngine đang miễn phí cho doanh nghiệp nhỏ. Nếu phần mềm giúp ích cho công việc của
            bạn, một khoản đóng góp — dù nhỏ — sẽ giúp duy trì máy chủ và phát triển thêm tính năng.
            Chọn mức bên dưới rồi quét mã QR để ủng hộ:
          </p>
          <div style={{ marginTop: "var(--sp-5)" }}>
            <DonationQr />
          </div>
          <div style={{ marginTop: "var(--sp-5)" }}>
            <Alert tone="success">Cảm ơn bạn đã đồng hành cùng VATEngine.</Alert>
          </div>
        </Card>
      )}
    </div>
  );
}

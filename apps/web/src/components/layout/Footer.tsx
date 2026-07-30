// U41 — Footer bốn cột, có mặt ở MỌI trang (trước đây chỉ màn Đăng nhập mới có).
//
// NGUỒN SỰ THẬT — không chép chuỗi vào JSX:
//   • pháp nhân → `lib/orgInfo.ts`   • liên kết sản phẩm → `lib/nav.ts`
//   • số liên hệ → `lib/contact.ts`  • URL Zalo/WhatsApp → `lib/contactLinks.ts`
// Chép là tạo nguồn sự thật thứ hai. Riêng địa chỉ pháp nhân thì hậu quả không chỉ là lệch:
// bản mockup 30/07 ghi một địa chỉ HOÀN TOÀN BỊA ("Số 12 đường Trần Phú…") trong khi mã số
// thuế lại đúng, nên nhìn lướt rất giống thật. `footerNhieuCot.test.tsx` có ca chống-bịa.
//
// HAI BIẾN THỂ, khác nhau đúng một cột:
//   • có `role`  → trong ứng dụng, hiện cột "Sản phẩm" lọc theo vai.
//   • không role → màn Đăng nhập, ẨN cột đó. Chưa đăng nhập thì mọi liên kết ấy đều bật về
//     màn đăng nhập, tức liên kết chết.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CONTACT_PHONE } from "../../lib/contact";
import { whatsappUrl, zaloUrl } from "../../lib/contactLinks";
import { vi } from "../../lib/i18n/vi";
import { NAV_CHINH, navHienThi } from "../../lib/nav";
import { ORG } from "../../lib/orgInfo";
import type { Role } from "../../types/api";
import { Badge, SectionTitle } from "../ui/primitives";

/** Một cột: tiêu đề + nội dung. Tiêu đề dùng `SectionTitle` (h2, `--fs-lg`) — theo ui.md
 * tiêu đề luôn lớn hơn thân và KHÔNG viết hoa toàn phần. */
function Cot({ tieuDe, children }: { tieuDe: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "var(--sp-3)", alignContent: "start" }}>
      <SectionTitle>{tieuDe}</SectionTitle>
      <div style={{ display: "grid", gap: "var(--sp-2)" }}>{children}</div>
    </div>
  );
}

const kieuLienKet = {
  color: "var(--text-secondary)",
  textDecoration: "none",
  fontSize: "var(--fs-base)",
  lineHeight: "var(--lh-body)",
} as const;

/** Liên kết trong ứng dụng (react-router). */
function LienKetTrong({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} style={kieuLienKet}>
      {children}
    </Link>
  );
}

/** Liên kết ra ngoài — luôn kèm `rel` an toàn khi mở tab mới. */
function LienKetNgoai({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={kieuLienKet}>
      {children}
    </a>
  );
}

export function Footer({ role }: { role?: Role }) {
  const nam = new Date().getFullYear();
  // Cột "Sản phẩm" = các trang làm việc. Bỏ "/" (Tổng quan) vì footer nằm NGAY dưới chính
  // trang đó ở phần lớn trường hợp — liên kết về chỗ đang đứng là nhiễu, không phải lối đi.
  const sanPham = role ? navHienThi(NAV_CHINH, role).filter((m) => m.to !== "/") : [];

  return (
    <footer
      style={{
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--surface-card)",
        marginTop: "var(--sp-10)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "var(--sp-10) var(--sp-8)",
          display: "grid",
          // `auto-fit` + minmax: bốn cột trên khổ rộng, tự rơi về một cột ở bản hẹp mà không
          // cần media query — và tự cân lại khi cột "Sản phẩm" vắng mặt ở màn Đăng nhập.
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--sp-8)",
        }}
      >
        {/* Cột 1 — thương hiệu. Không có tiêu đề cột: chính wordmark đóng vai đó. */}
        <div style={{ display: "grid", gap: "var(--sp-3)", alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
            <span
              style={{
                fontSize: "var(--fs-lg)",
                fontWeight: "var(--fw-bold)",
                color: "var(--brand-600)",
              }}
            >
              {ORG.sanPham}
            </span>
            <Badge>Beta</Badge>
          </div>
          <p
            style={{
              margin: 0,
              color: "var(--text-tertiary)",
              fontSize: "var(--fs-base)",
              lineHeight: "var(--lh-body)",
            }}
          >
            {vi.brandTagline}
          </p>
        </div>

        {/* Cột 2 — sản phẩm. Vắng hẳn ở màn Đăng nhập. */}
        {sanPham.length > 0 && (
          <Cot tieuDe="Sản phẩm">
            {sanPham.map((m) => (
              <LienKetTrong key={m.to} to={m.to}>
                {m.label}
              </LienKetTrong>
            ))}
          </Cot>
        )}

        {/* Cột 3 — hỗ trợ. Hai neo trỏ vào mục trong trang Giới thiệu & Hỗ trợ. */}
        <Cot tieuDe="Hỗ trợ">
          <LienKetTrong to="/gioi-thieu">{vi.navAbout}</LienKetTrong>
          <LienKetTrong to="/gioi-thieu#faq">Câu hỏi thường gặp</LienKetTrong>
          <LienKetTrong to="/gioi-thieu#lich-su">Lịch sử cập nhật</LienKetTrong>
          <LienKetNgoai href={zaloUrl(CONTACT_PHONE)}>Góp ý qua Zalo</LienKetNgoai>
          <LienKetNgoai href={whatsappUrl(CONTACT_PHONE)}>Góp ý qua WhatsApp</LienKetNgoai>
        </Cot>

        {/* Cột 4 — pháp nhân. Mọi chuỗi từ ORG. */}
        <Cot tieuDe="Pháp nhân">
          <span
            style={{
              fontWeight: "var(--fw-semibold)",
              color: "var(--text-secondary)",
              fontSize: "var(--fs-base)",
            }}
          >
            {ORG.congTy}
          </span>
          <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-base)" }}>
            Mã số thuế: <span className="tabular">{ORG.mst}</span>
          </span>
          <address
            style={{
              margin: 0,
              fontStyle: "normal",
              color: "var(--text-tertiary)",
              fontSize: "var(--fs-base)",
              lineHeight: "var(--lh-body)",
            }}
          >
            {ORG.diaChi}
          </address>
        </Cot>
      </div>

      {/* Dải đáy — bản quyền + hạ tầng. */}
      <div
        style={{
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--surface-muted)",
          padding: "var(--sp-5) var(--sp-8)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "var(--sp-3)",
            color: "var(--text-tertiary)",
            fontSize: "var(--fs-base)",
            lineHeight: "var(--lh-body)",
          }}
        >
          <span>
            © {nam} {ORG.congTy}. Bản quyền được bảo lưu.
          </span>
          <span>{ORG.haTang}.</span>
        </div>
      </div>
    </footer>
  );
}

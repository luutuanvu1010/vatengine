// Khối "Cần hỗ trợ?" trên các trang CÔNG KHAI (Đăng nhập, Đăng ký).
//
// VỊ TRÍ CÓ CHỦ ĐÍCH — cột trái, ngay dưới form. `LoginPage` đặt `hidden={isMobile}` cho
// panel giới thiệu bên phải, nên mọi thứ đặt vào panel đó biến mất trên điện thoại.
//
// NGUỒN SỰ THẬT — không gõ chuỗi rời: số điện thoại + giờ hỗ trợ đọc từ `lib/contact.ts`;
// URL Zalo/tel dựng bằng hàm ở `lib/contactLinks.ts`.
import { CONTACT_PHONE, GIO_HO_TRO } from "../lib/contact";
import { hienThiSoDienThoai, telUrl, zaloUrl } from "../lib/contactLinks";
import { LienKetNut, SectionTitle } from "./ui/primitives";

export function KhoiHoTro() {
  return (
    <div
      style={{
        display: "grid",
        gap: "var(--sp-3)",
        paddingTop: "var(--sp-4)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <SectionTitle>Cần hỗ trợ?</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <LienKetNut href={zaloUrl(CONTACT_PHONE)}>Nhắn qua Zalo</LienKetNut>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "var(--fs-base)",
          lineHeight: "var(--lh-body)",
          color: "var(--text-secondary)",
        }}
      >
        Hoặc gọi{" "}
        <a href={telUrl(CONTACT_PHONE)} style={{ color: "var(--info-600)" }}>
          {hienThiSoDienThoai(CONTACT_PHONE)}
        </a>{" "}
        — giờ hỗ trợ {GIO_HO_TRO}.
      </p>
    </div>
  );
}

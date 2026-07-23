// Biểu tượng thương hiệu Cloudflare (inline SVG). Đặt ở `components/` chứ KHÔNG `features/`
// vì màu logo là màu THƯƠNG HIỆU cố định của bên thứ ba (#f6821f — cam Cloudflare chính thức),
// không phải token trong hệ thiết kế của ta; luật ui.md cấm hex cứng trong `features/`, và
// biểu tượng thương hiệu (như <Brand>) thuộc `components/`. Kích thước theo prop `size`.
export function CloudflareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#f6821f"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M16.5 16.3l.28-.95c.33-1.13.2-2.17-.36-2.94-.51-.71-1.37-1.12-2.4-1.17l-8.02-.1a.16.16 0 01-.12-.07.16.16 0 01-.02-.14.21.21 0 01.19-.14l8.09-.1c.96-.04 2-.82 2.36-1.77l.46-1.2A.28.28 0 0017.4 6a5.34 5.34 0 00-10.26-.55A2.4 2.4 0 003.4 7.9a2.44 2.44 0 00.06.66.11.11 0 01-.1.13H3.3c-1.8.17-3.3 1.7-3.3 3.5 0 .17.01.33.03.5a.16.16 0 00.16.14h14.8c.09 0 .17-.06.2-.15l1.31-.38z" />
      <path d="M19.9 9.4h-.23a.14.14 0 00-.13.1l-.31 1.08c-.33 1.13-.2 2.17.36 2.94.51.71 1.37 1.12 2.4 1.17l1.71.1a.16.16 0 01.12.07.16.16 0 01.02.15.21.21 0 01-.19.14l-1.78.1c-.96.05-2 .82-2.36 1.78l-.13.33a.1.1 0 00.08.13h6.12a.17.17 0 00.16-.12c.11-.4.17-.81.17-1.24 0-2.6-2.11-4.71-4.71-4.71z" />
    </svg>
  );
}

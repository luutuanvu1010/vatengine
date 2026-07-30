import { NavLink } from "react-router-dom";
// U41 — danh sách mục điều hướng KHÔNG còn khai ở đây. Nguồn duy nhất: `lib/nav.ts`, dùng
// chung với Footer bốn cột và khối "Lối tắt" ở Tổng quan. Kỷ luật cũ giữ nguyên: cờ tính năng
// lọc ở tầng danh sách, RBAC (`visible`) lọc ở tầng vai — xem đầu `lib/nav.ts`.
import { NAV_CHINH, NAV_HE_THONG, type NavItem, navHienThi } from "../../lib/nav";
import type { Role } from "../../types/api";
import { Brand } from "../Brand";

function NavGroup({
  title,
  items,
  role,
  onNavigate,
}: {
  title: string;
  items: readonly NavItem[];
  role: Role;
  /** Gọi khi bấm một mục — dùng để đóng drawer trên mobile. */
  onNavigate?: () => void;
}) {
  const shown = navHienThi(items, role);
  if (shown.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: "var(--sp-1)" }}>
      <div
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontSize: "var(--fs-xs)",
          color: "var(--text-disabled)",
          padding: "0 var(--sp-3)",
          marginTop: "var(--sp-3)",
        }}
      >
        {title}
      </div>
      {shown.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          onClick={onNavigate}
          style={({ isActive }) => ({
            padding: "var(--sp-3) var(--sp-3)",
            borderRadius: "var(--radius-md)",
            fontWeight: "var(--fw-semibold)",
            fontSize: "var(--fs-base)",
            textDecoration: "none",
            color: isActive ? "var(--brand-700)" : "var(--text-secondary)",
            background: isActive ? "var(--brand-50)" : "transparent",
          })}
        >
          {it.label}
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar({
  role,
  onNavigate,
  style,
}: {
  role: Role;
  /** Đóng drawer sau khi điều hướng (mobile). Bỏ trống ở chế độ sidebar tĩnh (desktop). */
  onNavigate?: () => void;
  /** Ghi đè định vị cho chế độ drawer (fixed + translateX). Desktop giữ mặc định. */
  style?: React.CSSProperties;
}) {
  return (
    <nav
      id="app-sidebar"
      aria-label="Điều hướng chính"
      style={{
        width: 248,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--surface-card)",
        padding: "var(--sp-4)",
        display: "grid",
        gap: "var(--sp-2)",
        alignContent: "start",
        minHeight: "100vh",
        ...style,
      }}
    >
      <div style={{ padding: "var(--sp-2) var(--sp-3) var(--sp-3)" }}>
        <Brand />
      </div>
      <NavGroup title="Chính" items={NAV_CHINH} role={role} onNavigate={onNavigate} />
      <NavGroup title="Hệ thống" items={NAV_HE_THONG} role={role} onNavigate={onNavigate} />
    </nav>
  );
}

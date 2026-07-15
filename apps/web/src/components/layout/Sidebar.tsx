import { NavLink } from "react-router-dom";
import { vi } from "../../lib/i18n/vi";
import { canExport, canManageTaxAccounts } from "../../lib/rbac";
import type { Role } from "../../types/api";
import { Brand } from "../Brand";

interface NavItem {
  to: string;
  label: string;
  /** Guard hiển thị theo vai (undefined = mọi vai). Phản chiếu RBAC server (BINDING_MAP §6). */
  visible?: (role: Role) => boolean;
  end?: boolean;
}

const MAIN: NavItem[] = [
  { to: "/", label: vi.navDashboard, end: true },
  { to: "/invoices", label: vi.navInvoices },
  { to: "/reconcile", label: vi.navReconcile },
  { to: "/exports", label: vi.navExports, visible: canExport },
  { to: "/tax-accounts", label: vi.navTaxAccounts, visible: canManageTaxAccounts },
];

const SYSTEM: NavItem[] = [{ to: "/settings", label: vi.navSettings }];

function NavGroup({
  title,
  items,
  role,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  role: Role;
  /** Gọi khi bấm một mục — dùng để đóng drawer trên mobile. */
  onNavigate?: () => void;
}) {
  const shown = items.filter((it) => !it.visible || it.visible(role));
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
      <NavGroup title="Chính" items={MAIN} role={role} onNavigate={onNavigate} />
      <NavGroup title="Hệ thống" items={SYSTEM} role={role} onNavigate={onNavigate} />
    </nav>
  );
}

import { Outlet } from "react-router-dom";
import { vi } from "../../lib/i18n/vi";
import { labelRole } from "../../lib/rbac";
import type { MeResponse } from "../../types/api";
import { Sidebar } from "./Sidebar";

/** Khung sau đăng nhập: sidebar trái + header (tên DN + vai + đăng xuất) + nội dung. */
export function AppLayout({ me, onLogout }: { me: MeResponse; onLogout: () => void }) {
  const initials = me.ten.trim().slice(0, 2).toUpperCase();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar role={me.role} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "var(--sp-3)",
            padding: "var(--sp-3) var(--sp-6)",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-card)",
          }}
        >
          <span
            title={`MST ${me.mst}`}
            style={{
              padding: "var(--sp-2) var(--sp-3)",
              background: "var(--surface-muted)",
              borderRadius: "var(--radius-pill)",
              fontSize: "var(--fs-sm)",
              fontWeight: "var(--fw-semibold)",
            }}
          >
            {me.ten}
          </span>
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>
            {labelRole(me.role)}
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-full)",
              background: "var(--brand-600)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--fs-xs)",
              fontWeight: "var(--fw-bold)",
            }}
          >
            {initials}
          </span>
          <button
            type="button"
            onClick={onLogout}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--sp-2) var(--sp-3)",
              cursor: "pointer",
              fontSize: "var(--fs-sm)",
              color: "var(--text-secondary)",
            }}
          >
            {vi.logout}
          </button>
        </header>
        <main style={{ flex: 1, padding: "var(--sp-6)", maxWidth: 1200, width: "100%" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

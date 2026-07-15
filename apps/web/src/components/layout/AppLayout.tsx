import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../features/auth/auth-context";
import { labelRole } from "../../lib/rbac";
import { MOBILE_QUERY, useMediaQuery } from "../../lib/useMediaQuery";
import type { MeResponse } from "../../types/api";
import { ProfileMenu } from "./ProfileMenu";
import { Sidebar } from "./Sidebar";

/** Khung sau đăng nhập: sidebar trái + header (tên DN + vai + đăng xuất) + nội dung.
 * Mobile (⩽767px): sidebar ẩn thành drawer trượt, mở bằng hamburger ở header. */
export function AppLayout({ me, onLogout }: { me: MeResponse; onLogout: () => void }) {
  const { email } = useAuth();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Về desktop → đóng drawer (tránh kẹt overlay khi xoay ngang/phóng to cửa sổ).
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  // Esc đóng drawer (a11y — khớp click-overlay).
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {isMobile ? (
        <>
          {drawerOpen ? (
            <button
              type="button"
              aria-label="Đóng menu"
              onClick={() => setDrawerOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 40,
                border: "none",
                background: "rgba(32, 33, 36, 0.45)",
                cursor: "pointer",
              }}
            />
          ) : null}
          <Sidebar
            role={me.role}
            onNavigate={() => setDrawerOpen(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              height: "100vh",
              zIndex: 50,
              overflowY: "auto",
              boxShadow: drawerOpen ? "var(--shadow-md)" : "none",
              transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.2s ease",
            }}
          />
        </>
      ) : (
        <Sidebar role={me.role} />
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--sp-2)",
            padding: isMobile ? "var(--sp-3) var(--sp-4)" : "var(--sp-3) var(--sp-6)",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-card)",
          }}
        >
          {isMobile ? (
            <button
              type="button"
              aria-label="Mở menu"
              aria-expanded={drawerOpen}
              aria-controls="app-sidebar"
              onClick={() => setDrawerOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                flexShrink: 0,
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true" style={{ display: "grid", gap: 4, width: 18 }}>
                <span style={{ height: 2, borderRadius: 2, background: "var(--text-secondary)" }} />
                <span style={{ height: 2, borderRadius: 2, background: "var(--text-secondary)" }} />
                <span style={{ height: 2, borderRadius: 2, background: "var(--text-secondary)" }} />
              </span>
            </button>
          ) : (
            // Giữ chỗ để cụm thông tin luôn dạt phải (space-between) trên desktop.
            <span />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", minWidth: 0 }}>
            <span
              title={`MST ${me.mst}`}
              style={{
                padding: "var(--sp-2) var(--sp-3)",
                background: "var(--surface-muted)",
                borderRadius: "var(--radius-pill)",
                fontSize: "var(--fs-sm)",
                fontWeight: "var(--fw-semibold)",
                maxWidth: isMobile ? 150 : 340,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {me.ten}
            </span>
            {isMobile ? null : (
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>
                {labelRole(me.role)}
              </span>
            )}
            <ProfileMenu me={me} email={email} onLogout={onLogout} />
          </div>
        </header>
        <main
          style={{
            flex: 1,
            padding: isMobile ? "var(--sp-4)" : "var(--sp-6)",
            maxWidth: 1200,
            width: "100%",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

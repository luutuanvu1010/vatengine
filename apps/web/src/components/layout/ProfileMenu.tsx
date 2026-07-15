// Dropdown hồ sơ ở header: avatar → menu (Tên/Email/Bản quyền/Ghi chú + Sửa hồ sơ + Đăng xuất).
// Đóng khi bấm ngoài hoặc Esc (a11y, khớp mẫu drawer AppLayout).
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { vi as viLabels } from "../../lib/i18n/vi";
import type { MeResponse } from "../../types/api";

export function ProfileMenu({
  me,
  email,
  onLogout,
}: {
  me: MeResponse;
  email: string | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = me.ten.trim().slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Mở hồ sơ"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 32,
          height: 32,
          borderRadius: "var(--radius-full)",
          background: "var(--brand-600)",
          color: "#fff",
          border: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--fs-xs)",
          fontWeight: "var(--fw-bold)",
          cursor: "pointer",
        }}
      >
        {initials}
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + var(--sp-2))",
            right: 0,
            zIndex: 60,
            minWidth: 240,
            background: "var(--surface-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            padding: "var(--sp-3)",
            display: "grid",
            gap: "var(--sp-2)",
          }}
        >
          <div style={{ fontWeight: "var(--fw-bold)" }}>{me.ten}</div>
          {email ? (
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)" }}>{email}</div>
          ) : null}
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>
            Bản quyền: <span>{me.banQuyen}</span>
          </div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>
            Ghi chú: <span>{me.ghiChu ?? "—"}</span>
          </div>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            style={{
              marginTop: "var(--sp-2)",
              color: "var(--brand-700)",
              textDecoration: "none",
              fontWeight: "var(--fw-semibold)",
              fontSize: "var(--fs-sm)",
            }}
          >
            Sửa hồ sơ
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            style={{
              textAlign: "left",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: "var(--fs-sm)",
            }}
          >
            {viLabels.logout}
          </button>
        </div>
      ) : null}
    </div>
  );
}

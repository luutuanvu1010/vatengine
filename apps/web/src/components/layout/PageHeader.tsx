import type { ReactNode } from "react";

/** Tiêu đề trang chuẩn — dùng chung mọi màn để nhất quán (brief §5). */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--sp-4)",
        marginBottom: "var(--sp-6)",
      }}
    >
      <div>
        <h1 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-extrabold)" }}>{title}</h1>
        {subtitle ? (
          <p style={{ color: "var(--text-tertiary)", marginTop: "var(--sp-1)" }}>{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: "var(--sp-2)" }}>{actions}</div> : null}
    </header>
  );
}

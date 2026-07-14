// Bộ primitive UI dùng chung — bám 07-DESIGN_TOKENS (chỉ dùng biến --…, không hardcode
// hex). Nhất quán mọi màn: cùng nút/thẻ/cảnh báo/trạng thái (brief §5).
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { vi } from "../../lib/i18n/vi";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const buttonBg: Record<ButtonVariant, string> = {
  primary: "var(--brand-600)",
  secondary: "var(--surface-card)",
  danger: "var(--danger-600)",
  ghost: "transparent",
};

export function Button({ variant = "primary", style, ...rest }: ButtonProps) {
  const outlined = variant === "secondary";
  return (
    <button
      type="button"
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-3) var(--sp-5)",
        fontSize: "var(--fs-base)",
        fontWeight: "var(--fw-semibold)",
        fontFamily: "inherit",
        color: variant === "secondary" || variant === "ghost" ? "var(--text-primary)" : "#fff",
        background: buttonBg[variant],
        border: outlined ? "1px solid var(--border)" : "1px solid transparent",
        borderRadius: "var(--radius-md)",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.6 : 1,
        ...style,
      }}
    />
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, id, ...rest }: TextFieldProps) {
  const genId = useId();
  const inputId = id ?? genId;
  return (
    <div style={{ display: "grid", gap: "var(--sp-1)" }}>
      <label
        htmlFor={inputId}
        style={{
          fontSize: "var(--fs-sm)",
          fontWeight: "var(--fw-semibold)",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </label>
      <input
        id={inputId}
        {...rest}
        style={{
          padding: "var(--sp-3) var(--sp-4)",
          fontSize: "var(--fs-base)",
          fontFamily: "inherit",
          color: "var(--text-primary)",
          background: "var(--surface-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "var(--sp-6)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type Tone = "info" | "warning" | "danger" | "success";
const toneStyles: Record<Tone, { bg: string; border: string; fg: string }> = {
  info: { bg: "var(--info-50)", border: "var(--info-200)", fg: "var(--info-700)" },
  warning: { bg: "var(--warning-50)", border: "var(--warning-200)", fg: "var(--warning-800)" },
  danger: { bg: "var(--danger-50)", border: "var(--danger-200)", fg: "var(--brand-700)" },
  success: { bg: "var(--success-50)", border: "var(--success-200)", fg: "var(--success-700)" },
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const s = toneStyles[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--sp-3) var(--sp-4)",
        color: s.fg,
        fontSize: "var(--fs-sm)",
      }}
    >
      {children}
    </div>
  );
}

// --- 4 trạng thái mỗi màn (brief §5: không "màn trắng") ------------------------------
export function Loading({ label = vi.loading }: { label?: string }) {
  return (
    <output
      aria-live="polite"
      style={{
        display: "block",
        padding: "var(--sp-8)",
        textAlign: "center",
        color: "var(--text-tertiary)",
      }}
    >
      {label}
    </output>
  );
}

export function EmptyState({ message = vi.empty }: { message?: string }) {
  return (
    <div style={{ padding: "var(--sp-8)", textAlign: "center", color: "var(--text-tertiary)" }}>
      {message}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={{
        padding: "var(--sp-6)",
        textAlign: "center",
        display: "grid",
        gap: "var(--sp-3)",
        justifyItems: "center",
      }}
    >
      <div style={{ color: "var(--brand-700)", fontWeight: "var(--fw-semibold)" }}>
        {vi.errorTitle}
      </div>
      <div style={{ color: "var(--text-tertiary)" }}>{message ?? ""}</div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {vi.retry}
        </Button>
      ) : null}
    </div>
  );
}

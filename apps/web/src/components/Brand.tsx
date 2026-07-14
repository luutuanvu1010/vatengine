import { vi } from "../lib/i18n/vi";

interface BrandProps {
  size?: "sm" | "lg";
}

/** Wordmark VATEngine — "VAT" trung tính + "Engine" đỏ thương hiệu, kèm ô icon tia sét
 * (07-DESIGN_TOKENS: brand-600). Chưa có logo chính thức (brief §5). */
export function Brand({ size = "sm" }: BrandProps) {
  const box = size === "lg" ? 36 : 28;
  const fontSize = size === "lg" ? "var(--fs-2xl)" : "var(--fs-lg)";
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}
      aria-label={vi.brand}
    >
      <span
        aria-hidden="true"
        style={{
          width: box,
          height: box,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--brand-600)",
          color: "#fff",
          borderRadius: "var(--radius-xl)",
          fontSize: size === "lg" ? 20 : 16,
        }}
      >
        ⚡
      </span>
      <span style={{ fontSize, fontWeight: "var(--fw-extrabold)", letterSpacing: "-0.01em" }}>
        <span style={{ color: "var(--text-primary)" }}>VAT</span>
        <span style={{ color: "var(--brand-600)" }}>Engine</span>
      </span>
    </span>
  );
}

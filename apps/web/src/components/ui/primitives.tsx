// Bộ primitive UI dùng chung — bám 07-DESIGN_TOKENS (chỉ dùng biến --…, không hardcode
// hex). Nhất quán mọi màn: cùng nút/thẻ/cảnh báo/trạng thái (brief §5).
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
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

// Ô nhập/chọn dùng trong thanh lọc: gọn (inline), nhãn có thể ẩn về mặt thị giác nhưng
// LUÔN gắn `htmlFor`↔`id` để trình đọc màn hình đọc được (a11y — Luật ui.md). Kiểu đến từ
// token, không tô nội tuyến ở nơi dùng (features/ bị phép kiểm convention chặn `style=`).
const nhanCss: React.CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--text-secondary)",
};
const oNhapCss: React.CSSProperties = {
  padding: "var(--sp-2) var(--sp-3)",
  fontSize: "var(--fs-sm)",
  fontFamily: "inherit",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
};

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

// Cỡ bề rộng tối thiểu cho ô lọc — để hàng lọc TỰ XUỐNG HÀNG gọn thay vì dồn một hàng dài
// (min-width là gợi ý wrap, không có token spacing tương ứng nên khai TẬP TRUNG ở đây, KHÔNG
// rải px vào features/). Ô có `co` sẽ chiếm trọn bề rộng đó (width:100%) để trông cân.
const OMIN: Record<"sm" | "md" | "lg", number> = { sm: 120, md: 150, lg: 168 };
type CoO = keyof typeof OMIN;

/** Style ô nhập/chọn khi có `co`: giữ nguyên oNhapCss + lấp đầy min-width. */
function oNhapVoiCo(co?: CoO): React.CSSProperties {
  return co ? { ...oNhapCss, width: "100%", boxSizing: "border-box" } : oNhapCss;
}
function boc(co?: CoO): React.CSSProperties {
  return co
    ? { display: "inline-grid", gap: "var(--sp-1)", minWidth: OMIN[co] }
    : { display: "inline-grid", gap: "var(--sp-1)" };
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Ẩn nhãn về mặt thị giác (vẫn đọc được cho trình đọc màn hình). */
  hideLabel?: boolean;
  /** Cỡ bề rộng tối thiểu (sm/md/lg) — bật hành vi wrap gọn trong thanh lọc. */
  co?: CoO;
}

/** Ô nhập gọn cho thanh lọc — khác `TextField` (khối, nhãn to) ở chỗ inline + nhãn ẩn được. */
export function Field({ label, hideLabel, co, id, ...rest }: FieldProps) {
  const genId = useId();
  const inputId = id ?? genId;
  return (
    <span style={boc(co)}>
      <label htmlFor={inputId} style={hideLabel ? srOnly : nhanCss}>
        {label}
      </label>
      <input id={inputId} {...rest} style={oNhapVoiCo(co)} />
    </span>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
  /** Cỡ bề rộng tối thiểu (sm/md/lg) — bật hành vi wrap gọn trong thanh lọc. */
  co?: CoO;
}

/** Ô chọn primitive — `<select>` gốc (cảm ứng tốt, không cần thư viện UI nặng). */
export function Select({ label, hideLabel, co, id, children, ...rest }: SelectProps) {
  const genId = useId();
  const selectId = id ?? genId;
  return (
    <span style={boc(co)}>
      <label htmlFor={selectId} style={hideLabel ? srOnly : nhanCss}>
        {label}
      </label>
      <select id={selectId} {...rest} style={oNhapVoiCo(co)}>
        {children}
      </select>
    </span>
  );
}

// --- Checkbox (ô tick) — dùng cho panel chọn cột xuất. Kiểu ở primitive, KHÔNG tô inline
// trong features/ (phép kiểm ui-luat chặn style= trên input trong features/). ------------
export function Checkbox({
  label,
  checked,
  onChange,
  id,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}) {
  const genId = useId();
  const cid = id ?? genId;
  return (
    <label
      htmlFor={cid}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--sp-2)",
        fontSize: "var(--fs-sm)",
        color: "var(--text-secondary)",
        cursor: "pointer",
      }}
    >
      <input
        id={cid}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--brand-600)", width: 16, height: 16, cursor: "pointer" }}
      />
      {label}
    </label>
  );
}

// --- Nhãn section nhỏ (đầu mỗi Card: "BỘ LỌC" / "KẾT QUẢ"…) ---------------------------
// Chữ nhỏ, in hoa, giãn chữ — dẫn hướng thị giác giữa các khối. Một primitive để 3 card dùng
// chung, KHÔNG lặp style nội tuyến ở features/ (Luật ui.md: thiếu kiểu → thêm primitive).
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "var(--fs-sm)",
        fontWeight: "var(--fw-bold)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--text-tertiary)",
        marginBottom: "var(--sp-4)",
      }}
    >
      {children}
    </h2>
  );
}

// --- Stat / KPI (số đếm là tiêu điểm — brief §5) --------------------------------------
// Số lớn (`--fs-3xl`, tabular) + nhãn phụ; `badge` tuỳ chọn xếp dưới (vd pill "Kỳ …").
export function Stat({
  value,
  label,
  badge,
}: {
  value: string | number;
  label: string;
  badge?: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: "var(--sp-3)" }}>
      <div
        style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)", flexWrap: "wrap" }}
      >
        <span
          className="tabular"
          style={{
            fontSize: "var(--fs-3xl)",
            lineHeight: 1,
            fontWeight: "var(--fw-extrabold)",
            color: "var(--text-primary)",
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>{label}</span>
      </div>
      {badge}
    </div>
  );
}

// --- Badge / Chip (pill) --------------------------------------------------------------
// Pill nhỏ cho nhãn phụ (kỳ đang xem, tách theo chiều…). Tone neutral mặc định; info/success
// dùng cho tách-theo-chiều nếu chủ dự án bật (mặc định TẮT).
type BadgeTone = "neutral" | "info" | "success";
const badgeTone: Record<BadgeTone, { bg: string; border: string; fg: string }> = {
  neutral: {
    bg: "var(--surface-muted)",
    border: "var(--border-subtle)",
    fg: "var(--text-secondary)",
  },
  info: { bg: "var(--info-50)", border: "var(--info-200)", fg: "var(--info-700)" },
  success: { bg: "var(--success-50)", border: "var(--success-200)", fg: "var(--success-700)" },
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  const s = badgeTone[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--sp-2)",
        alignSelf: "start",
        padding: "var(--sp-1) var(--sp-3)",
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--fs-xs)",
        fontWeight: "var(--fw-semibold)",
        color: s.fg,
      }}
    >
      {children}
    </span>
  );
}

// --- Segmented control (nhóm nút liền khối, 1 mục đang chọn nổi lên) -------------------
// Dùng cho nhóm Tháng/Quý/Năm (mockup). Bấm là gọi onChange NGAY cả khi mục đó ĐANG chọn —
// vì ở ChonKy mỗi lần bấm còn "áp kỳ hiện tại" chứ không chỉ đổi lựa chọn.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <span
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              padding: "var(--sp-2) var(--sp-4)",
              fontSize: "var(--fs-sm)",
              fontWeight: "var(--fw-semibold)",
              fontFamily: "inherit",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              background: active ? "var(--surface-card)" : "transparent",
              color: active ? "var(--brand-700)" : "var(--text-secondary)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </span>
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

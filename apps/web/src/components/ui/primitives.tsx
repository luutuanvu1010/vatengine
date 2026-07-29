// Bộ primitive UI dùng chung — bám 07-DESIGN_TOKENS (chỉ dùng biến --…, không hardcode
// hex). Nhất quán mọi màn: cùng nút/thẻ/cảnh báo/trạng thái (brief §5).
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { useEffect, useId, useRef, useState } from "react";
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
  ghiChu,
  co = "md",
}: {
  value: string | number;
  label: string;
  badge?: ReactNode;
  /** Dòng phụ nhỏ dưới số — giải thích một sắc thái của chính con số đó (vd "3 hóa đơn bị
   * thay thế - không tính vào tổng"). Đặt ở primitive để không tô kiểu nội tuyến trong
   * `features/` (ui.md). */
  ghiChu?: ReactNode;
  /** Cỡ số: "md" (tiêu điểm, mặc định) | "sm" (đứng cụm nhiều số — 2026-07-26, cụm 4 số
   * thẻ Kết quả cần vừa một hàng thay vì 4 số cỡ 3xl tràn dòng). Một nơi, không tô đè. */
  co?: "md" | "sm";
}) {
  return (
    <div style={{ display: "grid", gap: "var(--sp-3)" }}>
      <div
        style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)", flexWrap: "wrap" }}
      >
        <span
          className="tabular"
          style={{
            fontSize: co === "sm" ? "var(--fs-xl)" : "var(--fs-3xl)",
            lineHeight: 1,
            fontWeight: "var(--fw-extrabold)",
            color: "var(--text-primary)",
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>{label}</span>
      </div>
      {ghiChu ? (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>{ghiChu}</span>
      ) : null}
      {badge}
    </div>
  );
}

// --- Số đếm chưa đọc (chấm đỏ nổi góc, kiểu ứng dụng di động) -------------------------
// Chủ dự án chốt 2026-07-28. Token RIÊNG `--notify-*` (không mượn `--danger-*` vốn chỉ
// dành cho cảnh báo lệch thuế/lỗi phá hủy — 07-DESIGN_TOKENS §1 "không dùng lẫn").
//
// A11Y: chấm mang `aria-hidden` vì con số phải tới trình đọc màn hình qua `aria-label` của
// CHÍNH nút chứa nó — nếu để cả hai cùng đọc, người dùng nghe số hai lần.
// TƯƠNG TÁC: đặt chấm BÊN TRONG nút (mốc định vị là `OChuaDoc` bọc ngoài). Chấm lệch ra
// ngoài khung nút 6px; nhờ nằm trong nút, cú bấm trúng phần lòi ra đó vẫn nổi bọt lên nút
// chứ không rơi vào khoảng chết. Vì vậy KHÔNG đặt `pointerEvents: none` — làm thế sẽ vô
// hiệu hóa đúng phần lòi ra ấy.
export function SoChuaDoc({ so, tran = 99 }: { so: number; tran?: number }) {
  if (so <= 0) return null;
  return (
    <span
      data-testid="so-chua-doc"
      aria-hidden="true"
      className="tabular"
      style={{
        position: "absolute",
        top: "-6px",
        right: "-6px",
        minWidth: "18px",
        height: "18px",
        padding: "0 5px",
        borderRadius: "var(--radius-pill)",
        background: "var(--notify-600)",
        color: "var(--notify-fg)",
        fontSize: "var(--fs-xs)",
        fontWeight: "var(--fw-bold)",
        lineHeight: "18px",
        textAlign: "center",
        boxShadow: "0 0 0 2px var(--surface-card)",
      }}
    >
      {so > tran ? `${tran}+` : so}
    </span>
  );
}

/** Bọc một nút để đặt được `SoChuaDoc` ở góc — chỗ DUY NHẤT khai `position: relative` cho
 * mẫu này, để `features/` không phải tự tô. */
export function OChuaDoc({ children }: { children: ReactNode }) {
  return <span style={{ position: "relative", display: "inline-flex" }}>{children}</span>;
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

// --- InfoTip (ⓘ + tooltip) ------------------------------------------------------------
// Ghi chú giải thích KHÔNG chiếm mặt tiền (Task 11): icon ⓘ nhỏ, hover/focus mới hiện.
// a11y: trigger focus được (tabIndex 0), aria-describedby ↔ role="tooltip" khi mở.
export function InfoTip({ text, label = "Giải thích" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        tabIndex={0}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          appearance: "none",
          border: "none",
          background: "transparent",
          font: "inherit",
          cursor: "help",
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-sm)",
          lineHeight: 1,
          padding: "var(--sp-1)",
        }}
      >
        ⓘ
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "var(--sp-2)",
            width: "max-content",
            maxWidth: 280,
            padding: "var(--sp-2) var(--sp-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-inverse)",
            color: "var(--text-on-brand)",
            fontSize: "var(--fs-xs)",
            zIndex: 10,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// --- Popover (nút bật/tắt + panel nổi) -------------------------------------------------
// U35 — trích ra từ khuôn ColumnMenu (features/invoices/ColumnMenu.tsx): bật/tắt bằng
// nút trigger, đóng khi bấm ra ngoài hoặc Esc. Dùng cho mọi bề mặt "nút → panel nổi"
// dùng chung sau này (ui.md: thêm primitive khi thiếu, không tô kiểu nội tuyến rời rạc
// trong features/).
export interface PopoverProps {
  /** Nút mở/đóng — nhận {open, toggle} để tự vẽ trạng thái (vd đổi nhãn khi mở). */
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  ariaLabel: string;
  /** Panel bung sang trái hay phải mép nút trigger (mặc định trái). */
  align?: "left" | "right";
}

export function Popover({ trigger, children, ariaLabel, align = "left" }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const boc = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const ngoai = (e: MouseEvent) => {
      if (boc.current && !boc.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", ngoai);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={boc} style={{ position: "relative", display: "inline-block" }}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {/* `<fieldset>` mang sẵn role="group" (cùng khuôn ColumnMenu.tsx) — không cần
          role thủ công, và Biome a11y/useSemanticElements đòi phần tử ngữ nghĩa thật. */}
      {open && (
        <fieldset
          aria-label={ariaLabel}
          style={{
            position: "absolute",
            top: "100%",
            [align]: 0,
            zIndex: 20,
            margin: 0,
            marginTop: "var(--sp-2)",
            minWidth: 320,
            maxWidth: 400,
            background: "var(--surface-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {children}
        </fieldset>
      )}
    </span>
  );
}

// --- ComboBox (ô nhập + danh sách gợi ý lọc theo chữ đang gõ) ---------------------------
// U37b — thiếu trong thư viện; `ui.md:21` bắt thêm primitive thay vì tô kiểu nội tuyến trong
// `features/` (phép kiểm `test/conventions/ui-luat.test.ts` chặn `style=` trên input trong
// features/). Primitive này THUẦN TRÌNH BÀY: không tự nạp dữ liệu, không biết "khách hàng" là
// gì — caller đưa `items`, hàm `khop` và các thông báo trạng thái.
export interface ComboBoxItem {
  /** Giá trị ĐỊNH DANH trả về khi chọn (vd MST). */
  giaTri: string;
  /** Nhãn hiển thị + dùng để tìm. */
  nhan: string;
  /** Dòng phụ dưới nhãn (vd "MST · N hóa đơn"). */
  phu?: string;
}

export interface ComboBoxProps {
  label: string;
  hideLabel?: boolean;
  co?: CoO;
  placeholder?: string;
  /** Mục đang chọn. `undefined` = chưa chọn gì — caller dựa vào đây để khóa nút. */
  daChon?: ComboBoxItem;
  items: ComboBoxItem[];
  /** Chuỗi đang gõ có khớp mục này không (caller quyết định: bỏ dấu, khớp cả mã…). */
  khop: (daGo: string, item: ComboBoxItem) => boolean;
  onChon: (item: ComboBoxItem) => void;
  onXoa: () => void;
  /** Thay cho danh sách khi đang tải / rỗng / lỗi (bốn trạng thái — ui.md:22). */
  thongBao?: ReactNode;
  /** Dòng chân panel (vd "còn nữa, gõ thêm để thu hẹp"). */
  chanPanel?: ReactNode;
}

export function ComboBox({
  label,
  hideLabel,
  co,
  placeholder,
  daChon,
  items,
  khop,
  onChon,
  onXoa,
  thongBao,
  chanPanel,
}: ComboBoxProps) {
  const genId = useId();
  const listId = `${genId}-ds`;
  const [daGo, setDaGo] = useState(daChon?.nhan ?? "");
  const [mo, setMo] = useState(false);
  const [viTri, setViTri] = useState(-1);
  const khungRef = useRef<HTMLSpanElement>(null);

  // Lựa chọn đổi từ BÊN NGOÀI (vd bấm "Lọc dữ liệu" xong, hoặc đổi chiều) → đồng bộ ô nhập.
  useEffect(() => {
    setDaGo(daChon?.nhan ?? "");
  }, [daChon?.nhan]);

  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => {
      if (khungRef.current && !khungRef.current.contains(e.target as Node)) setMo(false);
    };
    document.addEventListener("mousedown", ngoai);
    return () => document.removeEventListener("mousedown", ngoai);
  }, [mo]);

  // Khi ô đang hiện đúng tên của mục đã chọn thì coi như "chưa gõ gì" → hiện cả danh sách,
  // để người dùng đổi sang khách khác mà không phải xóa tay.
  const chuoiLoc = daGo === daChon?.nhan ? "" : daGo;
  const hienThi = items.filter((i) => khop(chuoiLoc, i));

  const chon = (i: ComboBoxItem) => {
    onChon(i);
    setDaGo(i.nhan);
    setMo(false);
    setViTri(-1);
  };

  const banPhim = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setMo(false);
      setViTri(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMo(true);
      setViTri((v) => Math.min(v + 1, hienThi.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setViTri((v) => Math.max(v - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      const muc = hienThi[viTri];
      if (muc) {
        e.preventDefault();
        chon(muc);
      }
    }
  };

  return (
    <span ref={khungRef} style={{ ...boc(co), position: "relative", display: "inline-flex" }}>
      <label htmlFor={genId} style={hideLabel ? srOnly : nhanCss}>
        {label}
      </label>
      <input
        id={genId}
        role="combobox"
        aria-expanded={mo}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={daGo}
        onChange={(e) => {
          setDaGo(e.target.value);
          setMo(true);
          setViTri(-1);
        }}
        onFocus={() => setMo(true)}
        onClick={() => setMo(true)}
        onKeyDown={banPhim}
        style={oNhapVoiCo(co)}
      />
      {daChon ? (
        <button
          type="button"
          aria-label="Xóa khách hàng đã chọn"
          onClick={() => {
            onXoa();
            setDaGo("");
            setMo(false);
          }}
          style={{
            position: "absolute",
            right: "var(--sp-2)",
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "transparent",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            fontSize: "var(--fs-md)",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      ) : null}
      {mo ? (
        <ul
          id={listId}
          aria-label={label}
          style={{
            position: "absolute",
            top: "calc(100% + var(--sp-1))",
            left: 0,
            minWidth: "100%",
            maxHeight: 280,
            overflowY: "auto",
            background: "var(--surface-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            zIndex: 20,
            padding: "var(--sp-1)",
          }}
        >
          {thongBao ? (
            <li
              style={{
                display: "block",
                padding: "var(--sp-2) var(--sp-3)",
                fontSize: "var(--fs-sm)",
                color: "var(--text-secondary)",
              }}
            >
              {thongBao}
            </li>
          ) : hienThi.length === 0 ? (
            <li
              style={{
                display: "block",
                padding: "var(--sp-2) var(--sp-3)",
                fontSize: "var(--fs-sm)",
                color: "var(--text-secondary)",
              }}
            >
              Không tìm thấy khách hàng nào khớp.
            </li>
          ) : (
            hienThi.map((i, n) => (
              <li key={i.giaTri}>
                <button
                  type="button"
                  aria-current={n === viTri}
                  onMouseEnter={() => setViTri(n)}
                  onClick={() => chon(i)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    cursor: "pointer",
                    padding: "var(--sp-2) var(--sp-3)",
                    borderRadius: "var(--radius-sm)",
                    background: n === viTri ? "var(--surface-hover)" : "transparent",
                  }}
                >
                  <span style={{ display: "block", fontSize: "var(--fs-sm)" }}>{i.nhan}</span>
                  {i.phu ? (
                    <span
                      style={{
                        display: "block",
                        fontSize: "var(--fs-xs)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {i.phu}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
          {chanPanel ? (
            <li
              style={{
                display: "block",
                padding: "var(--sp-2) var(--sp-3)",
                borderTop: "1px solid var(--border-subtle)",
                fontSize: "var(--fs-xs)",
                color: "var(--text-tertiary)",
              }}
            >
              {chanPanel}
            </li>
          ) : null}
        </ul>
      ) : null}
    </span>
  );
}

// --- Bố cục: Hang / Cot / ChuPhu -------------------------------------------------------
// U37b — thư viện trước đây KHÔNG có primitive bố cục, nên mọi màn phải tự tô
// `display:flex; gap:var(--sp-N)` rải rác trong `features/` — đúng thứ ui.md mục 2 cấm
// ("thiếu primitive thì THÊM primitive, không tô kiểu nội tuyến"). Ba primitive dưới đây
// gom việc đó về một chỗ; màn khác thêm sau tự hưởng, không phải chép lại.

/** Khoảng cách theo thang token, KHÔNG nhận px thô. */
type Khoang = "1" | "2" | "3" | "4" | "6";

/** Hàng ngang. `xuongDong` cho phép gãy dòng khi hẹp (thanh công cụ nhiều nút). */
export function Hang({
  children,
  khoang = "2",
  canGiua = true,
  xuongDong = false,
}: {
  children: ReactNode;
  khoang?: Khoang;
  canGiua?: boolean;
  xuongDong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: canGiua ? "center" : "flex-start",
        flexWrap: xuongDong ? "wrap" : "nowrap",
        gap: `var(--sp-${khoang})`,
      }}
    >
      {children}
    </div>
  );
}

/** Cột dọc — dùng khi nội dung cần thở (cảnh báo, xác nhận, kết quả), không nhồi ngang. */
export function Cot({ children, khoang = "3" }: { children: ReactNode; khoang?: Khoang }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: `var(--sp-${khoang})` }}>
      {children}
    </div>
  );
}

/** Chữ phụ (mô tả, ghi chú, trạng thái). Gom cỡ chữ + màu về token, thôi tô trong features/. */
export function ChuPhu({
  children,
  nhan = false,
}: {
  children: ReactNode;
  /** `true` = nhạt hơn nữa (ghi chú thứ yếu). */
  nhan?: boolean;
}) {
  return (
    <span
      style={{
        fontSize: "var(--fs-sm)",
        color: nhan ? "var(--text-tertiary)" : "var(--text-secondary)",
      }}
    >
      {children}
    </span>
  );
}

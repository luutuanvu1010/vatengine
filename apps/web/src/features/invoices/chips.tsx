// Chip trạng thái/chiều. NGUYÊN TẮC BẰNG CHỨNG (B1): mã chưa kiểm chứng → nền TRUNG TÍNH +
// "(chưa rõ)", KHÔNG tô đỏ/xanh gợi nghĩa. Nhãn lấy từ `statusLabels` (→ `@vat/domain`),
// không gõ chuỗi rời tại đây. Chiều/nguồn là enum cố định.
import { labelChieu, labelNguon, labelTthai, labelTtxly } from "../../lib/statusLabels";
import type { Chieu, Nguon } from "../../types/api";

function Chip({ text, bg, fg, title }: { text: string; bg: string; fg: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        padding: "2px var(--sp-2)",
        borderRadius: "var(--radius-pill)",
        background: bg,
        color: fg,
        fontSize: "var(--fs-xs)",
        fontWeight: "var(--fw-semibold)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

/** Mã `tthai` DUY NHẤT được tô màu "tốt": 1 = hóa đơn gốc còn nguyên hiệu lực (QĐ-11).
 * Mã 2–5 mô tả một hóa đơn đã bị thay thế/điều chỉnh hoặc sinh ra để sửa hóa đơn khác —
 * đó là việc cần rà soát, không phải tin tốt; tô `--success-*` (nghĩa: số dương / trạng
 * thái tốt, `07-DESIGN_TOKENS`) sẽ đọc sai nghiệp vụ. Đây là quyết định TRÌNH BÀY, cố ý
 * để ở tầng chip chứ không đẩy vào `@vat/domain` (miền không biết về màu). */
const TTHAI_TO_MAU_TOT = 1;

/** Trạng thái hóa đơn (tthai). Chỉ mã 1 (Gốc) xanh nhẹ; còn lại trung tính (QĐ-11). */
export function TthaiChip({ code }: { code: number | null }) {
  const { text, verified } = labelTthai(code);
  if (code === TTHAI_TO_MAU_TOT) {
    return <Chip text={text} bg="var(--success-50)" fg="var(--success-700)" />;
  }
  return (
    <Chip
      text={text}
      bg="var(--neutral-chip-bg)"
      fg="var(--neutral-chip-fg)"
      title={verified ? undefined : "Mã trạng thái chưa được kiểm chứng"}
    />
  );
}

/** Trạng thái xử lý (ttxly) — chưa mã nào kiểm chứng → luôn trung tính. */
export function TtxlyChip({ code }: { code: number | null }) {
  const { text } = labelTtxly(code);
  return (
    <Chip
      text={text}
      bg="var(--neutral-chip-bg)"
      fg="var(--neutral-chip-fg)"
      title="Mã trạng thái chưa được kiểm chứng"
    />
  );
}

/** Chiều: Mua vào (xanh dương) / Bán ra (xanh lá). */
export function ChieuChip({ chieu }: { chieu: Chieu }) {
  if (chieu === "purchase")
    return <Chip text={labelChieu(chieu)} bg="var(--info-50)" fg="var(--info-700)" />;
  return <Chip text={labelChieu(chieu)} bg="var(--success-50)" fg="var(--success-700)" />;
}

/** Nguồn: HĐĐT thường / Máy tính tiền (nhãn text nhẹ). */
export function NguonLabel({ nguon }: { nguon: Nguon }) {
  return (
    <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>
      {labelNguon(nguon)}
    </span>
  );
}

// U32 — khối danh tính pháp nhân, dùng chung cho mọi màn cần hiển thị (hiện: Tổng quan).
// Đọc TOÀN BỘ nội dung từ `lib/orgInfo.ts` — không nhúng chuỗi trực tiếp vào JSX.
// Bám design token (`styles/tokens.css`): không hardcode màu/cỡ chữ (tokens.css:1-3).
import { Card } from "../../components/ui/primitives";
import { ORG } from "../../lib/orgInfo";

const nhan: React.CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const than: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-sm)",
  lineHeight: "var(--lh-body)",
  color: "var(--text-secondary)",
};

export function OrgIdentity() {
  return (
    <Card>
      <div style={{ display: "grid", gap: "var(--sp-3)" }}>
        <span style={nhan}>Về {ORG.sanPham}</span>

        <p style={than}>
          <strong style={{ color: "var(--text-primary)" }}>{ORG.sanPham}</strong> là dự án cộng đồng
          của {ORG.congTy}.
        </p>

        {/* Địa chỉ dùng <address> — phần tử ngữ nghĩa cho thông tin liên hệ của pháp nhân. */}
        <address style={{ ...than, fontStyle: "normal" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Địa chỉ: </span>
          {ORG.diaChi}
        </address>

        <p
          style={{
            ...than,
            paddingTop: "var(--sp-3)",
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-tertiary)",
            fontSize: "var(--fs-xs)",
          }}
        >
          {ORG.haTang}.
        </p>
      </div>
    </Card>
  );
}

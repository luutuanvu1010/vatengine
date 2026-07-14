// Bảng hóa đơn = EXPORT_COLUMNS (packages/export/src/columns.ts) — KHÔNG bịa cột. Tiền
// định dạng chuỗi (không float), căn phải, tabular. Ngày giờ VN. ttxly & tthai TÁCH riêng
// (mã), chip trung tính khi chưa kiểm chứng (B1). Gồm dvtte (Tiền tệ) + nguon (M1).
import { Link } from "react-router-dom";
import { formatDateVN, formatMoney } from "../../lib/format";
import type { InvoiceRow } from "../../types/api";
import { ChieuChip, NguonLabel, TthaiChip, TtxlyChip } from "./chips";

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--sp-3)",
  fontSize: "var(--fs-xs)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};
const thRight: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = {
  padding: "var(--sp-3)",
  fontSize: "var(--fs-sm)",
  borderBottom: "1px solid var(--border-subtle)",
  verticalAlign: "top",
};
const tdMoney: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
};
const sub: React.CSSProperties = { color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" };

export function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
        <thead>
          <tr>
            <th style={th}>Ngày lập</th>
            <th style={th}>Ký hiệu · Số HĐ</th>
            <th style={th}>Người bán</th>
            <th style={th}>Người mua</th>
            <th style={thRight}>Chưa thuế</th>
            <th style={thRight}>Tiền thuế</th>
            <th style={thRight}>Tổng TT</th>
            <th style={th}>Tiền tệ</th>
            <th style={th}>TT xử lý</th>
            <th style={th}>TT hóa đơn</th>
            <th style={th}>Chiều</th>
            <th style={th}>Nguồn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>{formatDateVN(r.tdlap)}</td>
              <td style={td}>
                <Link
                  to={`/invoices/${r.id}`}
                  style={{ fontWeight: "var(--fw-semibold)", color: "var(--info-700)" }}
                >
                  {r.shdon}
                </Link>
                <div style={sub}>
                  {r.khmshdon}
                  {r.khhdon}
                </div>
              </td>
              <td style={td}>
                <div>{r.nbten ?? "—"}</div>
                <div style={sub}>{r.nbmst}</div>
              </td>
              <td style={td}>
                <div>{r.nmten ?? "—"}</div>
                <div style={sub}>{r.nmmst ?? "—"}</div>
              </td>
              <td style={tdMoney} className="tabular">
                {formatMoney(r.tgtcthue)}
              </td>
              <td style={tdMoney} className="tabular">
                {formatMoney(r.tgtthue)}
              </td>
              <td style={{ ...tdMoney, fontWeight: "var(--fw-bold)" }} className="tabular">
                {formatMoney(r.tgtttbso)}
              </td>
              <td style={td}>{r.dvtte ?? "—"}</td>
              <td style={td}>
                <TtxlyChip code={r.ttxly} />
              </td>
              <td style={td}>
                <TthaiChip code={r.tthai} />
              </td>
              <td style={td}>
                <ChieuChip chieu={r.chieu} />
              </td>
              <td style={td}>
                <NguonLabel nguon={r.nguon} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

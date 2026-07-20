// Bảng hóa đơn = EXPORT_COLUMNS (packages/export/src/columns.ts) — KHÔNG bịa cột,
// NGOẠI LỆ (quyết định chủ dự án 2026-07-17, thay U23-A): 2 cột tóm tắt dòng hàng
// "Hàng hóa, dịch vụ" + "Số lượng" (tenHangDau/soDongHang/tongSoLuong từ listInvoices)
// chỉ có trên UI, chưa vào file xuất (xuất đã có khối "Chi tiết dòng hàng" riêng). Tiền
// định dạng chuỗi (không float), căn phải, tabular. Ngày giờ VN. ttxly & tthai TÁCH riêng
// (mã), chip trung tính khi chưa kiểm chứng (B1). Gồm dvtte (Tiền tệ) + nguon (M1).
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatDateVN, formatMoney } from "../../lib/format";
import type { InvoiceListRow } from "../../types/api";
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

// U30 — cột chọn dòng. `selectedIds` là state của TRANG (không localStorage: lựa chọn là
// dữ liệu tenant, không được sót lại sau khi đổi phiên — multi-tenant.md H-B.3).
export interface InvoiceSelectionProps {
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  /** Chọn/bỏ chọn TOÀN BỘ các dòng đang hiển thị (trang hiện tại). */
  onTogglePage: (ids: string[], checked: boolean) => void;
}

const thCheck: React.CSSProperties = { ...th, width: 36, paddingRight: 0 };
const tdCheck: React.CSSProperties = { ...td, width: 36, paddingRight: 0 };

/** Ô header tri-state: rỗng / indeterminate (chọn một phần) / checked (cả trang).
 * `indeterminate` chỉ đặt được qua DOM, không có thuộc tính JSX tương ứng. */
function HeaderCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label="Chọn tất cả hóa đơn trong trang"
      onChange={(e) => onChange(e.target.checked)}
      style={{ cursor: "pointer" }}
    />
  );
}

export function InvoiceTable({
  rows,
  selection,
}: { rows: InvoiceListRow[]; selection?: InvoiceSelectionProps }) {
  const pageIds = rows.map((r) => r.id);
  const soDaChonTrongTrang = selection
    ? pageIds.filter((id) => selection.selectedIds.has(id)).length
    : 0;
  const caTrang = pageIds.length > 0 && soDaChonTrongTrang === pageIds.length;
  const motPhan = soDaChonTrongTrang > 0 && !caTrang;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
        <thead>
          <tr>
            {selection ? (
              <th style={thCheck}>
                <HeaderCheckbox
                  checked={caTrang}
                  indeterminate={motPhan}
                  onChange={(c) => selection.onTogglePage(pageIds, c)}
                />
              </th>
            ) : null}
            <th style={th}>Ngày lập</th>
            <th style={th}>Ký hiệu · Số HĐ</th>
            <th style={th}>Người bán</th>
            <th style={th}>Người mua</th>
            <th style={th}>Hàng hóa, dịch vụ</th>
            <th style={thRight}>Số lượng</th>
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
              {selection ? (
                <td style={tdCheck}>
                  <input
                    type="checkbox"
                    checked={selection.selectedIds.has(r.id)}
                    // Nhãn mang số HĐ để người dùng trình đọc màn hình biết đang chọn dòng nào.
                    aria-label={`Chọn hóa đơn ${r.shdon}`}
                    onChange={() => selection.onToggle(r.id)}
                    style={{ cursor: "pointer" }}
                  />
                </td>
              ) : null}
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
              <td style={td}>
                {r.tenHangDau ? (
                  <>
                    <div>{r.tenHangDau}</div>
                    {r.soDongHang > 1 && <div style={sub}>+{r.soDongHang - 1} dòng khác</div>}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td style={tdMoney} className="tabular">
                {r.tongSoLuong ?? "—"}
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

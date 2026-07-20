// Bảng hóa đơn = EXPORT_COLUMNS (packages/export/src/columns.ts) — KHÔNG bịa cột,
// NGOẠI LỆ (quyết định chủ dự án 2026-07-17, thay U23-A): 2 cột tóm tắt dòng hàng
// "Hàng hóa, dịch vụ" + "Số lượng" (hangHoa/soDongHang từ listInvoices)
// chỉ có trên UI, chưa vào file xuất (xuất đã có khối "Chi tiết dòng hàng" riêng). Tiền
// định dạng chuỗi (không float), căn phải, tabular. Ngày giờ VN. ttxly & tthai TÁCH riêng
// (mã), chip trung tính khi chưa kiểm chứng (B1). Gồm dvtte (Tiền tệ) + nguon (M1).
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatDateVN, formatMoney } from "../../lib/format";
import type { InvoiceListRow, InvoiceSort, SortBy } from "../../types/api";
import { ColumnMenu, type LoaiLoc } from "./ColumnMenu";

// Giá trị hợp lệ do server định nghĩa (INVOICE_DIRECTIONS / INVOICE_SOURCES) — không bịa.
const CHIEU_CHON = [
  ["purchase", "Mua vào"],
  ["sold", "Bán ra"],
] as const;
const NGUON_CHON = [
  ["normal", "HĐĐT thường"],
  ["sco", "Máy tính tiền"],
] as const;
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

// Danh sách mặt hàng trong ô: đánh số để đọc nhanh khi hóa đơn nhiều dòng, giới hạn bề
// rộng để cột không kéo dãn cả bảng khi tên hàng dài.
const dsHang: React.CSSProperties = {
  margin: 0,
  paddingLeft: "var(--sp-4)",
  maxWidth: 320,
  display: "grid",
  gap: "2px",
};
const mucHang: React.CSSProperties = { lineHeight: "var(--lh-body)" };
// Cột số lượng: bỏ dấu chấm đầu dòng và canh phải, nhưng GIỮ NGUYÊN thứ tự/khoảng cách
// dòng của cột tên hàng để hai cột đọc ngang hàng nhau.
const dsSoLuong: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: "2px",
};

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

// U31 — cấu hình lọc/sắp xếp cho từng cột. Trang cha truyền vào; bảng chỉ hiển thị.
export interface ColumnOpsProps {
  sort: InvoiceSort;
  onSort: (by: SortBy, dir: "asc" | "desc") => void;
  /** Giá trị lọc hiện tại theo khóa cột (rỗng = không lọc). */
  giaTriLoc: (khoa: string) => string;
  onLoc: (khoa: string, giaTri: string) => void;
}

/** Bọc nhãn cột + menu tùy chọn. Không có `ops` (vd dùng ở màn khác) → chỉ hiện nhãn. */
function ThMenu({
  nhan,
  khoa,
  sortBy,
  loaiLoc = "none",
  chonLua,
  ops,
  style,
}: {
  nhan: string;
  khoa?: string;
  sortBy?: SortBy;
  loaiLoc?: LoaiLoc;
  chonLua?: ReadonlyArray<readonly [string, string]>;
  ops?: ColumnOpsProps;
  style: React.CSSProperties;
}) {
  if (!ops) return <th style={style}>{nhan}</th>;
  return (
    <th style={style}>
      {nhan}
      <ColumnMenu
        nhan={nhan}
        sortBy={sortBy}
        loaiLoc={loaiLoc}
        chonLua={chonLua}
        giaTri={khoa ? ops.giaTriLoc(khoa) : ""}
        dangSap={sortBy && ops.sort.sortBy === sortBy ? (ops.sort.sortDir ?? "desc") : null}
        onSap={(dir) => sortBy && ops.onSort(sortBy, dir)}
        onLoc={(v) => khoa && ops.onLoc(khoa, v)}
      />
    </th>
  );
}

export function InvoiceTable({
  rows,
  selection,
  ops,
}: { rows: InvoiceListRow[]; selection?: InvoiceSelectionProps; ops?: ColumnOpsProps }) {
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
            <ThMenu nhan="Ngày lập" sortBy="tdlap" ops={ops} style={th} />
            <ThMenu
              nhan="Ký hiệu · Số HĐ"
              khoa="shdon"
              sortBy="shdon"
              loaiLoc="text"
              ops={ops}
              style={th}
            />
            <ThMenu
              nhan="Người bán"
              khoa="nbten"
              sortBy="nbten"
              loaiLoc="text"
              ops={ops}
              style={th}
            />
            <ThMenu
              nhan="Người mua"
              khoa="nmten"
              sortBy="nmten"
              loaiLoc="text"
              ops={ops}
              style={th}
            />
            {/* Hai cột tóm tắt dòng hàng là sub-select — lọc/sắp theo chúng cần HAVING
                hoặc bảng dẫn xuất, để ngoài U31 (xem U31-plan §1). */}
            <th style={th}>Hàng hóa, dịch vụ</th>
            <th style={thRight}>Số lượng</th>
            <ThMenu nhan="Chưa thuế" sortBy="tgtcthue" ops={ops} style={thRight} />
            <ThMenu nhan="Tiền thuế" sortBy="tgtthue" ops={ops} style={thRight} />
            <ThMenu
              nhan="Tổng TT"
              khoa="ttbso"
              sortBy="tgtttbso"
              loaiLoc="range"
              ops={ops}
              style={thRight}
            />
            <th style={th}>Tiền tệ</th>
            <th style={th}>TT xử lý</th>
            <th style={th}>TT hóa đơn</th>
            <ThMenu
              nhan="Chiều"
              khoa="chieu"
              sortBy="chieu"
              loaiLoc="select"
              chonLua={CHIEU_CHON}
              ops={ops}
              style={th}
            />
            <ThMenu
              nhan="Nguồn"
              khoa="nguon"
              sortBy="nguon"
              loaiLoc="select"
              chonLua={NGUON_CHON}
              ops={ops}
              style={th}
            />
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
              {/* Nghiệm thu 2026-07-20: hiện ĐỦ mọi mặt hàng, và mỗi mặt hàng phải nằm
                  NGANG HÀNG với số lượng của chính nó. Trước đây cột số lượng chỉ có một
                  con số TỔNG đặt cạnh tên dòng đầu → đọc thành "xăng E10 có 62.925 lít"
                  trong khi đó là tổng của hai mặt hàng. */}
              <td style={td}>
                {r.hangHoa.length > 0 ? (
                  <ol style={dsHang}>
                    {r.hangHoa.map((h, i) => (
                      <li key={`${r.id}-${i}-${h.ten ?? ""}`} style={mucHang}>
                        {h.ten ?? "—"}
                      </li>
                    ))}
                  </ol>
                ) : (
                  "—"
                )}
              </td>
              <td style={tdMoney}>
                {r.hangHoa.length > 0 ? (
                  <>
                    <ol style={dsSoLuong}>
                      {r.hangHoa.map((h, i) => (
                        <li key={`${r.id}-sl-${i}-${h.ten ?? ""}`} style={mucHang}>
                          <span className="tabular">{h.sluong ?? "—"}</span>
                          {h.dvtinh ? <span style={sub}> {h.dvtinh}</span> : null}
                        </li>
                      ))}
                    </ol>
                    {/* KHÔNG cộng tổng số lượng (quyết định chủ dự án 2026-07-20): các mặt
                        hàng có ĐƠN VỊ khác nhau (Lít, Kg, cái) nên tổng của chúng là con
                        số vô nghĩa — cộng 42 lít với 3 cái không ra đại lượng nào cả. */}
                  </>
                ) : (
                  "—"
                )}
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

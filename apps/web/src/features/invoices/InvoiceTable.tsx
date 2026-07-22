// Bảng hóa đơn — CỘT DẪN XUẤT TỪ REGISTRY miền hoá đơn (`@vat/domain`, U-K2). Nhãn, kiểu ô
// lọc, lựa chọn enum, khả năng sắp và căn lề đều khai MỘT LẦN trong Registry; file này chỉ
// còn lo CÁCH VẼ ô (renderer), không lo cột nào/nhãn gì. Nhờ vậy nhãn bảng và nhãn file
// xuất không thể trôi khỏi nhau nữa (gốc của lệch "Tổng TT" vs "Tổng thanh toán").
//
// Tiền định dạng chuỗi (không float), căn phải, tabular. Ngày giờ VN. ttxly & tthai TÁCH
// riêng (mã), chip trung tính khi chưa kiểm chứng (B1).
import { type InvoiceField, fieldsForTable } from "@vat/domain";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatDateVN, formatMoney } from "../../lib/format";
import type { InvoiceListRow, InvoiceSort, SortBy } from "../../types/api";
import { ColumnMenu, type LoaiLoc } from "./ColumnMenu";
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

// ----------------------- Dẫn xuất bề mặt bảng từ Registry ----------------------- //

/** Cột bảng, đúng thứ tự Registry. Tính một lần: `fieldsForTable()` là hàm thuần trên hằng
 * số nên không cần tính lại mỗi lần render. */
const COT_BANG: readonly InvoiceField[] = fieldsForTable();

/** `locDuoc` (Registry, ngôn ngữ miền) → `LoaiLoc` (ngôn ngữ của ColumnMenu). Registry nói
 * "lọc bằng danh sách chọn" (`enum`); widget gọi nó là `select` — ánh xạ ở ranh giới, không
 * bắt Registry nói theo tên widget. */
function loaiLocCua(f: InvoiceField): LoaiLoc {
  if (f.locDuoc === "text") return "text";
  if (f.locDuoc === "range") return "range";
  if (f.locDuoc === "enum") return "select";
  return "none";
}

/** Cột chỉ mời SẮP khi Registry cho phép trên bảng (`sapTrenBang`). Cố ý HẸP HƠN allowlist
 * server (`sapDuoc`): dvtte/ttxly/tthai server sắp được nhưng bảng chưa phơi menu — giữ
 * nguyên hành vi có từ U31, bật thêm là quyết định sản phẩm riêng. */
function khoaSapCua(f: InvoiceField): SortBy | undefined {
  return f.sapTrenBang ? (f.key as SortBy) : undefined;
}

const sub2: React.CSSProperties = sub;

/** Ô của một cột. Registry quyết ĐỌC TRƯỜNG NÀO; đây quyết VẼ RA SAO (link, chip, danh
 * sách, tiền). Thiếu renderer cho một field `tren.bang` ⇒ ô trống thay vì nổ giữa bảng —
 * nhưng đó là lưới an toàn, KHÔNG phải trạng thái chấp nhận được: test khoá bất biến "mọi
 * cột Registry đều có renderer" nên thêm cột mà quên ô sẽ đỏ ngay. */
export const O_BANG: Record<string, (r: InvoiceListRow) => React.ReactNode> = {
  tdlap: (r) => formatDateVN(r.tdlap),
  shdon: (r) => (
    <>
      <Link
        to={`/invoices/${r.id}`}
        style={{ fontWeight: "var(--fw-semibold)", color: "var(--info-700)" }}
      >
        {r.shdon}
      </Link>
      <div style={sub2}>
        {r.khmshdon}
        {r.khhdon}
      </div>
    </>
  ),
  nbten: (r) => (
    <>
      <div>{r.nbten ?? "—"}</div>
      <div style={sub2}>{r.nbmst}</div>
    </>
  ),
  nmten: (r) => (
    <>
      <div>{r.nmten ?? "—"}</div>
      <div style={sub2}>{r.nmmst ?? "—"}</div>
    </>
  ),
  // Nghiệm thu 2026-07-20: hiện ĐỦ mọi mặt hàng, và mỗi mặt hàng phải nằm NGANG HÀNG với số
  // lượng của chính nó. Trước đây cột số lượng chỉ có một con số TỔNG đặt cạnh tên dòng đầu
  // → đọc thành "xăng E10 có 62.925 lít" trong khi đó là tổng của hai mặt hàng.
  hangHoa: (r) =>
    r.hangHoa.length > 0 ? (
      <ol style={dsHang}>
        {r.hangHoa.map((h, i) => (
          <li key={`${r.id}-${i}-${h.ten ?? ""}`} style={mucHang}>
            {h.ten ?? "—"}
          </li>
        ))}
      </ol>
    ) : (
      "—"
    ),
  soLuong: (r) =>
    r.hangHoa.length > 0 ? (
      // KHÔNG cộng tổng số lượng (quyết định chủ dự án 2026-07-20): các mặt hàng có ĐƠN VỊ
      // khác nhau (Lít, Kg, cái) nên tổng của chúng là con số vô nghĩa.
      <ol style={dsSoLuong}>
        {r.hangHoa.map((h, i) => (
          <li key={`${r.id}-sl-${i}-${h.ten ?? ""}`} style={mucHang}>
            {/* KHÔNG kèm đơn vị (2026-07-21) — chỉ hiện số. Đơn vị vẫn còn ở cột ĐVT của
                sheet dòng hàng trong file xuất. */}
            <span className="tabular">{h.sluong ?? "—"}</span>
          </li>
        ))}
      </ol>
    ) : (
      "—"
    ),
  tgtcthue: (r) => <span className="tabular">{formatMoney(r.tgtcthue)}</span>,
  tgtthue: (r) => <span className="tabular">{formatMoney(r.tgtthue)}</span>,
  tgtttbso: (r) => (
    <span className="tabular" style={{ fontWeight: "var(--fw-bold)" }}>
      {formatMoney(r.tgtttbso)}
    </span>
  ),
  dvtte: (r) => r.dvtte ?? "—",
  ttxly: (r) => <TtxlyChip code={r.ttxly} />,
  tthai: (r) => <TthaiChip code={r.tthai} />,
  chieu: (r) => <ChieuChip chieu={r.chieu} />,
  nguon: (r) => <NguonLabel nguon={r.nguon} />,
};

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
            {/* Cột sinh từ Registry: thứ tự, nhãn, kiểu ô lọc, lựa chọn enum, khả năng sắp
                và căn lề đều đọc từ `fieldsForTable()`. Cột KHÔNG lọc/sắp được (tóm tắt dòng
                hàng — sub-select cần HAVING; trạng thái; tiền tệ) tự nhiên không có menu vì
                Registry không khai `locDuoc`/`sapTrenBang` cho chúng. */}
            {COT_BANG.map((f) => (
              <ThMenu
                key={f.key}
                nhan={f.nhanNgan ?? f.nhan}
                khoa={f.locDuoc ? (f.khoaLoc ?? f.key) : undefined}
                sortBy={khoaSapCua(f)}
                loaiLoc={loaiLocCua(f)}
                chonLua={f.enum}
                ops={f.sapTrenBang || f.locDuoc ? ops : undefined}
                style={f.canh === "phai" ? thRight : th}
              />
            ))}
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
              {COT_BANG.map((f) => (
                <td key={f.key} style={f.canh === "phai" ? tdMoney : td}>
                  {O_BANG[f.key]?.(r) ?? null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

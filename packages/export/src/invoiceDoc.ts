// Render MỘT hóa đơn (header EXPORT_COLUMNS + dòng hàng dong_hang_hoa) sang XML/HTML tự
// dựng (U22, dùng chung cho xml.zip/html.zip). KHÔNG phải file gốc của GDT (đó là U23,
// khác nguồn — file gốc CHƯA có, cần probe endpoint thật). Đây là biểu diễn dựng từ dữ
// liệu ĐÃ đồng bộ, một hóa đơn = một file trong zip. Escape mọi giá trị người bán/mua vì
// đến từ GDT (bên thứ ba, không tin cậy) — chống phá cấu trúc XML/HTML.
import { EXPORT_COLUMNS, cellFor } from "./columns";
import type { ExportRow } from "./rows";

export interface InvoiceLineLike {
  stt: number | null;
  ten: string | null;
  dvtinh: string | null;
  sluong: string | null;
  dgia: string | null;
  thtien: string | null;
  ltsuat: string | null;
  tsuat: string | null;
  tsuatTien: string | null;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellText(row: ExportRow, key: (typeof EXPORT_COLUMNS)[number]["key"]): string {
  const col = EXPORT_COLUMNS.find((c) => c.key === key);
  if (!col) return "";
  const cell = cellFor(col, row);
  return cell.t === "blank" ? "" : cell.v;
}

const LINE_FIELDS: Array<keyof InvoiceLineLike> = [
  "stt",
  "ten",
  "dvtinh",
  "sluong",
  "dgia",
  "thtien",
  "ltsuat",
  "tsuat",
  "tsuatTien",
];

function lineValue(line: InvoiceLineLike, field: keyof InvoiceLineLike): string {
  const v = line[field];
  return v === null || v === undefined ? "" : String(v);
}

/** Sinh XML một hóa đơn: <HoaDon> gồm mọi cột EXPORT_COLUMNS + <DongHangHoa><Dong>…</Dong></DongHangHoa>. */
export function invoiceToXml(row: ExportRow, lines: InvoiceLineLike[]): string {
  const header = EXPORT_COLUMNS.map(
    (col) => `<${col.key}>${escapeXml(cellText(row, col.key))}</${col.key}>`,
  ).join("");
  const linesXml =
    lines.length === 0
      ? "<DongHangHoa/>"
      : `<DongHangHoa>${lines
          .map(
            (line) =>
              `<Dong>${LINE_FIELDS.map((f) => `<${f}>${escapeXml(lineValue(line, f))}</${f}>`).join(
                "",
              )}</Dong>`,
          )
          .join("")}</DongHangHoa>`;
  return `<?xml version="1.0" encoding="UTF-8"?><HoaDon>${header}${linesXml}</HoaDon>`;
}

/** Sinh HTML một hóa đơn: bảng header + bảng dòng hàng (xem trong trình duyệt/mở offline). */
export function invoiceToHtml(row: ExportRow, lines: InvoiceLineLike[]): string {
  const headerRows = EXPORT_COLUMNS.map(
    (col) =>
      `<tr><th>${escapeHtml(col.label)}</th><td>${escapeHtml(cellText(row, col.key))}</td></tr>`,
  ).join("");
  const lineHeader =
    "<tr><th>STT</th><th>Tên</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th>" +
    "<th>Thuế suất</th><th>Tiền thuế</th></tr>";
  const lineRows = lines
    .map(
      (line) =>
        `<tr>${LINE_FIELDS.map((f) => `<td>${escapeHtml(lineValue(line, f))}</td>`).join("")}</tr>`,
    )
    .join("");
  const title = escapeHtml(`${cellText(row, "khhdon")}-${cellText(row, "shdon")}`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><table>${headerRows}</table><table>${lineHeader}${lineRows}</table></body></html>`;
}

/** Tên file (không phần mở rộng) trong zip: "<khhdon>-<shdon>", ký tự không hợp lệ → "_". */
export function invoiceFileStem(row: ExportRow): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
  const khhdon = sanitize(cellText(row, "khhdon") || row.id);
  const shdon = sanitize(cellText(row, "shdon") || row.id);
  return `${khhdon}-${shdon}`;
}

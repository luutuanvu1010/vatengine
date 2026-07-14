// Encoder xlsx (U7) — TỰ DỰNG SpreadsheetML (OOXML) + đóng gói bằng fflate.zipSync.
// Vì sao không thư viện write/read sẵn: cần kiểm soát numFmt "#,##0" của ô tiền để ĐỌC LẠI
// xác minh (tiêu chí lõi U7) và giữ giá trị tiền CHÍNH XÁC (nhét chuỗi thẳng vào <v>, không
// ép float). Chỉ dùng fflate.zipSync (sync, THUẦN JS — không Node builtin) + TextEncoder
// (chuẩn Web) → chạy cả Node lẫn workerd. numFmt tiền: id 164 = "#,##0" (tự định nghĩa để
// đọc lại được mã định dạng, không dựa builtin ngầm).
import type { HoaDonRow } from "@vat/query";
import { zipSync } from "fflate";
import { EXPORT_COLUMNS, cellFor } from "./columns";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const enc = new TextEncoder();

// Chỉ số style trong cellXfs: 0 mặc định · 1 header đậm · 2 tiền (#,##0).
const STYLE_HEADER = "1";
const STYLE_MONEY = "2";

function colLetter(n1: number): string {
  let n = n1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineStrCell(ref: string, text: string, style?: string): string {
  const s = style ? ` s="${style}"` : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function headerRowXml(): string {
  const cells = EXPORT_COLUMNS.map((col, j) =>
    inlineStrCell(`${colLetter(j + 1)}1`, col.label, STYLE_HEADER),
  ).join("");
  return `<row r="1">${cells}</row>`;
}

function dataRowXml(row: HoaDonRow, rowIndex: number): string {
  const cells = EXPORT_COLUMNS.map((col, j) => {
    const ref = `${colLetter(j + 1)}${rowIndex}`;
    const cell = cellFor(col, row);
    if (cell.t === "blank") return `<c r="${ref}"/>`;
    if (cell.t === "num") {
      const s = col.kind === "money" ? ` s="${STYLE_MONEY}"` : "";
      return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
    }
    return inlineStrCell(ref, cell.v);
  }).join("");
  return `<row r="${rowIndex}">${cells}</row>`;
}

function worksheetXml(rowsBody: string): string {
  // Freeze dòng tiêu đề (pane) để cuộn vẫn thấy cột.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rowsBody}</sheetData></worksheet>`;
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  "</Types>";

const RELS_ROOT =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  "</Relationships>";

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="HoaDon" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  "</Relationships>";

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

function zipXlsx(sheetBody: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": enc.encode(CONTENT_TYPES),
    "_rels/.rels": enc.encode(RELS_ROOT),
    "xl/workbook.xml": enc.encode(WORKBOOK),
    "xl/_rels/workbook.xml.rels": enc.encode(WORKBOOK_RELS),
    "xl/styles.xml": enc.encode(STYLES),
    "xl/worksheets/sheet1.xml": enc.encode(worksheetXml(sheetBody)),
  });
}

/** Encode CẢ tập hóa đơn thành bytes xlsx (test + kết xuất nhỏ). */
export function toXlsx(rows: HoaDonRow[]): Uint8Array {
  let body = headerRowXml();
  rows.forEach((row, i) => {
    body += dataRowXml(row, i + 2);
  });
  return zipXlsx(body);
}

/** Encode từ các LÔ (async) — route dùng để tiêu thụ generator keyset lô-by-lô, KHÔNG
 * gom toàn bộ hàng ORM vào RAM cùng lúc. File zip cuối vẫn phải hiện hữu để ghi R2
 * (bản chất zip); kết xuất cực lớn nên đi CSV stream hoặc nền U9. */
export async function toXlsxFromBatches(batches: AsyncIterable<HoaDonRow[]>): Promise<Uint8Array> {
  let body = headerRowXml();
  let r = 2;
  for await (const batch of batches) {
    for (const row of batch) body += dataRowXml(row, r++);
  }
  return zipXlsx(body);
}

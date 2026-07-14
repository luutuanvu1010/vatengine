import type { HoaDonRow } from "@vat/query";
import { zipSync } from "fflate";
// Encoder xlsx (U7 + tổng quát hóa U11) — TỰ DỰNG SpreadsheetML (OOXML) + đóng gói bằng
// fflate.zipSync. Vì sao không thư viện write/read sẵn: cần kiểm soát numFmt "#,##0" của ô
// tiền để ĐỌC LẠI xác minh (tiêu chí lõi) và giữ giá trị tiền CHÍNH XÁC (nhét chuỗi thẳng
// vào <v>, không ép float). Chỉ dùng fflate.zipSync (sync, THUẦN JS — không Node builtin) +
// TextEncoder (chuẩn Web) → chạy cả Node lẫn workerd. Core `*For(columns, sheetName)` chạy
// trên RenderColumn[] để dùng chung mẫu native (U7) LẪN profile kế toán (U11).
import { type RenderColumn, nativeRenderColumns } from "./columns";

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

function headerRowXml(columns: RenderColumn[]): string {
  const cells = columns
    .map((col, j) => inlineStrCell(`${colLetter(j + 1)}1`, col.header, STYLE_HEADER))
    .join("");
  return `<row r="1">${cells}</row>`;
}

function dataRowXml(columns: RenderColumn[], row: HoaDonRow, rowIndex: number): string {
  const cells = columns
    .map((col, j) => {
      const ref = `${colLetter(j + 1)}${rowIndex}`;
      const cell = col.cell(row);
      if (cell.t === "blank") return `<c r="${ref}"/>`;
      if (cell.t === "num") {
        const s = col.money ? ` s="${STYLE_MONEY}"` : "";
        return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
      }
      return inlineStrCell(ref, cell.v);
    })
    .join("");
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

// Tên sheet do caller quyết (U7 = "HoaDon"; profile kế toán có tên riêng). Escape để tên
// chứa ký tự đặc biệt không phá XML.
function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  "</Relationships>";

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

function zipXlsx(sheetBody: string, sheetName: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": enc.encode(CONTENT_TYPES),
    "_rels/.rels": enc.encode(RELS_ROOT),
    "xl/workbook.xml": enc.encode(workbookXml(sheetName)),
    "xl/_rels/workbook.xml.rels": enc.encode(WORKBOOK_RELS),
    "xl/styles.xml": enc.encode(STYLES),
    "xl/worksheets/sheet1.xml": enc.encode(worksheetXml(sheetBody)),
  });
}

// ------------------------- Core tổng quát (RenderColumn[]) ------------------------- //

/** Encode CẢ tập thành bytes xlsx theo tập cột render + tên sheet. */
export function toXlsxFor(
  columns: RenderColumn[],
  rows: HoaDonRow[],
  sheetName: string,
): Uint8Array {
  let body = headerRowXml(columns);
  rows.forEach((row, i) => {
    body += dataRowXml(columns, row, i + 2);
  });
  return zipXlsx(body, sheetName);
}

/** Encode từ các LÔ (async) theo tập cột render — tiêu thụ generator keyset lô-by-lô,
 * KHÔNG gom toàn bộ hàng ORM vào RAM cùng lúc. */
export async function toXlsxFromBatchesFor(
  columns: RenderColumn[],
  batches: AsyncIterable<HoaDonRow[]>,
  sheetName: string,
): Promise<Uint8Array> {
  let body = headerRowXml(columns);
  let r = 2;
  for await (const batch of batches) {
    for (const row of batch) body += dataRowXml(columns, row, r++);
  }
  return zipXlsx(body, sheetName);
}

// ------------------------- Wrapper native (U7, giữ API cũ) ------------------------- //

const NATIVE = nativeRenderColumns();
const NATIVE_SHEET = "HoaDon";

/** Encode CẢ tập hóa đơn thành bytes xlsx (mẫu native). */
export function toXlsx(rows: HoaDonRow[]): Uint8Array {
  return toXlsxFor(NATIVE, rows, NATIVE_SHEET);
}

/** Encode native từ các LÔ (async) — route dùng để tiêu thụ generator keyset lô-by-lô. */
export function toXlsxFromBatches(batches: AsyncIterable<HoaDonRow[]>): Promise<Uint8Array> {
  return toXlsxFromBatchesFor(NATIVE, batches, NATIVE_SHEET);
}

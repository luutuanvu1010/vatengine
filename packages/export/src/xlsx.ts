import { zipSync } from "fflate";
// Encoder xlsx (U7 + tổng quát hóa U11) — TỰ DỰNG SpreadsheetML (OOXML) + đóng gói bằng
// fflate.zipSync. Vì sao không thư viện write/read sẵn: cần kiểm soát numFmt "#,##0" của ô
// tiền để ĐỌC LẠI xác minh (tiêu chí lõi) và giữ giá trị tiền CHÍNH XÁC (nhét chuỗi thẳng
// vào <v>, không ép float). Chỉ dùng fflate.zipSync (sync, THUẦN JS — không Node builtin) +
// TextEncoder (chuẩn Web) → chạy cả Node lẫn workerd. Core `*For(columns, sheetName)` chạy
// trên RenderColumn[] để dùng chung mẫu native (U7) LẪN profile kế toán (U11).
import {
  EMPTY_LINE,
  LINE_DETAIL_SECTION,
  type RenderColumn,
  flatRenderColumns,
  lineInvoiceContext,
  nativeRenderColumns,
} from "./columns";
import type { InvoiceLineLike } from "./invoiceDoc";
import type { ExportRow } from "./rows";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const enc = new TextEncoder();

// Chỉ số style trong cellXfs: 0 mặc định · 1 header đậm · 2 tiền (#,##0) ·
// 3 ô NHIỀU DÒNG (wrapText) — ô liệt kê hàng hóa; thiếu style này Excel dồn tất cả
// mặt hàng thành một dòng dài, người dùng tưởng mất dữ liệu · 4 phần trăm (numFmt CUSTOM
// 165="0%", U35b) — giá trị ô giữ nguyên phân số (0.08), Excel tự nhân 100 khi hiển thị.
const STYLE_HEADER = "1";
const STYLE_MONEY = "2";
const STYLE_WRAP = "3";
const STYLE_PERCENT = "4";

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

function headerRowXml<T>(columns: RenderColumn<T>[]): string {
  const cells = columns
    .map((col, j) => inlineStrCell(`${colLetter(j + 1)}1`, col.header, STYLE_HEADER))
    .join("");
  return `<row r="1">${cells}</row>`;
}

function dataRowXml<T>(columns: RenderColumn<T>[], row: T, rowIndex: number): string {
  const cells = columns
    .map((col, j) => {
      const ref = `${colLetter(j + 1)}${rowIndex}`;
      const cell = col.cell(row);
      if (cell.t === "blank") return `<c r="${ref}"/>`;
      if (cell.t === "num") {
        const s = col.money ? ` s="${STYLE_MONEY}"` : "";
        return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
      }
      if (cell.t === "percent") {
        return `<c r="${ref}" s="${STYLE_PERCENT}"><v>${cell.v}</v></c>`;
      }
      // Ô chứa xuống dòng (danh sách hàng hóa) phải bật wrapText, nếu không Excel dồn
      // mọi mặt hàng vào một dòng và người dùng tưởng chỉ có một mặt hàng.
      return inlineStrCell(ref, cell.v, cell.v.includes("\n") ? STYLE_WRAP : undefined);
    })
    .join("");
  return `<row r="${rowIndex}">${cells}</row>`;
}

interface SheetOpts {
  /** `<cols>` (độ rộng cột) — chèn TRƯỚC <sheetData> đúng thứ tự schema OOXML. */
  colsXml?: string;
  /** Đóng băng thêm cột đầu (STT) ngoài dòng tiêu đề. */
  freezeFirstCol?: boolean;
}

/** `<cols>` từ RenderColumn.width — cột không khai width thì bỏ qua (Excel dùng mặc định). */
function colsXmlFrom<T>(columns: RenderColumn<T>[]): string {
  const cols = columns
    .map((c, j) =>
      c.width ? `<col min="${j + 1}" max="${j + 1}" width="${c.width}" customWidth="1"/>` : "",
    )
    .join("");
  return cols ? `<cols>${cols}</cols>` : "";
}

function worksheetXml(rowsBody: string, opts?: SheetOpts): string {
  // Freeze dòng tiêu đề (+ cột STT nếu có) để cuộn vẫn thấy tiêu đề/định danh.
  const pane = opts?.freezeFirstCol
    ? `<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>`
    : `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>${opts?.colsXml ?? ""}<sheetData>${rowsBody}</sheetData></worksheet>`;
}

// Content_Types cho workbook N sheet: 1 Override cho mỗi worksheet + workbook + styles.
function contentTypesXml(sheetCount: number): string {
  let sheets = "";
  for (let i = 1; i <= sheetCount; i++) {
    sheets += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

const RELS_ROOT =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  "</Relationships>";

// Tên sheet do caller quyết (U7 = "HoaDon"; U23-B thêm "Chi tiết dòng hàng"; profile kế toán
// có tên riêng). Escape để tên chứa ký tự đặc biệt không phá XML. Mỗi sheet r:id="rId{i}".
function workbookXml(sheetNames: string[]): string {
  const sheets = sheetNames
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

// Quan hệ workbook: rId1..rIdN → các worksheet, rId{N+1} → styles (giữ đúng thứ tự cũ cho
// trường hợp 1 sheet: rId1→sheet1, rId2→styles).
function workbookRelsXml(sheetCount: number): string {
  let rels = "";
  for (let i = 1; i <= sheetCount; i++) {
    rels += `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`;
  }
  rels += `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

// Header (style 1): đậm + NỀN XÁM NHẠT (#F1F3F4, khớp --surface-muted; OOXML cần ARGB) + căn
// giữa. fill index 2 = solid xám nhạt. Money (2) = #,##0. Wrap (3) = ô liệt kê hàng hóa.
// Percent (4) = numFmt CUSTOM 165="0%" (U35b) — KHÔNG dùng built-in 10 ("0.00%", thừa 2 số
// thập phân so với yêu cầu "8%").
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F3F4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

// Đóng gói N sheet — NGUỒN OOXML DUY NHẤT (zipXlsx 1-sheet chỉ là trường hợp đặc biệt).
function zipXlsxMulti(sheets: { name: string; body: string; opts?: SheetOpts }[]): Uint8Array {
  const parts: Record<string, Uint8Array> = {
    "[Content_Types].xml": enc.encode(contentTypesXml(sheets.length)),
    "_rels/.rels": enc.encode(RELS_ROOT),
    "xl/workbook.xml": enc.encode(workbookXml(sheets.map((s) => s.name))),
    "xl/_rels/workbook.xml.rels": enc.encode(workbookRelsXml(sheets.length)),
    "xl/styles.xml": enc.encode(STYLES),
  };
  sheets.forEach((s, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = enc.encode(worksheetXml(s.body, s.opts));
  });
  return zipSync(parts);
}

function zipXlsx(sheetBody: string, sheetName: string, opts?: SheetOpts): Uint8Array {
  return zipXlsxMulti([{ name: sheetName, body: sheetBody, opts }]);
}

// ------------------------- Core tổng quát (RenderColumn[]) ------------------------- //

/** Encode CẢ tập thành bytes xlsx theo tập cột render + tên sheet. */
export function toXlsxFor(
  columns: RenderColumn[],
  rows: ExportRow[],
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
  batches: AsyncIterable<ExportRow[]>,
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
export function toXlsx(rows: ExportRow[]): Uint8Array {
  return toXlsxFor(NATIVE, rows, NATIVE_SHEET);
}

/** Encode native từ các LÔ (async) — route dùng để tiêu thụ generator keyset lô-by-lô. */
export function toXlsxFromBatches(batches: AsyncIterable<ExportRow[]>): Promise<Uint8Array> {
  return toXlsxFromBatchesFor(NATIVE, batches, NATIVE_SHEET);
}

/**
 * Encode native + THÊM sheet "Chi tiết dòng hàng" (U23-B). Một pass qua generator hóa đơn:
 * sheet 1 = header hóa đơn (như native); sheet 2 = mỗi dòng hàng 1 row, khóa `shdon` liên
 * kết về hóa đơn. `fetchLines` (tái dùng fetchLinesForInvoices, lọc tenant_id tường minh)
 * nạp dòng hàng theo lô — cách ly tenant nằm ở đây. Tiền/số lượng nhét thẳng vào <v> (chuỗi,
 * không ép float). Hóa đơn không có dòng hàng → không sinh row (map.get ?? []).
 */
export async function toXlsxWithLinesFromBatches(
  invoiceBatches: AsyncIterable<ExportRow[]>,
  fetchLines: (ids: string[]) => Promise<Map<string, InvoiceLineLike[]>>,
  cols?: readonly string[] | null,
): Promise<Uint8Array> {
  // MỘT sheet phẳng (2026-07-21): mỗi mặt hàng một dòng, kèm đủ ngữ cảnh hóa đơn. Hóa đơn
  // chưa có dòng hàng vẫn xuất MỘT dòng (EMPTY_LINE) — không được biến mất khỏi file.
  // `cols` = cột người dùng chọn (rỗng → 16 mặc định). `sttFile` = STT chạy toàn file 1..N.
  const columns = flatRenderColumns(cols);
  let body = headerRowXml(columns);
  let r = 2;
  let stt = 0;
  for await (const batch of invoiceBatches) {
    const linesByInvoice = await fetchLines(batch.map((x) => x.id));
    for (const inv of batch) {
      const ctx = lineInvoiceContext(inv);
      const lines = linesByInvoice.get(inv.id) ?? [];
      if (lines.length === 0) {
        body += dataRowXml(columns, { ...EMPTY_LINE, ...ctx, sttFile: ++stt }, r++);
      } else {
        for (const l of lines) body += dataRowXml(columns, { ...l, ...ctx, sttFile: ++stt }, r++);
      }
    }
  }
  // "Dễ nhìn": độ rộng cột theo loại + đóng băng dòng tiêu đề & cột STT (freeze cột đầu).
  return zipXlsx(body, LINE_DETAIL_SECTION, {
    colsXml: colsXmlFrom(columns),
    freezeFirstCol: true,
  });
}

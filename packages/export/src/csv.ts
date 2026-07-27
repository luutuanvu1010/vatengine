// Encoder CSV (U7 + tổng quát hóa U11). RFC-4180: phân cách phẩy, escape nháy kép
// (double-up), CRLF; BOM UTF-8 để Excel mở đúng tiếng Việt. Tiền giữ CHUỖI numeric nguyên
// bản (máy đọc được, không tách nghìn). Core `*For(columns)` chạy trên RenderColumn[] để
// dùng chung cho mẫu native (U7) LẪN profile kế toán (U11) — một encoder duy nhất. Hàm
// cấp thấp (header/row string) để route stream lô-by-lô vào R2, KHÔNG gom cả tập vào RAM.
import {
  EMPTY_LINE,
  type LineDetailRow,
  type RenderColumn,
  flatRenderColumns,
  lineInvoiceContext,
  nativeRenderColumns,
  nhanTram,
} from "./columns";
import type { InvoiceLineLike } from "./invoiceDoc";
import type { ExportRow } from "./rows";

export const CSV_BOM = "﻿";

function escapeField(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Chống CSV/Excel formula injection: ô VĂN BẢN bắt đầu bằng ký tự kích hoạt công thức có
// thể bị Excel/Sheets diễn giải khi mở CSV (không có kiểu). Dữ liệu tên người bán/mua
// (`nbten`/`nmten`) đến từ GDT — bên thứ ba — nên phải coi là không tin cậy. Chèn `'` để ép
// văn bản. CHỈ áp cho ô văn bản; ô SỐ (money/int) giữ nguyên (số âm "-5000" là số hợp lệ,
// không phải công thức). xlsx KHÔNG cần: ô văn bản là `t="inlineStr"` — Excel không diễn giải.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
export function guardCsvText(s: string): string {
  return FORMULA_TRIGGER.test(s) ? `'${s}` : s;
}

function toLine(fields: string[]): string {
  return `${fields.map(escapeField).join(",")}\r\n`;
}

// ------------------------- Core tổng quát (RenderColumn[]) ------------------------- //

/** Dòng tiêu đề (nhãn cột) KHÔNG kèm BOM — dùng cho khối thứ 2 trong cùng file (U23-B). */
export function csvHeaderRowFor<T>(columns: RenderColumn<T>[]): string {
  return toLine(columns.map((c) => c.header));
}

/** Dòng tiêu đề (header) cho một tập cột render. Kèm BOM để đặt ở đầu file. */
export function csvHeaderLineFor<T>(columns: RenderColumn<T>[]): string {
  return CSV_BOM + csvHeaderRowFor(columns);
}

/** Một dòng dữ liệu CSV cho một hàng theo tập cột render. */
export function csvRowLineFor<T>(columns: RenderColumn<T>[], row: T): string {
  const fields = columns.map((col) => {
    const cell = col.cell(row);
    if (cell.t === "blank") return "";
    if (cell.t === "num") return cell.v;
    if (cell.t === "percent") return `${nhanTram(cell.v)}%`;
    return guardCsvText(cell.v); // ô văn bản: chống formula injection
  });
  return toLine(fields);
}

/** Encode CẢ tập thành bytes theo tập cột render (test + kết xuất nhỏ). */
export function toCsvFor<T>(columns: RenderColumn<T>[], rows: T[]): Uint8Array {
  let out = csvHeaderLineFor(columns);
  for (const row of rows) out += csvRowLineFor(columns, row);
  return new TextEncoder().encode(out);
}

/** Stream CSV từ các LÔ (async) theo tập cột render → ReadableStream để ghi thẳng R2,
 * KHÔNG giữ cả file trong bộ nhớ Worker. Encode lười từng lô theo yêu cầu của consumer. */
export function csvStreamFor<T>(
  columns: RenderColumn<T>[],
  batches: AsyncIterable<T[]>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = batches[Symbol.asyncIterator]();
  let headerSent = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        controller.enqueue(encoder.encode(csvHeaderLineFor(columns)));
        headerSent = true;
        return;
      }
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      let chunk = "";
      for (const row of value) chunk += csvRowLineFor(columns, row);
      if (chunk) controller.enqueue(encoder.encode(chunk));
    },
  });
}

// ------------------------- Wrapper native (U7, giữ API cũ) ------------------------- //

const NATIVE = nativeRenderColumns();

/** Dòng tiêu đề (nhãn cột) mẫu native. Kèm BOM. */
export function csvHeaderLine(): string {
  return csvHeaderLineFor(NATIVE);
}

/** Một dòng dữ liệu CSV cho một hóa đơn (mẫu native). */
export function csvRowLine(row: ExportRow): string {
  return csvRowLineFor(NATIVE, row);
}

/** Encode CẢ tập thành bytes CSV (mẫu native). Kết xuất lớn nên dùng csvStream. */
export function toCsv(rows: ExportRow[]): Uint8Array {
  return toCsvFor(NATIVE, rows);
}

/** Stream CSV native từ các LÔ (async) → ReadableStream để ghi thẳng R2. */
export function csvStream(batches: AsyncIterable<ExportRow[]>): ReadableStream<Uint8Array> {
  return csvStreamFor(NATIVE, batches);
}

/**
 * Stream CSV MỘT khối phẳng (2026-07-21): mỗi mặt hàng một dòng, kèm đủ ngữ cảnh hóa đơn.
 * Một pass qua generator hóa đơn + `fetchLines` theo lô (tenant_id lọc tường minh trong
 * fetchLines) → KHÔNG gom cả tập vào RAM. Hóa đơn chưa có dòng hàng vẫn xuất MỘT dòng
 * (EMPTY_LINE) — không mất khỏi file. Tiền/số lượng giữ CHUỖI nguyên bản (không ép float).
 */
export function csvStreamWithLines(
  invoiceBatches: AsyncIterable<ExportRow[]>,
  fetchLines: (ids: string[]) => Promise<Map<string, InvoiceLineLike[]>>,
  cols?: readonly string[] | null,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const columns = flatRenderColumns(cols);
  const it = invoiceBatches[Symbol.asyncIterator]();
  let daGuiHeader = false;
  let stt = 0; // STT chạy TOÀN FILE 1..N — bền qua stream lô-by-lô.
  return new ReadableStream<Uint8Array>({
    // MỖI lần pull PHẢI enqueue hoặc close (nếu không, Web Streams không gọi lại pull → treo).
    // Vòng for cho một pull vượt qua các lô rỗng cho tới khi enqueue được một chunk / đóng.
    async pull(controller) {
      for (;;) {
        if (!daGuiHeader) {
          daGuiHeader = true;
          controller.enqueue(encoder.encode(csvHeaderLineFor(columns)));
          return;
        }
        const { value, done } = await it.next();
        if (done) {
          controller.close();
          return;
        }
        const linesByInvoice = await fetchLines(value.map((r) => r.id));
        let chunk = "";
        for (const inv of value) {
          const ctx = lineInvoiceContext(inv);
          const lines = linesByInvoice.get(inv.id) ?? [];
          if (lines.length === 0) {
            chunk += csvRowLineFor(columns, { ...EMPTY_LINE, ...ctx, sttFile: ++stt });
          } else {
            for (const l of lines) {
              const detailRow: LineDetailRow = { ...l, ...ctx, sttFile: ++stt };
              chunk += csvRowLineFor(columns, detailRow);
            }
          }
        }
        if (chunk) {
          controller.enqueue(encoder.encode(chunk));
          return;
        }
        // lô rỗng → đọc lô kế
      }
    },
  });
}

import type { HoaDonRow } from "@vat/query";
// Encoder CSV (U7 + tổng quát hóa U11). RFC-4180: phân cách phẩy, escape nháy kép
// (double-up), CRLF; BOM UTF-8 để Excel mở đúng tiếng Việt. Tiền giữ CHUỖI numeric nguyên
// bản (máy đọc được, không tách nghìn). Core `*For(columns)` chạy trên RenderColumn[] để
// dùng chung cho mẫu native (U7) LẪN profile kế toán (U11) — một encoder duy nhất. Hàm
// cấp thấp (header/row string) để route stream lô-by-lô vào R2, KHÔNG gom cả tập vào RAM.
import {
  LINE_DETAIL_SECTION,
  type LineDetailRow,
  type RenderColumn,
  lineDetailRenderColumns,
  nativeRenderColumns,
} from "./columns";
import type { InvoiceLineLike } from "./invoiceDoc";

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
const LINE_COLS = lineDetailRenderColumns();

/** Dòng tiêu đề (nhãn cột) mẫu native. Kèm BOM. */
export function csvHeaderLine(): string {
  return csvHeaderLineFor(NATIVE);
}

/** Một dòng dữ liệu CSV cho một hóa đơn (mẫu native). */
export function csvRowLine(row: HoaDonRow): string {
  return csvRowLineFor(NATIVE, row);
}

/** Encode CẢ tập thành bytes CSV (mẫu native). Kết xuất lớn nên dùng csvStream. */
export function toCsv(rows: HoaDonRow[]): Uint8Array {
  return toCsvFor(NATIVE, rows);
}

/** Stream CSV native từ các LÔ (async) → ReadableStream để ghi thẳng R2. */
export function csvStream(batches: AsyncIterable<HoaDonRow[]>): ReadableStream<Uint8Array> {
  return csvStreamFor(NATIVE, batches);
}

/**
 * Stream CSV native + THÊM khối "Chi tiết dòng hàng" (U23-B) trong CÙNG file. Khối 1 = hóa
 * đơn (như csvStream); dòng trống ngăn cách; khối 2 = nhãn khối + header dòng hàng + mỗi dòng
 * hàng 1 row (khóa `shdon`). Hai generator độc lập trên CÙNG bộ lọc: khối 1 duyệt hết trước,
 * rồi khối 2 duyệt lại + `fetchLines` theo lô (tenant_id lọc tường minh trong fetchLines) →
 * KHÔNG gom cả tập vào RAM. Tiền/số lượng giữ CHUỖI nguyên bản (không ép float).
 */
export function csvStreamWithLines(
  invoiceBatches: AsyncIterable<HoaDonRow[]>,
  lineBatches: AsyncIterable<HoaDonRow[]>,
  fetchLines: (ids: string[]) => Promise<Map<string, InvoiceLineLike[]>>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const invIt = invoiceBatches[Symbol.asyncIterator]();
  const lineIt = lineBatches[Symbol.asyncIterator]();
  type Phase = "invHeader" | "invRows" | "sep" | "lineHeader" | "lineRows" | "closed";
  let phase: Phase = "invHeader";
  return new ReadableStream<Uint8Array>({
    // MỖI lần pull PHẢI enqueue hoặc close (nếu chỉ đổi phase mà không enqueue, Web Streams
    // KHÔNG tự gọi lại pull → treo). Vòng while cho một pull tiến qua các bước không-enqueue
    // (đổi phase / lô rỗng) cho tới khi enqueue được một chunk hoặc đóng stream.
    async pull(controller) {
      for (;;) {
        switch (phase) {
          case "invHeader":
            controller.enqueue(encoder.encode(csvHeaderLineFor(NATIVE)));
            phase = "invRows";
            return;
          case "invRows": {
            const { value, done } = await invIt.next();
            if (done) {
              phase = "sep";
              break; // tiếp vòng: xử lý "sep" ngay (không để pull rỗng)
            }
            let chunk = "";
            for (const row of value) chunk += csvRowLineFor(NATIVE, row);
            if (chunk) {
              controller.enqueue(encoder.encode(chunk));
              return;
            }
            break; // lô rỗng: đọc lô kế
          }
          case "sep":
            // Dòng trống ngăn cách + nhãn khối (KHÔNG BOM giữa file).
            controller.enqueue(encoder.encode(`\r\n${toLine([LINE_DETAIL_SECTION])}`));
            phase = "lineHeader";
            return;
          case "lineHeader":
            controller.enqueue(encoder.encode(csvHeaderRowFor(LINE_COLS)));
            phase = "lineRows";
            return;
          case "lineRows": {
            const { value, done } = await lineIt.next();
            if (done) {
              phase = "closed";
              controller.close();
              return;
            }
            const linesByInvoice = await fetchLines(value.map((r) => r.id));
            let chunk = "";
            for (const inv of value) {
              for (const l of linesByInvoice.get(inv.id) ?? []) {
                const detailRow: LineDetailRow = { ...l, shdon: inv.shdon };
                chunk += csvRowLineFor(LINE_COLS, detailRow);
              }
            }
            if (chunk) {
              controller.enqueue(encoder.encode(chunk));
              return;
            }
            break; // lô không có dòng hàng: đọc lô kế
          }
          default:
            controller.close();
            return;
        }
      }
    },
  });
}

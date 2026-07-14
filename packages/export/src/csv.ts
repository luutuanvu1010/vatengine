// Encoder CSV (U7). RFC-4180: phân cách phẩy, escape nháy kép (double-up), CRLF; BOM
// UTF-8 để Excel mở đúng tiếng Việt. Tiền giữ CHUỖI numeric nguyên bản (máy đọc được,
// không tách nghìn). Hàm cấp thấp (header/row string) để route stream lô-by-lô vào R2 —
// KHÔNG buộc gom cả tập vào RAM (tiêu chí "file lớn không giữ trong bộ nhớ Worker").
import type { HoaDonRow } from "@vat/query";
import { EXPORT_COLUMNS, cellFor } from "./columns";

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

/** Dòng tiêu đề (nhãn cột). Kèm BOM để đặt ở đầu file. */
export function csvHeaderLine(): string {
  return CSV_BOM + toLine(EXPORT_COLUMNS.map((c) => c.label));
}

/** Một dòng dữ liệu CSV cho một hóa đơn. */
export function csvRowLine(row: HoaDonRow): string {
  const fields = EXPORT_COLUMNS.map((col) => {
    const cell = cellFor(col, row);
    if (cell.t === "blank") return "";
    if (cell.t === "num") return cell.v;
    return guardCsvText(cell.v); // ô văn bản: chống formula injection
  });
  return toLine(fields);
}

/** Tiện ích: encode CẢ tập thành bytes (dùng cho test + kết xuất nhỏ). Kết xuất lớn nên
 * dùng csvStream để stream thẳng vào R2. */
export function toCsv(rows: HoaDonRow[]): Uint8Array {
  let out = csvHeaderLine();
  for (const row of rows) out += csvRowLine(row);
  return new TextEncoder().encode(out);
}

/** Stream CSV từ các LÔ (async) → ReadableStream để ghi thẳng R2, KHÔNG giữ cả file trong
 * bộ nhớ Worker (tiêu chí "file lớn" — checklist U7). Encode lười từng lô theo yêu cầu của
 * consumer (R2.put). */
export function csvStream(batches: AsyncIterable<HoaDonRow[]>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = batches[Symbol.asyncIterator]();
  let headerSent = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        controller.enqueue(encoder.encode(csvHeaderLine()));
        headerSent = true;
        return;
      }
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      let chunk = "";
      for (const row of value) chunk += csvRowLine(row);
      if (chunk) controller.enqueue(encoder.encode(chunk));
    },
  });
}

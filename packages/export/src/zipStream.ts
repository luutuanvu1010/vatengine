// Đóng gói zip STREAMING (U22): mỗi hóa đơn → một file trong zip, tiêu thụ generator
// keyset lô-by-lô (iterateInvoices) + tra dòng hàng theo lô (fetchLinesForInvoices),
// KHÔNG gom cả tập vào RAM. Dùng fflate.Zip + ZipPassThrough (lưu trữ, không nén — nội
// dung đã là văn bản gọn, ưu tiên tốc độ/đơn giản hơn tỉ lệ nén trên Workers).
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import type { InvoiceLineLike } from "./invoiceDoc";
import { invoiceFileStem } from "./invoiceDoc";
import type { ExportRow } from "./rows";

export type InvoiceRenderer = (
  row: ExportRow,
  lines: InvoiceLineLike[],
) => { content: string; ext: string };

export type FetchLines = (ids: string[]) => Promise<Map<string, InvoiceLineLike[]>>;

/** Tên file duy nhất trong zip: đụng tên (cùng khhdon+shdon, hiếm) → hậu tố "-2", "-3"… */
function uniqueName(stem: string, ext: string, used: Map<string, number>): string {
  const count = used.get(stem) ?? 0;
  used.set(stem, count + 1);
  return count === 0 ? `${stem}.${ext}` : `${stem}-${count}.${ext}`;
}

export function zipStreamFromBatches(
  batches: AsyncIterable<ExportRow[]>,
  fetchLines: FetchLines,
  render: InvoiceRenderer,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, data, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        if (data && data.length > 0) controller.enqueue(data);
        if (final) controller.close();
      });
      const used = new Map<string, number>();
      try {
        for await (const batch of batches) {
          if (batch.length === 0) continue;
          const linesByInvoice = await fetchLines(batch.map((r) => r.id));
          for (const row of batch) {
            const { content, ext } = render(row, linesByInvoice.get(row.id) ?? []);
            const name = uniqueName(invoiceFileStem(row), ext, used);
            const file = new ZipPassThrough(name);
            zip.add(file);
            file.push(strToU8(content), true);
          }
        }
        zip.end();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

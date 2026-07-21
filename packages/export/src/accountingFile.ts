// U11 — Ánh xạ hóa đơn ĐÃ đồng bộ → file định dạng nhập liệu phần mềm kế toán theo PROFILE.
// Dựng TRÊN encoder csv/xlsx tổng quát (`*For`) — một encoder duy nhất, không nhân đôi logic
// mã hóa. Profile → RenderColumn (áp `transform` sau cellFor). Streaming lô-by-lô để route
// tiêu thụ generator keyset (KHÔNG gom cả tập vào RAM — giới hạn Workers).
import { type RenderColumn, cellFor } from "./columns";
import { csvStreamFor, toCsvFor } from "./csv";
import type { ExportFormat } from "./formats";
import type { MappingProfile } from "./profiles/types";
import type { ExportRow } from "./rows";
import { toXlsxFor, toXlsxFromBatchesFor } from "./xlsx";

/** Profile → cột render: ô = cellFor(source,kind) rồi áp transform (nếu có). */
export function profileRenderColumns(profile: MappingProfile): RenderColumn[] {
  return profile.columns.map((col) => ({
    header: col.header,
    money: col.kind === "money",
    cell: (row: ExportRow) => {
      const base = cellFor({ key: col.source, label: col.header, kind: col.kind }, row);
      return col.transform ? col.transform(base, row) : base;
    },
  }));
}

/** Encode CẢ tập hóa đơn thành file định dạng đích (test + kết xuất nhỏ). */
export function toAccountingFile(
  rows: ExportRow[],
  profile: MappingProfile,
  format: ExportFormat,
): Uint8Array {
  const cols = profileRenderColumns(profile);
  return format === "csv" ? toCsvFor(cols, rows) : toXlsxFor(cols, rows, profile.sheetName);
}

/** Stream CSV theo profile từ các LÔ (async) → ghi thẳng R2, không giữ cả file trong RAM. */
export function accountingCsvStream(
  profile: MappingProfile,
  batches: AsyncIterable<ExportRow[]>,
): ReadableStream<Uint8Array> {
  return csvStreamFor(profileRenderColumns(profile), batches);
}

/** Encode xlsx theo profile từ các LÔ (async) — tiêu thụ generator keyset lô-by-lô. */
export function accountingXlsxFromBatches(
  profile: MappingProfile,
  batches: AsyncIterable<ExportRow[]>,
): Promise<Uint8Array> {
  return toXlsxFromBatchesFor(profileRenderColumns(profile), batches, profile.sheetName);
}

// U11 — Mô hình PROFILE ánh xạ sang định dạng nhập liệu phần mềm kế toán. Tách CƠ CHẾ
// (types + engine, dựng/test được ngay) khỏi GIÁ TRỊ ĐỊNH DẠNG THẬT (layout cột của từng
// phần mềm — CHƯA KIỂM CHỨNG, chờ template chính thức; xem registry.ts + contract test).
import type { HoaDonRow } from "@vat/query";
import type { ColumnKind, ExportCell } from "../columns";

/** Một cột ĐÍCH trong định dạng nhập liệu của phần mềm kế toán. Ánh xạ TỪ một trường hóa
 * đơn (`source`) sang tên cột đích (`header`); `kind` điều khiển định dạng (text/date/
 * money/int); `transform` tùy biến ô (ví dụ đổi ngày sang dd/MM/yyyy theo phần mềm đích). */
export interface MappingColumn {
  header: string;
  source: keyof HoaDonRow;
  kind: ColumnKind;
  transform?: (cell: ExportCell, row: HoaDonRow) => ExportCell;
}

/** Một PROFILE = định dạng nhập liệu của một phần mềm kế toán (hoặc fixture tham chiếu).
 * `verified=false` ⇒ CHƯA KIỂM CHỨNG (layout chưa có bằng chứng) → KHÔNG được phục vụ qua
 * registry/route cho tới khi có template thật (Nguyên tắc bằng chứng). */
export interface MappingProfile {
  id: string;
  label: string;
  sheetName: string;
  verified: boolean;
  columns: readonly MappingColumn[];
}

// U11 — PROFILE THAM CHIẾU (fixture). Đây là định dạng của CHÍNH ta, đặc tả ĐẦY ĐỦ, dùng
// để CHỨNG MINH cơ chế ánh xạ (header đổi tên, chọn/đổi thứ tự cột, transform định dạng,
// ô tiền numFmt). Nó KHÔNG mô phỏng phần mềm kế toán thật nào — các profile thật
// (MISA/FAST/SmartKTSC) là CHƯA KIỂM CHỨNG cho tới khi có template (xem registry.ts).
import type { ExportCell } from "../columns";
import type { MappingProfile } from "./types";

/** Đổi ngày từ chuỗi native "YYYY-MM-DD HH:mm:ss" (cellFor kind=date) sang "dd/MM/yyyy"
 * — minh hoạ transform định dạng đích khác native. Ô không phải chuỗi ngày → giữ nguyên. */
export function toDdMmYyyy(cell: ExportCell): ExportCell {
  if (cell.t !== "str") return cell;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(cell.v);
  return m ? { t: "str", v: `${m[3]}/${m[2]}/${m[1]}` } : cell;
}

export const REFERENCE_PROFILE: MappingProfile = {
  id: "reference",
  label: "Hồ sơ tham chiếu (fixture kiểm chứng cơ chế)",
  sheetName: "SoKeToan",
  verified: true,
  columns: [
    { header: "Ngay hach toan", source: "tdlap", kind: "date", transform: toDdMmYyyy },
    { header: "So hoa don", source: "shdon", kind: "text" },
    { header: "Ky hieu", source: "khhdon", kind: "text" },
    { header: "MST ben ban", source: "nbmst", kind: "text" },
    { header: "Ten ben ban", source: "nbten", kind: "text" },
    { header: "Tien hang", source: "tgtcthue", kind: "money" },
    { header: "Tien thue GTGT", source: "tgtthue", kind: "money" },
    { header: "Tong thanh toan", source: "tgtttbso", kind: "money" },
  ],
};

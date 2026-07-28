// Nhãn trạng thái ttxly/tthai cho tầng trình bày.
//
// U36.1 — bảng nhãn `tthai` KHÔNG còn ở đây: nó chuyển về `@vat/domain` để web và file kết
// xuất dùng CHUNG một nguồn (`ui.md`, "Nhãn một nguồn"). File này chỉ còn là lớp mỏng khoác
// thêm quy ước riêng của bảng/chip: `null` hiện "—" (ô trống có dấu), trong khi file xuất
// hiện chuỗi rỗng. Mọi logic fallback "<mã> (chưa rõ)" nằm MỘT NƠI: `nhanTthai()`.
//
// NGUYÊN TẮC BẰNG CHỨNG vẫn giữ nguyên cho `ttxly`: chưa mã nào kiểm chứng (biên bản
// docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md §4) → bảng dưới GIỮ RỖNG.
import { daKiemChungTthai, nhanTthai } from "@vat/domain";

export interface StatusLabel {
  text: string;
  /** true CHỈ khi mã đã kiểm chứng bằng bằng chứng tái lập được. */
  verified: boolean;
}

// ttxly: CHƯA có mã nào kiểm chứng → không nhãn nào verified.
const TTXLY_VERIFIED: Record<number, string> = {};

function mapCode(code: number | null | undefined, table: Record<number, string>): StatusLabel {
  if (code === null || code === undefined) return { text: "—", verified: false };
  const label = table[code];
  if (label !== undefined) return { text: label, verified: true };
  return { text: `${code} (chưa rõ)`, verified: false };
}

/** Nhãn trạng thái hóa đơn (`tthai`) — dẫn xuất từ `@vat/domain`. */
export function labelTthai(code: number | null | undefined): StatusLabel {
  if (code === null || code === undefined) return { text: "—", verified: false };
  return { text: nhanTthai(code), verified: daKiemChungTthai(code) };
}

/** Nhãn trạng thái xử lý (`ttxly`). */
export function labelTtxly(code: number | null | undefined): StatusLabel {
  return mapCode(code, TTXLY_VERIFIED);
}

/** Enum chiều — cố định (BINDING_MAP §4.2). */
export function labelChieu(chieu: string): string {
  if (chieu === "purchase") return "Mua vào";
  if (chieu === "sold") return "Bán ra";
  return chieu;
}

/** Enum nguồn — cố định (BINDING_MAP §4.2). */
export function labelNguon(nguon: string): string {
  if (nguon === "normal") return "HĐĐT thường";
  if (nguon === "sco") return "Máy tính tiền";
  return nguon;
}
